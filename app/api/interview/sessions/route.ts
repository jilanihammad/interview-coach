import { NextResponse } from "next/server";

import {
  createInterviewSession,
  listInterviewSessions,
  purgeInterviewSessionsOlderThanDays,
} from "@/lib/db";
import { logInterviewEvent } from "@/lib/interview/observability";
import { consumeRateLimit, getClientIp, readEnvInt } from "@/lib/interview/rate-limit";
import {
  InterviewMode,
  InterviewPersonality,
  interviewPersonalityOptions,
} from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMPANY_CHARS = 120;
const MAX_ROLE_CHARS = 120;
const MAX_LEVEL_CHARS = 80;
const MAX_JOB_DESCRIPTION_CHARS = 10_000;
const MAX_CUSTOM_QUESTIONS_CHARS = 5_000;
const DEFAULT_CONSENT_VERSION = process.env.INTERVIEW_CONSENT_VERSION || "v1";

const RETENTION_DAYS = readEnvInt("INTERVIEW_RETENTION_DAYS", 7);
const SESSION_CREATE_LIMIT = readEnvInt("INTERVIEW_RATE_SESSION_CREATE", 5);
const SESSION_CREATE_WINDOW_MS = readEnvInt("INTERVIEW_RATE_SESSION_CREATE_WINDOW_MS", 15 * 60 * 1000);

let lastRetentionPurgeAt = 0;

function maybeRunRetentionPurge() {
  if (RETENTION_DAYS <= 0) return;

  const now = Date.now();
  if (now - lastRetentionPurgeAt < 60 * 60 * 1000) {
    return;
  }

  const purged = purgeInterviewSessionsOlderThanDays(RETENTION_DAYS);
  lastRetentionPurgeAt = now;

  if (purged > 0) {
    logInterviewEvent("info", "retention_purge", {
      purged,
      retentionDays: RETENTION_DAYS,
    });
  }
}

function isInterviewMode(value: unknown): value is InterviewMode {
  return value === "time" || value === "question_count";
}

function isInterviewPersonality(value: unknown): value is InterviewPersonality {
  return interviewPersonalityOptions.some((option) => option.value === value);
}

function sanitizeText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function GET() {
  try {
    maybeRunRetentionPurge();
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
    maybeRunRetentionPurge();

    const clientIp = getClientIp(request);
    const rateLimit = consumeRateLimit(
      `session-create:${clientIp}`,
      SESSION_CREATE_LIMIT,
      SESSION_CREATE_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many session creation requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSec),
          },
        }
      );
    }

    const body = await request.json();

    const targetCompany = sanitizeText(String(body?.targetCompany ?? ""));
    const roleTitle = sanitizeText(String(body?.roleTitle ?? ""));
    const roleLevel = sanitizeText(String(body?.roleLevel ?? ""));
    const jobDescription = sanitizeText(String(body?.jobDescription ?? ""));
    const customQuestions = sanitizeText(String(body?.customQuestions ?? ""));
    const personality = body?.personality;
    const mode = body?.mode;
    const useTimeBudget = body?.useTimeBudget !== undefined ? Boolean(body.useTimeBudget) : true;
    const consentAccepted = Boolean(body?.consentAccepted);
    const consentVersion =
      sanitizeText(String(body?.consentVersion ?? "")) || DEFAULT_CONSENT_VERSION;

    if (!targetCompany || !roleTitle || !jobDescription || !isInterviewMode(mode)) {
      return NextResponse.json(
        {
          error:
            "targetCompany, roleTitle, jobDescription, and mode (time|question_count) are required",
        },
        { status: 400 }
      );
    }

    if (!consentAccepted) {
      return NextResponse.json(
        { error: "Consent is required before starting an interview session" },
        { status: 400 }
      );
    }

    if (targetCompany.length > MAX_COMPANY_CHARS) {
      return NextResponse.json(
        { error: `Target company exceeds maximum length (${MAX_COMPANY_CHARS} chars)` },
        { status: 400 }
      );
    }

    if (roleTitle.length > MAX_ROLE_CHARS) {
      return NextResponse.json(
        { error: `Role title exceeds maximum length (${MAX_ROLE_CHARS} chars)` },
        { status: 400 }
      );
    }

    if (roleLevel.length > MAX_LEVEL_CHARS) {
      return NextResponse.json(
        { error: `Role level exceeds maximum length (${MAX_LEVEL_CHARS} chars)` },
        { status: 400 }
      );
    }

    if (jobDescription.length > MAX_JOB_DESCRIPTION_CHARS) {
      return NextResponse.json(
        { error: `Job description exceeds maximum length (${MAX_JOB_DESCRIPTION_CHARS} chars)` },
        { status: 400 }
      );
    }

    if (customQuestions.length > MAX_CUSTOM_QUESTIONS_CHARS) {
      return NextResponse.json(
        { error: `Custom questions exceed maximum length (${MAX_CUSTOM_QUESTIONS_CHARS} chars)` },
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
      consentAcceptedAt: new Date().toISOString(),
      consentVersion,
    });

    logInterviewEvent("info", "session_created", {
      sessionId: session.id,
      mode,
      targetDurationMinutes,
      targetQuestionCount,
      clientIp,
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
