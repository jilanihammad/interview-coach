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
    "what specific action did you personally take?",
    "what was the measurable result?",
    "what trade-off did you make and why?",
    "what would you change if you ran this again?",
    "how did you align stakeholders when tension increased?",
  ],
  friendly_probing: [
    "can you walk me through your decision process step by step?",
    "what was your direct ownership versus team support?",
    "what concrete outcome should we attribute to your actions?",
    "if you replayed this, what would you do differently?",
    "how did you know your approach was working?",
  ],
  direct_time_conscious: [
    "give me your action in one sentence.",
    "what metric moved, exactly?",
    "what did you own personally?",
    "what was the key trade-off under time pressure?",
    "what would you fix next time?",
  ],
  skeptical_senior_leader: [
    "what hard evidence proves your approach worked?",
    "why should I believe the impact was significant?",
    "what risk did you underestimate?",
    "what did you challenge in the existing plan?",
    "where did your judgment outperform alternatives?",
  ],
  warm_supportive: [
    "what are you most proud of in that example?",
    "what did you personally contribute that mattered most?",
    "what result best shows your impact?",
    "what lesson changed how you work now?",
    "how would you strengthen that answer in a real interview?",
  ],
} as const;

const LEGACY_MAX_FOLLOW_UPS = 2;

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

function getAssistantKind(message: InterviewMessage): string | undefined {
  return (message.meta as Record<string, unknown> | undefined)?.kind as string | undefined;
}

function countCoreQuestionsAsked(assistantMessages: InterviewMessage[]): number {
  return assistantMessages.filter((m) => getAssistantKind(m) === "question").length;
}

function countFollowUpsForCurrentQuestion(assistantMessages: InterviewMessage[]): number {
  let count = 0;

  for (let i = assistantMessages.length - 1; i >= 0; i -= 1) {
    const kind = getAssistantKind(assistantMessages[i]);

    if (kind === "question") break;
    if (kind === "follow_up") count += 1;
  }

  return count;
}

function remainingTimeSeconds(session: InterviewSession): number {
  const total = (session.targetDurationMinutes ?? 45) * 60;
  if (!session.startedAt) return total;

  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started)) return total;

  const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return Math.max(0, total - elapsed);
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeFollowUpBudget(
  session: InterviewSession,
  assistantMessages: InterviewMessage[],
  lastAnswer: string
): number {
  if (session.useTimeBudget === false) return LEGACY_MAX_FOLLOW_UPS;

  const answerLooksThin = lastAnswer.length < 220 || !hasNumbers(lastAnswer);

  if (session.mode === "time") {
    const total = (session.targetDurationMinutes ?? 45) * 60;
    const remaining = remainingTimeSeconds(session);
    const ratio = total > 0 ? remaining / total : 0;

    let budget = ratio > 0.66 ? 5 : ratio > 0.33 ? 4 : 3;
    if (answerLooksThin) budget += 1;

    return clamp(3, budget, 5);
  }

  const targetQuestions = session.targetQuestionCount ?? 5;
  const coreAsked = countCoreQuestionsAsked(assistantMessages);
  const remainingQuestions = Math.max(1, targetQuestions - coreAsked);

  let budget = remainingQuestions <= 2 ? 4 : 3;
  if (answerLooksThin) budget += 1;

  return clamp(3, budget, 5);
}

function shouldAskFollowUp(
  session: InterviewSession,
  lastAnswer: string,
  assistantMessages: InterviewMessage[]
): boolean {
  const followUpCount = countFollowUpsForCurrentQuestion(assistantMessages);
  const followUpBudget = computeFollowUpBudget(session, assistantMessages, lastAnswer);
  return followUpCount < followUpBudget;
}

function extractAnswerTopic(answer: string): string {
  const sentence = answer
    .split(/[.!?]\s+/)
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.length > 24);

  const topic = (sentence || answer).replace(/\s+/g, " ").trim();
  return topic.length > 90 ? `${topic.slice(0, 90)}...` : topic;
}

function buildContextualFollowUp(
  session: InterviewSession,
  followUpIndex: number,
  lastAnswer: string
): string {
  const topic = extractAnswerTopic(lastAnswer);
  const bank = followUpBankForSession(session);
  const prompt = bank[followUpIndex % bank.length] || FOLLOW_UP_BANKS.default[0];

  if (session.personality === "direct_time_conscious") {
    return `Keep it tight. On "${topic}", ${prompt}`;
  }

  if (session.personality === "skeptical_senior_leader") {
    return `Let me challenge that. On "${topic}", ${prompt}`;
  }

  return `On "${topic}", ${prompt}`;
}

function pickQuestion(index: number, session: InterviewSession): string {
  const bank = questionBankForSession(session);
  return bank[index % bank.length];
}

function shouldWrapNow(
  session: InterviewSession,
  assistantMessages: InterviewMessage[],
  lastAnswer: string
): boolean {
  const coreAsked = countCoreQuestionsAsked(assistantMessages);
  const followUpsForCurrent = countFollowUpsForCurrentQuestion(assistantMessages);
  const followUpBudget = computeFollowUpBudget(session, assistantMessages, lastAnswer);

  if (session.mode === "question_count") {
    const target = session.targetQuestionCount ?? 5;
    return coreAsked >= target && followUpsForCurrent >= followUpBudget;
  }

  const remaining = remainingTimeSeconds(session);
  const timeIsUp = remaining <= 30;
  const maxCoreQuestions = Math.min(
    questionBankForSession(session).length,
    Math.max(3, Math.floor((session.targetDurationMinutes ?? 45) / 7))
  );

  const exhaustedQuestionSet = coreAsked >= maxCoreQuestions;

  if (timeIsUp) {
    return followUpsForCurrent >= Math.min(1, followUpBudget) || coreAsked >= 1;
  }

  return exhaustedQuestionSet && followUpsForCurrent >= followUpBudget;
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

  const lastCandidate = candidateMessages[candidateMessages.length - 1]?.content ?? "";

  if (shouldWrapNow(session, assistantMessages, lastCandidate)) {
    return {
      kind: "wrap_up",
      content:
        "Great work. That wraps the interview portion. Next, I'll generate a scorecard with strengths, gaps, frameworks, focus areas, and practice guidance.",
    };
  }

  if (shouldAskFollowUp(session, lastCandidate, assistantMessages)) {
    const followUpCount = countFollowUpsForCurrentQuestion(assistantMessages);
    return {
      kind: "follow_up",
      content: buildContextualFollowUp(session, followUpCount, lastCandidate),
    };
  }

  const coreAsked = countCoreQuestionsAsked(assistantMessages);
  return {
    kind: "question",
    content: pickQuestion(coreAsked, session),
  };
}
