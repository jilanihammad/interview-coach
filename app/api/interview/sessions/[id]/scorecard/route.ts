import { NextResponse } from "next/server";

import {
  addInterviewProviderUsage,
  addInterviewScore,
  getInterviewSessionBundle,
  updateInterviewSession,
} from "@/lib/db";
import {
  InterviewFeedbackSummary,
  InterviewScore,
  InterviewScoreDimension,
} from "@/lib/interview/types";
import {
  generateEvaluatorScorecardWithLlm,
  isInterviewLlmConfigured,
} from "@/lib/interview/llm";
import { logInterviewEvent } from "@/lib/interview/observability";
import { consumeRateLimit, getClientIp, readEnvInt } from "@/lib/interview/rate-limit";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DimensionScore = {
  dimension: InterviewScoreDimension;
  score: number;
  rationale: string;
  recommendedFix?: string;
};

const scorecardInFlight = new Set<string>();

const SCORECARD_RATE_LIMIT = readEnvInt("INTERVIEW_RATE_SCORECARD", 10);
const SCORECARD_RATE_WINDOW_MS = readEnvInt(
  "INTERVIEW_RATE_SCORECARD_WINDOW_MS",
  10 * 60 * 1000
);

const dimensionLabels: Record<InterviewScoreDimension, string> = {
  star_structure: "STAR structure",
  specificity: "specificity",
  clarity: "clarity",
  relevance: "relevance",
  leadership_impact: "leadership impact",
};

function avgWordCount(answers: string[]): number {
  if (!answers.length) return 0;
  const total = answers.reduce((sum, text) => sum + text.split(/\s+/).filter(Boolean).length, 0);
  return total / answers.length;
}

function computeScores(answers: string[]): DimensionScore[] {
  const joined = answers.join("\n").toLowerCase();
  const withNumbers = answers.filter((a) => /\d|%|percent|ms|x|kpi|metric/i.test(a)).length;
  const avgWords = avgWordCount(answers);

  const starHits = ["situation", "task", "action", "result"].reduce(
    (sum, word) => sum + (joined.includes(word) ? 1 : 0),
    0
  );

  const ownershipHits = (joined.match(/\bi\b|led|owned|drove|decided|influenced/g) || []).length;

  const starScore = Math.min(5, Math.max(1, starHits + 1));
  const specificityScore = Math.min(
    5,
    Math.max(1, Math.round((withNumbers / Math.max(answers.length, 1)) * 5))
  );
  const clarityScore =
    avgWords === 0 ? 1 : avgWords > 220 ? 2 : avgWords > 150 ? 3 : avgWords > 100 ? 4 : 5;
  const relevanceScore =
    answers.length === 0 ? 1 : joined.includes("because") || joined.includes("impact") ? 4 : 3;
  const leadershipScore = Math.min(
    5,
    Math.max(1, Math.round(ownershipHits / Math.max(answers.length, 1)))
  );

  return [
    {
      dimension: "star_structure",
      score: starScore,
      rationale: "Based on explicit STAR elements detected across your responses.",
      recommendedFix:
        "Use one sentence each for Situation and Task, then focus most time on Action + measurable Result.",
    },
    {
      dimension: "specificity",
      score: specificityScore,
      rationale: "Scored from presence of concrete numbers, metrics, and outcome signals.",
      recommendedFix: "Add at least one metric or quantifiable outcome to every answer.",
    },
    {
      dimension: "clarity",
      score: clarityScore,
      rationale: "Estimated from average answer length and directness.",
      recommendedFix: "Aim for 90-120 second answers with a clear opening point.",
    },
    {
      dimension: "relevance",
      score: relevanceScore,
      rationale: "Estimated from topical continuity and cause/effect framing.",
      recommendedFix: "Open with the direct answer, then provide context.",
    },
    {
      dimension: "leadership_impact",
      score: leadershipScore,
      rationale: "Scored from ownership and impact language in your responses.",
      recommendedFix: "Emphasize your specific decisions and how they changed outcomes.",
    },
  ];
}

