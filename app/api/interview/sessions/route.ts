import { NextResponse } from "next/server";

import { createInterviewSession, listInterviewSessions } from "@/lib/db";
import {
  InterviewMode,
  InterviewPersonality,
  interviewPersonalityOptions,
} from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInterviewMode(value: unknown): value is InterviewMode {
  return value === "time" || value === "question_count";
}

function isInterviewPersonality(value: unknown): value is InterviewPersonality {
  return interviewPersonalityOptions.some((option) => option.value === value);
}

export async function GET() {
  try {
    const sessions = listInterviewSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error listing interview sessions", error);
    return NextResponse.json(
      { error: "Unable to load interview sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const targetCompany = String(body?.targetCompany ?? "").trim();
    const roleTitle = String(body?.roleTitle ?? "").trim();
    const roleLevel = String(body?.roleLevel ?? "").trim();
    const jobDescription = String(body?.jobDescription ?? "").trim();
    const customQuestions = String(body?.customQuestions ?? "").trim();
    const personality = body?.personality;
    const mode = body?.mode;
    const useTimeBudget = body?.useTimeBudget !== undefined ? Boolean(body.useTimeBudget) : true;

    if (!targetCompany || !roleTitle || !jobDescription || !isInterviewMode(mode)) {
      return NextResponse.json(
        {
          error:
            "targetCompany, roleTitle, jobDescription, and mode (time|question_count) are required",
        },
        { status: 400 }
      );
    }

    if (personality && !isInterviewPersonality(personality)) {
      return NextResponse.json(
        {
          error: `Invalid personality. Allowed: ${interviewPersonalityOptions
            .map((option) => option.value)
            .join(", ")}`,
        },
        { status: 400 }
      );
    }

    const targetDurationMinutes =
      mode === "time"
        ? Math.max(10, Math.min(90, Number(body?.targetDurationMinutes ?? 45)))
        : undefined;

    const targetQuestionCount =
      mode === "question_count"
        ? Math.max(1, Math.min(12, Number(body?.targetQuestionCount ?? 5)))
        : undefined;

    const session = createInterviewSession({
      targetCompany,
      roleTitle,
      roleLevel: roleLevel || undefined,
      jobDescription,
      customQuestions: customQuestions || undefined,
      personality: personality || undefined,
      useTimeBudget,
      mode,
      targetDurationMinutes,
      targetQuestionCount,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating interview session", error);
    return NextResponse.json(
      { error: "Unable to create interview session" },
      { status: 500 }
    );
  }
}
