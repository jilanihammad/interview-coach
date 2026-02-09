import { InterviewMessage, InterviewSession } from "./types";
import { buildKickoffAssistantMessage } from "./prompts";

const QUESTION_BANK = [
  "Tell me about a time you had to make a difficult trade-off under tight deadlines.",
  "Describe a project where you had to influence teammates without direct authority.",
  "Tell me about a time you handled production ambiguity or changing requirements.",
  "Share an example of a failure or miss. What did you learn and change after it?",
  "Describe a time you improved a process or system that made a measurable impact.",
  "Tell me about a conflict with a stakeholder and how you resolved it.",
];

const FOLLOW_UP_BANK = [
  "What was the measurable result, and what would you do differently next time?",
  "What was your personal ownership versus the team contribution?",
  "How did you prioritize when constraints changed?",
];

function hasNumbers(text: string): boolean {
  return /\d|percent|%|ms|sec|hour|day|week|month|year/i.test(text);
}

function shouldAskFollowUp(answer: string, recentAssistantMessages: InterviewMessage[]): boolean {
  const followUpsSinceLastQuestion = [...recentAssistantMessages]
    .reverse()
    .findIndex((m) => (m.meta as Record<string, unknown> | undefined)?.kind === "question");

  const followUpCount =
    followUpsSinceLastQuestion === -1
      ? recentAssistantMessages.filter(
          (m) => (m.meta as Record<string, unknown> | undefined)?.kind === "follow_up"
        ).length
      : recentAssistantMessages
          .slice(recentAssistantMessages.length - followUpsSinceLastQuestion)
          .filter((m) => (m.meta as Record<string, unknown> | undefined)?.kind === "follow_up")
          .length;

  if (followUpCount >= 2) return false;
  if (answer.length < 220) return true;
  if (!hasNumbers(answer)) return true;
  return false;
}

function pickQuestion(index: number): string {
  return QUESTION_BANK[index % QUESTION_BANK.length];
}

function pickFollowUp(index: number): string {
  return FOLLOW_UP_BANK[index % FOLLOW_UP_BANK.length];
}

function isQuestionLimitReached(session: InterviewSession, candidateAnswerCount: number): boolean {
  if (session.mode !== "question_count") return false;
  const target = session.targetQuestionCount ?? 5;
  return candidateAnswerCount >= target;
}

export function nextAssistantTurn(
  session: InterviewSession,
  messages: InterviewMessage[]
): { kind: "kickoff" | "question" | "follow_up" | "wrap_up"; content: string } {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const candidateMessages = messages.filter((m) => m.role === "candidate");

  if (assistantMessages.length === 0) {
    return {
      kind: "kickoff",
      content: buildKickoffAssistantMessage({
        targetCompany: session.targetCompany,
        roleTitle: session.roleTitle,
        roleLevel: session.roleLevel,
        jobDescription: session.jobDescription,
        mode: session.mode,
        targetDurationMinutes: session.targetDurationMinutes,
        targetQuestionCount: session.targetQuestionCount,
      }),
    };
  }

  if (candidateMessages.length === 0) {
    return {
      kind: "question",
      content: pickQuestion(0),
    };
  }

  if (isQuestionLimitReached(session, candidateMessages.length)) {
    return {
      kind: "wrap_up",
      content:
        "Great work. That wraps the interview portion. Next, I'll generate a scorecard with your strongest areas and the top fix to focus on.",
    };
  }

  const lastCandidate = candidateMessages[candidateMessages.length - 1]?.content ?? "";

  if (shouldAskFollowUp(lastCandidate, assistantMessages)) {
    return {
      kind: "follow_up",
      content: pickFollowUp(candidateMessages.length - 1),
    };
  }

  return {
    kind: "question",
    content: pickQuestion(candidateMessages.length),
  };
}