function deriveSummary(
  scores: InterviewScore[],
  candidateAnswers: string[],
  avgResponseTimeSec: number,
  avgWordCountValue: number
): InterviewFeedbackSummary {
  const sortedByScoreDesc = [...scores].sort((a, b) => b.score - a.score);
  const sortedByScoreAsc = [...scores].sort((a, b) => a.score - b.score);

  const strengths = sortedByScoreDesc
    .slice(0, 2)
    .map((item) => `Strong ${dimensionLabels[item.dimension]} (${item.score}/5). ${item.rationale}`);

  const gaps = sortedByScoreAsc
    .slice(0, 2)
    .map(
      (item) =>
        `Missed opportunity in ${dimensionLabels[item.dimension]} (${item.score}/5). ${item.recommendedFix || item.rationale}`
    );

  const frameworkSuggestions: InterviewFeedbackSummary["frameworkSuggestions"] = [];

  if (sortedByScoreAsc[0]?.dimension === "star_structure") {
    frameworkSuggestions.push({
      name: "STAR",
      description: "Use clear Situation, Task, Action, Result sequencing for every story.",
      template: "Situation → Task → Action → Result (with one metric).",
    });
  }

  if (sortedByScoreAsc.some((s) => s.dimension === "specificity")) {
    frameworkSuggestions.push({
      name: "Metric-first wrap-up",
      description: "End every answer with quantified impact.",
      template: "Result sentence = metric changed + timeframe + business effect.",
    });
  }

  if (sortedByScoreAsc.some((s) => s.dimension === "leadership_impact")) {
    frameworkSuggestions.push({
      name: "Ownership framing",
      description: "Separate what you owned from team contribution.",
      template: "I owned X, partnered on Y, and drove Z outcome.",
    });
  }

  while (frameworkSuggestions.length < 2) {
    frameworkSuggestions.push({
      name: "Two-minute answer format",
      description: "Keep answers concise and interview-friendly.",
      template: "10s context → 60s action → 30s result → 20s reflection.",
    });
  }

  const focusAreas = sortedByScoreAsc.slice(0, 2).map((item) => ({
    area: `Improve ${dimensionLabels[item.dimension]}`,
    reason: item.recommendedFix || item.rationale,
    practice: `Rehearse 3 stories focused on ${dimensionLabels[item.dimension]} and record yourself before next mock interview.`,
  }));

  return {
    strengths,
    gaps,
    frameworkSuggestions: frameworkSuggestions.slice(0, 3),
    focusAreas,
    stats: {
      avgResponseTimeSec: Number(avgResponseTimeSec.toFixed(1)),
      avgWordCount: Number(avgWordCountValue.toFixed(1)),
      totalResponses: candidateAnswers.length,
    },
  };
}

function summaryFromLlmOrFallback(
  llmSummary: {
    strengths: string[];
    gaps: string[];
    frameworkSuggestions: InterviewFeedbackSummary["frameworkSuggestions"];
    focusAreas: InterviewFeedbackSummary["focusAreas"];
  },
  candidateAnswers: string[],
  avgResponseTimeSec: number,
  avgWordCountValue: number
): InterviewFeedbackSummary {
  const strengths = llmSummary.strengths.slice(0, 3);
  const gaps = llmSummary.gaps.slice(0, 3);

  const frameworkSuggestions =
    llmSummary.frameworkSuggestions.length > 0
      ? llmSummary.frameworkSuggestions.slice(0, 3)
      : [
          {
            name: "STAR",
            description: "Use clear Situation, Task, Action, Result sequencing for every story.",
            template: "Situation → Task → Action → Result (with one metric).",
          },
        ];

  const focusAreas =
    llmSummary.focusAreas.length > 0
      ? llmSummary.focusAreas.slice(0, 3)
      : [
          {
            area: "Improve answer specificity",
            reason: "Use more concrete details and measurable outcomes.",
            practice: "Rehearse each story with at least one metric and a concise result sentence.",
          },
        ];

  return {
    strengths,
    gaps,
    frameworkSuggestions,
    focusAreas,
    stats: {
      avgResponseTimeSec: Number(avgResponseTimeSec.toFixed(1)),
      avgWordCount: Number(avgWordCountValue.toFixed(1)),
      totalResponses: candidateAnswers.length,
    },
  };
}

