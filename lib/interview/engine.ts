import { InterviewMessage, InterviewSession } from "./types";
import { buildKickoffAssistantMessage } from "./prompts";

const DEFAULT_QUESTION_BANK = [
  "Tell me about a time you had to make a difficult trade-off under tight deadlines.",
  "Describe a project where you had to influence teammates without direct authority.",
  "Tell me about a time you handled production ambiguity or changing requirements.",
  "Share an example of a failure or miss. What did you learn and change after it?",
  "Describe a time you improved a process or system that made a measurable impact.",
  "Tell me about a conflict with a stakeholder and how you resolved it.",
];

const FOLLOW_UP_BANKS = {
  default: [
    "What was the measurable result, and what would you do differently next time?",
    "What was your personal ownership versus the team contribution?",
    "How did you prioritize when constraints changed?",
  ],
  friendly_probing: [
    "That's helpful. Can you walk me through your exact decision process there?",
    "Nice example. What was the measurable outcome and what did you personally drive?",
    "If you replayed that situation, what would you change and why?",
  ],
  direct_time_conscious: [
    "Give me the result in one sentence with a metric.",
    "What specifically did you own versus the team?",
    "What was the key trade-off you made under time pressure?",
  ],
  skeptical_senior_leader: [
    "What evidence proves your approach was the best option?",
    "Why should I believe the impact was meaningful at org level?",
    "What major risk did you overlook and how did you recover?",
  ],
  warm_supportive: [
    "Great context. What outcome are you most proud of in that story?",
    "What did you personally learn that changed how you work now?",
    "What would be your stronger version of that answer in a real interview?",
  ],
} as const;

function hasNumbers(text: string): boolean {
  return /\d|percent|%|ms|sec|hour|day|week|month|year/i.test(text);
}

function parseCustomQuestions(raw?: string): string[] {
  if (!raw?.trim()) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ""))
    .filter((line) => line.length > 8)
    .slice(0, 30);
}

function questionBankForSession(session: InterviewSession): string[] {
  const custom = parseCustomQuestions(session.customQuestions);
  return custom.length > 0 ? custom : DEFAULT_QUESTION_BANK;
}

function followUpBankForSession(session: InterviewSession): readonly string[] {
  if (!session.personality) return FOLLOW_UP_BANKS.default;
  return FOLLOW_UP_BANKS[session.personality] ?? FOLLOW_UP_BANKS.default;
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

function pickQuestion(index: number, session: InterviewSession): string {
  const bank = questionBankForSession(session);
  return bank[index % bank.length];
}

function pickFollowUp(index: number, session: InterviewSession): string {
  const bank = followUpBankForSession(session);
  return bank[index % bank.length];
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
        customQuestions: session.customQuestions,
        personality: session.personality,
        mode: session.mode,
        targetDurationMinutes: session.targetDurationMinutes,
        targetQuestionCount: session.targetQuestionCount,
      }),
    };
  }

  if (candidateMessages.length === 0) {
    return {
      kind: "question",
      content: pickQuestion(0, session),
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
      content: pickFollowUp(candidateMessages.length - 1, session),
    };
  }

  return {
    kind: "question",
    content: pickQuestion(candidateMessages.length, session),
  };
}
