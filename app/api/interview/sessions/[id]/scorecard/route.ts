import { NextResponse } from "next/server";

import {
  addInterviewScore,
  getInterviewSessionBundle,
  updateInterviewSession,
} from "@/lib/db";
import { InterviewScoreDimension } from "@/lib/interview/types";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DimensionScore = {
  dimension: InterviewScoreDimension;
  score: number;
  rationale: string;
  recommendedFix?: string;
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
  const specificityScore = Math.min(5, Math.max(1, Math.round((withNumbers / Math.max(answers.length, 1)) * 5)));
  const clarityScore = avgWords === 0 ? 1 : avgWords > 220 ? 2 : avgWords > 150 ? 3 : avgWords > 100 ? 4 : 5;
  const relevanceScore = answers.length === 0 ? 1 : joined.includes("because") || joined.includes("impact") ? 4 : 3;
  const leadershipScore = Math.min(5, Math.max(1, Math.round(ownershipHits / Math.max(answers.length, 1))));

  return [
    {
      dimension: "star_structure",
      score: starScore,
      rationale: "Based on explicit STAR elements detected across your responses.",
      recommendedFix: "Use one sentence each for Situation and Task, then focus most time on Action + measurable Result.",
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

export async function POST(_request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const bundle = getInterviewSessionBundle(id);

    if (!bundle) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    if (bundle.scores.length > 0) {
      return NextResponse.json({ scores: bundle.scores, generated: false });
    }

    const candidateAnswers = bundle.messages
      .filter((m) => m.role === "candidate")
      .map((m) => m.content)
      .filter(Boolean);

    if (!candidateAnswers.length) {
      return NextResponse.json(
        { error: "No candidate answers available to score" },
        { status: 400 }
      );
    }

    const scoresToSave = computeScores(candidateAnswers);
    const saved = scoresToSave.map((item) =>
      addInterviewScore(id, item.dimension, item.score, item.rationale, item.recommendedFix)
    );

    updateInterviewSession(id, {
      phase: "done",
      status: "completed",
      endedAt: bundle.session.endedAt ?? new Date().toISOString(),
    });

    return NextResponse.json({ scores: saved, generated: true });
  } catch (error) {
    console.error("Error generating scorecard", error);
    return NextResponse.json(
      { error: "Unable to generate scorecard" },
      { status: 500 }
    );
  }
}
