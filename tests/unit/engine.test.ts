import { describe, expect, it } from "vitest";

import { nextAssistantTurn } from "@/lib/interview/engine";
import { InterviewMessage, InterviewSession } from "@/lib/interview/types";

function baseSession(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    status: "in_progress",
    phase: "question",
    targetCompany: "Acme",
    roleTitle: "Engineer",
    jobDescription: "Build reliable backend systems",
    mode: "question_count",
    targetQuestionCount: 3,
    useTimeBudget: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function msg(
  role: InterviewMessage["role"],
  content: string,
  indexInSession: number,
  kind?: string
): InterviewMessage {
  return {
    id: `${role}-${indexInSession}`,
    sessionId: "s1",
    role,
    content,
    indexInSession,
    createdAt: new Date().toISOString(),
    meta: kind ? { kind } : undefined,
  };
}

describe("interview engine", () => {
  it("returns kickoff when no assistant messages exist", () => {
    const turn = nextAssistantTurn(baseSession(), []);
    expect(turn.kind).toBe("kickoff");
    expect(turn.content.toLowerCase()).toContain("behavioral questions");
  });

  it("prioritizes custom questions over default bank", () => {
    const session = baseSession({
      customQuestions: "1) What project had your biggest impact?\n2) Tell me about a conflict.",
    });

    const turn = nextAssistantTurn(session, [msg("assistant", "kickoff", 1, "kickoff")]);

    expect(turn.kind).toBe("question");
    expect(turn.content).toContain("What project had your biggest impact?");
  });

  it("legacy mode caps followups at 2 when useTimeBudget is false", () => {
    const session = baseSession({ targetQuestionCount: 1, useTimeBudget: false });

    const first = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "short answer", 2),
    ]);
    expect(first.kind).toBe("follow_up");

    const second = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "short answer", 2),
      msg("assistant", "FU1", 3, "follow_up"),
      msg("candidate", "still short", 4),
    ]);
    expect(second.kind).toBe("follow_up");

    const third = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "short answer", 2),
      msg("assistant", "FU1", 3, "follow_up"),
      msg("candidate", "still short", 4),
      msg("assistant", "FU2", 5, "follow_up"),
      msg("candidate", "another short", 6),
    ]);
    expect(third.kind).toBe("wrap_up");
  });

  it("time-budget mode allows up to 5 followups when plenty of time remains", () => {
    const session = baseSession({
      mode: "time",
      targetDurationMinutes: 60,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const next = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "thin", 2),
      msg("assistant", "FU1", 3, "follow_up"),
      msg("candidate", "thin", 4),
      msg("assistant", "FU2", 5, "follow_up"),
      msg("candidate", "thin", 6),
      msg("assistant", "FU3", 7, "follow_up"),
      msg("candidate", "thin", 8),
      msg("assistant", "FU4", 9, "follow_up"),
      msg("candidate", "thin", 10),
    ]);

    expect(next.kind).toBe("follow_up");
  });

  it("wraps up quickly when time is nearly exhausted", () => {
    const session = baseSession({
      mode: "time",
      targetDurationMinutes: 1,
      startedAt: new Date(Date.now() - 59_000).toISOString(),
    });

    const turn = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "some answer with 20% impact", 2),
    ]);

    expect(turn.kind).toBe("wrap_up");
  });

  it("uses skeptical personality prefix in followups", () => {
    const session = baseSession({ personality: "skeptical_senior_leader" });

    const turn = nextAssistantTurn(session, [
      msg("assistant", "Q1", 1, "question"),
      msg("candidate", "I improved things", 2),
    ]);

    expect(turn.kind).toBe("follow_up");
    expect(turn.content.startsWith("Let me challenge that.")).toBe(true);
  });
});
