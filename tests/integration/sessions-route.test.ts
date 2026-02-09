import { beforeEach, describe, expect, it, vi } from "vitest";

const listInterviewSessions = vi.fn();
const createInterviewSession = vi.fn();

vi.mock("@/lib/db", () => ({
  listInterviewSessions,
  createInterviewSession,
}));

const { GET, POST } = await import("@/app/api/interview/sessions/route");

describe("/api/interview/sessions", () => {
  beforeEach(() => {
    listInterviewSessions.mockReset();
    createInterviewSession.mockReset();
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
});
