export type InterviewMode = "time" | "question_count";

export type InterviewPersonality =
  | "friendly_probing"
  | "direct_time_conscious"
  | "skeptical_senior_leader"
  | "warm_supportive";

export const interviewPersonalityOptions: Array<{
  value: InterviewPersonality;
  label: string;
}> = [
  { value: "friendly_probing", label: "Friendly but probing" },
  { value: "direct_time_conscious", label: "Direct and time-conscious" },
  { value: "skeptical_senior_leader", label: "Skeptical senior leader" },
  { value: "warm_supportive", label: "Warm and supportive" },
];

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
  customQuestions?: string;
  personality?: InterviewPersonality;
  useTimeBudget?: boolean;
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
  customQuestions?: string;
  personality?: InterviewPersonality;
  useTimeBudget?: boolean;
  mode: InterviewMode;
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
};

export type InterviewSessionBundle = {
  session: InterviewSession;
  messages: InterviewMessage[];
  scores: InterviewScore[];
};

export type InterviewFrameworkSuggestion = {
  name: string;
  description: string;
  template: string;
};

export type InterviewFocusArea = {
  area: string;
  reason: string;
  practice: string;
};

export type InterviewFeedbackSummary = {
  strengths: string[];
  gaps: string[];
  frameworkSuggestions: InterviewFrameworkSuggestion[];
  focusAreas: InterviewFocusArea[];
  stats: {
    avgResponseTimeSec: number;
    avgWordCount: number;
    totalResponses: number;
  };
};
