import { beforeEach, describe, expect, it, vi } from "vitest";

const getInterviewSessionBundle = vi.fn();
const addInterviewScore = vi.fn();
const updateInterviewSession = vi.fn();

vi.mock("@/lib/db", () => ({
  getInterviewSessionBundle,
  addInterviewScore,
  updateInterviewSession,
}));

const { POST } = await import("@/app/api/interview/sessions/[id]/scorecard/route");

const baseBundle = {
  session: {
    id: "s1",
    status: "in_progress",
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
    updateInterviewSession.mockReset();

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
});
