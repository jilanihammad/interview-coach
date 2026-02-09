import { InterviewPersonality } from "./types";

type InterviewPromptInput = {
  targetCompany: string;
  roleTitle: string;
  roleLevel?: string;
  jobDescription: string;
  customQuestions?: string;
  personality?: InterviewPersonality;
  mode: "time" | "question_count";
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
};

function personalityGuidance(personality?: InterviewPersonality): string {
  switch (personality) {
    case "friendly_probing":
      return "Tone: friendly and encouraging, but ask specific probing follow-ups when answers are vague.";
    case "direct_time_conscious":
      return "Tone: concise, direct, and time-conscious. Keep responses focused and avoid long detours.";
    case "skeptical_senior_leader":
      return "Tone: skeptical senior leader. Challenge assumptions and ask for evidence and measurable impact.";
    case "warm_supportive":
      return "Tone: warm and supportive. Keep pressure low while still getting concrete details.";
    default:
      return "Tone: professional and balanced.";
  }
}

export function buildInterviewerSystemPrompt(input: InterviewPromptInput): string {
  const cadence =
    input.mode === "time"
      ? `This session is time-boxed to ${input.targetDurationMinutes ?? 45} minutes.`
      : `This session is question-boxed to ${input.targetQuestionCount ?? 5} core questions.`;

  return [
    "You are a senior interviewer at a top-tier tech company.",
    "Run a realistic behavioral interview with concise, professional tone.",
    personalityGuidance(input.personality),
    `Target company: ${input.targetCompany}.`,
    `Target role: ${input.roleTitle}${input.roleLevel ? ` (${input.roleLevel})` : ""}.`,
    cadence,
    "Ask one question at a time.",
    "After each candidate answer, ask up to 2 probing follow-up questions.",
    "Avoid giving feedback mid-session.",
    "At the end, summarize interview strengths and transition to evaluator handoff.",
    input.customQuestions?.trim()
      ? `Prefer this user-supplied question bank when asking core questions:\n${input.customQuestions}`
      : "No custom question bank provided; generate questions from the job description.",
    "Keep questions grounded in the job description below:",
    input.jobDescription,
  ].join("\n");
}

export function buildEvaluatorSystemPrompt(input: InterviewPromptInput): string {
  return [
    "You are an interview evaluator.",
    "Score each answer from 0-5 across these dimensions:",
    "1) star_structure",
    "2) specificity",
    "3) clarity",
    "4) relevance",
    "5) leadership_impact",
    "Return strict JSON with overall score, per-dimension scores, rationale, and one recommended fix.",
    "Use evidence from transcript quotes in rationale.",
    "Target role context:",
    `Company: ${input.targetCompany}`,
    `Role: ${input.roleTitle}${input.roleLevel ? ` (${input.roleLevel})` : ""}`,
    "Job Description:",
    input.jobDescription,
  ].join("\n");
}

export function buildKickoffAssistantMessage(input: InterviewPromptInput): string {
  const opening =
    input.mode === "time"
      ? `We'll run a ${input.targetDurationMinutes ?? 45}-minute mock interview.`
      : `We'll run ${input.targetQuestionCount ?? 5} behavioral questions.`;

  const tone =
    input.personality === "direct_time_conscious"
      ? "I'll keep this tight and focused."
      : input.personality === "friendly_probing"
        ? "I'll keep this conversational and ask probing follow-ups."
        : input.personality === "skeptical_senior_leader"
          ? "I'll challenge assumptions and ask for concrete evidence."
          : input.personality === "warm_supportive"
            ? "I'll keep this supportive while still pushing for specifics."
            : "I'll ask one question at a time and use brief follow-ups when needed.";

  return `${opening} ${tone} Let's begin with your intro: tell me about yourself and why this role at ${input.targetCompany} is a fit.`;
}
