type InterviewPromptInput = {
  targetCompany: string;
  roleTitle: string;
  roleLevel?: string;
  jobDescription: string;
  mode: "time" | "question_count";
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
};

export function buildInterviewerSystemPrompt(input: InterviewPromptInput): string {
  const cadence =
    input.mode === "time"
      ? `This session is time-boxed to ${input.targetDurationMinutes ?? 45} minutes.`
      : `This session is question-boxed to ${input.targetQuestionCount ?? 5} core questions.`;

  return [
    "You are a senior interviewer at a top-tier tech company.",
    "Run a realistic behavioral interview with concise, professional tone.",
    `Target company: ${input.targetCompany}.`,
    `Target role: ${input.roleTitle}${input.roleLevel ? ` (${input.roleLevel})` : ""}.`,
    cadence,
    "Ask one question at a time.",
    "After each candidate answer, ask up to 2 probing follow-up questions.",
    "Avoid giving feedback mid-session.",
    "At the end, summarize interview strengths and transition to evaluator handoff.",
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

  return `${opening} I'll ask one question at a time and use brief follow-ups when needed. Let's begin with your intro: tell me about yourself and why this role at ${input.targetCompany} is a fit.`;
}
