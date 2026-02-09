import { beforeEach, describe, expect, it, vi } from "vitest";

const getInterviewSessionById = vi.fn();
const addInterviewMessage = vi.fn();
const listInterviewMessages = vi.fn();
const updateInterviewSession = vi.fn();
const nextAssistantTurn = vi.fn();

vi.mock("@/lib/db", () => ({
  getInterviewSessionById,
  addInterviewMessage,
  listInterviewMessages,
  updateInterviewSession,
}));

vi.mock("@/lib/interview/engine", () => ({
  nextAssistantTurn,
}));

const { POST } = await import("@/app/api/interview/sessions/[id]/assistant-turn/route");

const baseSession = {
  id: "s1",
  phase: "question",
  status: "in_progress",
  startedAt: null,
  endedAt: null,
};

describe("assistant-turn route", () => {
  beforeEach(() => {
    getInterviewSessionById.mockReset();
    addInterviewMessage.mockReset();
    listInterviewMessages.mockReset();
    updateInterviewSession.mockReset();
    nextAssistantTurn.mockReset();

    getInterviewSessionById.mockReturnValue(baseSession);
    listInterviewMessages.mockReturnValue([]);
    addInterviewMessage.mockImplementation((id, role, content, meta) => ({
      id: `${role}-1`,
      role,
      content,
      meta,
    }));
    updateInterviewSession.mockImplementation((_id, updates) => ({ ...baseSession, ...updates }));
  });

  it("returns 404 if session is missing", async () => {
    getInterviewSessionById.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });

  it("persists candidate metadata and transitions kickoff -> intro", async () => {
    nextAssistantTurn.mockReturnValue({ kind: "kickoff", content: "Welcome" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ candidateAnswer: "I led a launch", responseDurationSec: 21.3 }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    const body = await response.json();

    expect(addInterviewMessage).toHaveBeenCalledWith(
      "s1",
      "candidate",
      "I led a launch",
      expect.objectContaining({
        responseDurationSec: 21.3,
        wordCount: 4,
      })
    );

    expect(updateInterviewSession).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ status: "in_progress", phase: "intro" })
    );
    expect(body.turn.kind).toBe("kickoff");
  });

  it("marks session completed on wrap_up", async () => {
    nextAssistantTurn.mockReturnValue({ kind: "wrap_up", content: "Done" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ candidateAnswer: "final answer" }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(response.status).toBe(200);
    expect(updateInterviewSession).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ status: "completed", phase: "scoring" })
    );
  });
});
