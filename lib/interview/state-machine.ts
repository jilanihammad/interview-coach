import { InterviewPhase, InterviewSessionStatus } from "./types";

export type InterviewState = {
  status: InterviewSessionStatus;
  phase: InterviewPhase;
  questionIndex: number;
  followUpCount: number;
  elapsedSeconds: number;
};

export type InterviewEvent =
  | { type: "START" }
  | { type: "ASK_QUESTION" }
  | { type: "CANDIDATE_ANSWER" }
  | { type: "ASK_FOLLOW_UP" }
  | { type: "NEXT_QUESTION" }
  | { type: "TIME_EXPIRED" }
  | { type: "QUESTION_LIMIT_REACHED" }
  | { type: "BEGIN_SCORING" }
  | { type: "SCORES_READY" }
  | { type: "CANCEL" };

export const initialInterviewState: InterviewState = {
  status: "draft",
  phase: "setup",
  questionIndex: 0,
  followUpCount: 0,
  elapsedSeconds: 0,
};

export function transitionInterviewState(
  state: InterviewState,
  event: InterviewEvent
): InterviewState {
  switch (event.type) {
    case "START":
      return {
        ...state,
        status: "in_progress",
        phase: "intro",
      };

    case "ASK_QUESTION":
      return {
        ...state,
        phase: "question",
        questionIndex: state.questionIndex + 1,
        followUpCount: 0,
      };

    case "CANDIDATE_ANSWER":
      return {
        ...state,
        phase: "follow_up",
      };

    case "ASK_FOLLOW_UP":
      return {
        ...state,
        phase: "follow_up",
        followUpCount: state.followUpCount + 1,
      };

    case "NEXT_QUESTION":
      return {
        ...state,
        phase: "question",
        questionIndex: state.questionIndex + 1,
        followUpCount: 0,
      };

    case "TIME_EXPIRED":
    case "QUESTION_LIMIT_REACHED":
      return {
        ...state,
        phase: "wrap_up",
      };

    case "BEGIN_SCORING":
      return {
        ...state,
        phase: "scoring",
      };

    case "SCORES_READY":
      return {
        ...state,
        phase: "done",
        status: "completed",
      };

    case "CANCEL":
      return {
        ...state,
        phase: "done",
        status: "cancelled",
      };

    default:
      return state;
  }
}

export function shouldAskFollowUp(state: InterviewState): boolean {
  return state.phase === "follow_up" && state.followUpCount < 2;
}
