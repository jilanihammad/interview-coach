import { beforeEach, describe, expect, it, vi } from "vitest";

const listInterviewSessions = vi.fn();
const createInterviewSession = vi.fn();
const purgeInterviewSessionsOlderThanDays = vi.fn();

vi.mock("@/lib/db", () => ({
  listInterviewSessions,
  createInterviewSession,
  purgeInterviewSessionsOlderThanDays,
}));

const { GET, POST } = await import("@/app/api/interview/sessions/route");

describe("/api/interview/sessions", () => {
  beforeEach(() => {
    listInterviewSessions.mockReset();
    createInterviewSession.mockReset();
    purgeInterviewSessionsOlderThanDays.mockReset();
    purgeInterviewSessionsOlderThanDays.mockReturnValue(0);
  });

  it("returns sessions on GET", async () => {
    listInterviewSessions.mockReturnValue([{ id: "s1" }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([{ id: "s1" }]);
  });

  it("validates required fields", async () => {
    const request = new Request("http://localhost/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify({ targetCompany: "", mode: "time" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects invalid personality", async () => {
    const request = new Request("http://localhost/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify({
        targetCompany: "Acme",
        roleTitle: "Engineer",
        jobDescription: "JD",
        mode: "time",
        personality: "bossy",
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates session with optional fields and useTimeBudget", async () => {
    createInterviewSession.mockReturnValue({ id: "s1", useTimeBudget: false });

    const request = new Request("http://localhost/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify({
        targetCompany: "Acme",
        roleTitle: "Engineer",
        roleLevel: "L5",
        jobDescription: "JD",
        customQuestions: "Q1\nQ2",
        personality: "friendly_probing",
        mode: "question_count",
        targetQuestionCount: 4,
        useTimeBudget: false,
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createInterviewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customQuestions: "Q1\nQ2",
        personality: "friendly_probing",
        useTimeBudget: false,
        targetQuestionCount: 4,
      })
    );
    expect(body.session.id).toBe("s1");
  });

  it("rejects oversized job description", async () => {
    const request = new Request("http://localhost/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify({
        targetCompany: "Acme",
        roleTitle: "Engineer",
        jobDescription: "x".repeat(10_001),
        mode: "time",
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("sanitizes html/script tags before persistence", async () => {
    createInterviewSession.mockReturnValue({ id: "s2" });

    const request = new Request("http://localhost/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify({
        targetCompany: "Acme",
        roleTitle: "Engineer",
        jobDescription: "<script>alert(1)</script><b>Build APIs</b>",
        customQuestions: "<i>How did you scale it?</i>",
        mode: "time",
        consentAccepted: true,
      }),
    });

    await POST(request);

    expect(createInterviewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: "Build APIs",
        customQuestions: "How did you scale it?",
      })
    );
  });
});