export async function POST(request: Request, context: SessionRouteContext) {
  const { id } = await context.params;

  const clientIp = getClientIp(request);
  const rateLimit = consumeRateLimit(
    `scorecard:${clientIp}:${id}`,
    SCORECARD_RATE_LIMIT,
    SCORECARD_RATE_WINDOW_MS
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many scorecard requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSec),
        },
      }
    );
  }

  if (scorecardInFlight.has(id)) {
    return NextResponse.json({ error: "Scorecard generation in progress" }, { status: 409 });
  }

  scorecardInFlight.add(id);

  try {
    const bundle = getInterviewSessionBundle(id);

    if (!bundle) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    if (bundle.session.status === "in_progress") {
      return NextResponse.json(
        { error: "Interview still in progress" },
        { status: 409 }
      );
    }

    const candidateMessages = bundle.messages.filter((m) => m.role === "candidate");
    const candidateAnswers = candidateMessages.map((m) => m.content).filter(Boolean);

    if (!candidateAnswers.length) {
      return NextResponse.json(
        { error: "No candidate answers available to score" },
        { status: 400 }
      );
    }

    const durations = candidateMessages.map((m) => {
      const meta = (m.meta || {}) as Record<string, unknown>;
      const duration = Number(meta.responseDurationSec);
      if (Number.isFinite(duration) && duration > 0) return duration;

      const wordCount = m.content.split(/\s+/).filter(Boolean).length;
      return (wordCount / 130) * 60;
    });

    const wordCounts = candidateMessages.map(
      (m) => m.content.split(/\s+/).filter(Boolean).length
    );

    const avgResponseTimeSec =
      durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
    const avgWordCountValue =
      wordCounts.reduce((sum, value) => sum + value, 0) / Math.max(1, wordCounts.length);

    let savedScores = bundle.scores;
    let generated = false;
    let summary: InterviewFeedbackSummary;
    let scoringMeta:
      | {
          provider: string;
          model: string;
          fallbackUsed: boolean;
          latencyMs?: number;
          attempts?: number;
        }
      | null = null;

    if (savedScores.length === 0) {
      if (isInterviewLlmConfigured()) {
        try {
          const llmScorecard = await generateEvaluatorScorecardWithLlm({
            session: bundle.session,
            messages: bundle.messages,
          });

          savedScores = llmScorecard.scores.map((item) =>
            addInterviewScore(id, item.dimension, item.score, item.rationale, item.recommendedFix)
          );

          summary = summaryFromLlmOrFallback(
            llmScorecard.summary,
            candidateAnswers,
            avgResponseTimeSec,
            avgWordCountValue
          );
          scoringMeta = llmScorecard.meta;
          generated = true;

          addInterviewProviderUsage({
            sessionId: id,
            category: "llm",
            provider: llmScorecard.meta.provider,
            model: llmScorecard.meta.model,
            latencyMs: llmScorecard.meta.latencyMs,
            fallbackUsed: llmScorecard.meta.fallbackUsed,
            success: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("LLM evaluator failed, using deterministic score fallback", error);
          const scoresToSave = computeScores(candidateAnswers);
          savedScores = scoresToSave.map((item) =>
            addInterviewScore(id, item.dimension, item.score, item.rationale, item.recommendedFix)
          );
          summary = deriveSummary(
            savedScores,
            candidateAnswers,
            avgResponseTimeSec,
            avgWordCountValue
          );
          generated = true;

          addInterviewProviderUsage({
            sessionId: id,
            category: "llm",
            provider: "deterministic",
            model: "fallback",
            success: false,
            error: message,
          });
        }
      } else {
        const scoresToSave = computeScores(candidateAnswers);
        savedScores = scoresToSave.map((item) =>
          addInterviewScore(id, item.dimension, item.score, item.rationale, item.recommendedFix)
        );
        summary = deriveSummary(
          savedScores,
          candidateAnswers,
          avgResponseTimeSec,
          avgWordCountValue
        );
        generated = true;
      }
    } else {
      summary = deriveSummary(
        savedScores,
        candidateAnswers,
        avgResponseTimeSec,
        avgWordCountValue
      );
    }

    updateInterviewSession(id, {
      phase: "done",
      status: "completed",
      endedAt: bundle.session.endedAt ?? new Date().toISOString(),
    });

    logInterviewEvent("info", "scorecard_generated", {
      sessionId: id,
      generated,
      provider: scoringMeta?.provider || "deterministic",
      model: scoringMeta?.model || "fallback",
      fallbackUsed: scoringMeta?.fallbackUsed || false,
      clientIp,
    });

    return NextResponse.json({
      session: {
        ...bundle.session,
        status: "completed",
        phase: "done",
      },
      scores: savedScores,
      generated,
      summary,
      llm: scoringMeta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logInterviewEvent("error", "scorecard_error", {
      sessionId: id,
      error: message,
    });

    return NextResponse.json({ error: "Unable to generate scorecard" }, { status: 500 });
  } finally {
    scorecardInFlight.delete(id);
  }
}
