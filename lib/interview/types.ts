export type InterviewMode = "time" | "question_count";

export type InterviewPhase =
  | "setup"
  | "intro"
  | "question"
  | "follow_up"
  | "wrap_up"
  | "scoring"
  | "done";

export type InterviewSessionStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "cancelled";

export type InterviewMessageRole = "system" | "assistant" | "candidate";

export type InterviewScoreDimension =
  | "star_structure"
  | "specificity"
  | "clarity"
  | "relevance"
  | "leadership_impact";

export type InterviewSession = {
  id: string;
  status: InterviewSessionStatus;
  phase: InterviewPhase;
  targetCompany: string;
  roleTitle: string;
  roleLevel?: string;
  jobDescription: string;
  mode: InterviewMode;
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type InterviewMessage = {
  id: string;
  sessionId: string;
  role: InterviewMessageRole;
  content: string;
  indexInSession: number;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type InterviewScore = {
  id: string;
  sessionId: string;
  dimension: InterviewScoreDimension;
  score: number;
  rationale: string;
  recommendedFix?: string;
  createdAt: string;
};

export type CreateInterviewSessionInput = {
  targetCompany: string;
  roleTitle: string;
  roleLevel?: string;
  jobDescription: string;
  mode: InterviewMode;
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
};

export type InterviewSessionBundle = {
  session: InterviewSession;
  messages: InterviewMessage[];
  scores: InterviewScore[];
};
