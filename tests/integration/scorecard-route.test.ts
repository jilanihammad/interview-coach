import { beforeEach, describe, expect, it, vi } from "vitest";

const getInterviewSessionBundle = vi.fn();
const addInterviewScore = vi.fn();
const addInterviewProviderUsage = vi.fn();
const updateInterviewSession = vi.fn();
const isInterviewLlmConfigured = vi.fn();
const generateEvaluatorScorecardWithLlm = vi.fn();

vi.mock("@/lib/db", () => ({
  getInterviewSessionBundle,
  addInterviewScore,
  addInterviewProviderUsage,
  updateInterviewSession,
}));

vi.mock("@/lib/interview/llm", () => ({
  isInterviewLlmConfigured,
  generateEvaluatorScorecardWithLlm,
}));

const { POST } = await import("@/app/api/interview/sessions/[id]/scorecard/route");

const baseBundle = {
  session: {
    id: "s1",
    status: "completed",
    phase: "scoring",
    endedAt: null,
  },
  messages: [
    {
      id: "m1",
      role: "candidate",
      content: "I led migration and reduced latency by 35 percent in two months",
      meta: { responseDurationSec: 28.5 },
    },
    {
      id: "m2",
      role: "candidate",
      content: "I aligned stakeholders and shipped with clear ownership",
      meta: { responseDurationSec: 19.4 },
    },
  ],
  scores: [],
};

describe("scorecard route", () => {
  beforeEach(() => {
    getInterviewSessionBundle.mockReset();
    addInterviewScore.mockReset();
    addInterviewProviderUsage.mockReset();
    updateInterviewSession.mockReset();
    isInterviewLlmConfigured.mockReset();
    generateEvaluatorScorecardWithLlm.mockReset();

    isInterviewLlmConfigured.mockReturnValue(false);

    getInterviewSessionBundle.mockReturnValue(baseBundle);
    addInterviewScore.mockImplementation((sessionId, dimension, score, rationale, recommendedFix) => ({
      id: `${dimension}-1`,
      sessionId,
      dimension,
      score,
      rationale,
      recommendedFix,
      createdAt: new Date().toISOString(),
    }));
  });

  it("returns 404 if bundle missing", async () => {
    getInterviewSessionBundle.mockReturnValue(null);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 while interview is still in progress", async () => {
    getInterviewSessionBundle.mockReturnValue({
      ...baseBundle,
      session: { ...baseBundle.session, status: "in_progress", phase: "question" },
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "s1" }),
    });

    expect(response.status).toBe(409);
  });

  it("returns 400 if no candidate answers", async () => {
    getInterviewSessionBundle.mockReturnValue({ ...baseBundle, messages: [] });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "s1" }),
    });

    expect(response.status).toBe(400);
  });

  it("generates scores + summary and is idempotent on subsequent calls", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "s1" }),
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generated).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.summary.strengths.length).toBeGreaterThan(0);
    expect(body.summary.gaps.length).toBeGreaterThan(0);
    expect(body.summary.frameworkSuggestions.length).toBeGreaterThan(0);
    expect(body.summary.focusAreas.length).toBeGreaterThan(0);
    expect(body.summary.stats.avgResponseTimeSec).toBeGreaterThan(0);
    expect(body.summary.stats.avgWordCount).toBeGreaterThan(0);

    // second call with existing scores: should not generate new score rows
    getInterviewSessionBundle.mockReturnValue({ ...baseBundle, scores: body.scores });

    const second = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "s1" }),
    });

    const secondBody = await second.json();
    expect(secondBody.generated).toBe(false);
  });

  it("uses LLM evaluator when configured", async () => {
    isInterviewLlmConfigured.mockReturnValue(true);
    generateEvaluatorScorecardWithLlm.mockResolvedValue({
      scores: [
        { dimension: "star_structure", score: 4, rationale: "Good structure" },
        { dimension: "specificity", score: 4, rationale: "Concrete metrics" },
        { dimension: "clarity", score: 3.5, rationale: "Mostly concise" },
        { dimension: "relevance", score: 4, rationale: "Role-aligned" },
        { dimension: "leadership_impact", score: 3.5, rationale: "Some ownership" },
      ],
      summary: {
        strengths: ["Strong STAR storytelling"],
        gaps: ["Could improve leadership framing"],
        frameworkSuggestions: [
          {
            name: "STAR",
            description: "Structure each answer",
            template: "Situation → Task → Action → Result",
          },
        ],
        focusAreas: [
          {
            area: "Leadership impact",
            reason: "Need clearer personal ownership",
            practice: "Rehearse 3 ownership-focused stories",
          },
        ],
      },
      meta: { provider: "openai", model: "gpt-4.1-mini", fallbackUsed: false },
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.llm.provider).toBe("openai");
    expect(body.summary.strengths[0]).toContain("STAR");
  });
});
