"use client";

import { useEffect, useMemo, useState } from "react";

type Score = {
  id: string;
  dimension:
    | "star_structure"
    | "specificity"
    | "clarity"
    | "relevance"
    | "leadership_impact";
  score: number;
  rationale: string;
  recommendedFix?: string;
};

type Session = {
  id: string;
  roleTitle: string;
  targetCompany: string;
};

type Summary = {
  strengths: string[];
  gaps: string[];
  frameworkSuggestions: Array<{
    name: string;
    description: string;
    template: string;
  }>;
  focusAreas: Array<{
    area: string;
    reason: string;
    practice: string;
  }>;
  stats: {
    avgResponseTimeSec: number;
    avgWordCount: number;
    totalResponses: number;
  };
};

type Bundle = {
  session: Session;
  scores: Score[];
  summary?: Summary;
};

const dimensionLabels: Record<Score["dimension"], string> = {
  star_structure: "STAR structure",
  specificity: "Specificity",
  clarity: "Clarity",
  relevance: "Relevance",
  leadership_impact: "Leadership impact",
};

export default function FeedbackClient({ sessionId }: { sessionId: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const averageScore = useMemo(() => {
    if (!bundle?.scores.length) return null;
    const total = bundle.scores.reduce((sum, item) => sum + item.score, 0);
    return (total / bundle.scores.length).toFixed(1);
  }, [bundle?.scores]);

  const generateScorecard = async () => {
    if (!sessionId) return;

    try {
      setGenerating(true);
      setError(null);

      const response = await fetch(`/api/interview/sessions/${sessionId}/scorecard`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to generate scorecard");
      }

      setBundle({
        session: data.session,
        scores: data.scores || [],
        summary: data.summary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate scorecard");
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session id");
      setLoading(false);
      return;
    }

    void generateScorecard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto max-w-3xl text-sm text-slate-400">Loading feedback...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Interview Feedback</p>
          <h1 className="text-2xl font-semibold">
            {bundle?.session.roleTitle} @ {bundle?.session.targetCompany}
          </h1>
          <p className="text-sm text-slate-400">
            Strengths, gaps, frameworks, focus areas, and speaking metrics.
          </p>
        </div>

        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-300">Overall score</p>
            <p className="text-xl font-semibold">{averageScore ?? "--"} / 5.0</p>
          </div>

          {!bundle?.scores?.length ? (
            <div className="space-y-3 text-sm text-slate-400">
              <p>No scorecard generated yet.</p>
              <button
                type="button"
                onClick={generateScorecard}
                disabled={generating}
                className="rounded border border-slate-700 px-3 py-2 text-white disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate scorecard"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {bundle.scores.map((item) => (
                <div
                  key={item.id}
                  className="rounded border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-slate-300">{dimensionLabels[item.dimension]}</span>
                    <span className="font-semibold text-white">{item.score} / 5</span>
                  </div>
                  <p className="text-sm text-slate-300">{item.rationale}</p>
                  {item.recommendedFix ? (
                    <p className="mt-2 text-xs text-blue-200">Fix: {item.recommendedFix}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {bundle?.summary ? (
          <>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">Strengths</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                {bundle.summary.strengths.map((item, index) => (
                  <li key={`strength-${index}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">Gaps / missed opportunities</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                {bundle.summary.gaps.map((item, index) => (
                  <li key={`gap-${index}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">
                Suggested frameworks / templates
              </h2>
              <div className="space-y-3">
                {bundle.summary.frameworkSuggestions.map((item, index) => (
                  <div
                    key={`framework-${index}`}
                    className="rounded border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.description}</p>
                    <p className="mt-2 text-xs text-blue-200">Template: {item.template}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">1-2 focus areas for practice</h2>
              <div className="space-y-3">
                {bundle.summary.focusAreas.map((item, index) => (
                  <div
                    key={`focus-${index}`}
                    className="rounded border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <p className="text-sm font-semibold text-white">{item.area}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.reason}</p>
                    <p className="mt-2 text-xs text-blue-200">Practice: {item.practice}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">Session stats</h2>
              <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-500">Avg response time</p>
                  <p className="text-lg font-semibold text-white">
                    {bundle.summary.stats.avgResponseTimeSec}s
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-500">Avg word count</p>
                  <p className="text-lg font-semibold text-white">
                    {bundle.summary.stats.avgWordCount}
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-500">Responses</p>
                  <p className="text-lg font-semibold text-white">
                    {bundle.summary.stats.totalResponses}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
