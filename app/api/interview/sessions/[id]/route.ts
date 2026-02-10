import { NextResponse } from "next/server";

import {
  deleteInterviewSession,
  getInterviewSessionBundle,
  updateInterviewSession,
} from "@/lib/db";
import { logInterviewEvent } from "@/lib/interview/observability";
import { InterviewPhase, InterviewSessionStatus } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRouteContext = { params: Promise<{ id: string }> };

const allowedStatus: InterviewSessionStatus[] = [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
];

const allowedPhase: InterviewPhase[] = [
  "setup",
  "intro",
  "question",
  "follow_up",
  "wrap_up",
  "scoring",
  "done",
];

export async function GET(_request: Request, context: SessionRouteContext) {
  const { id } = await context.params;
  const bundle = getInterviewSessionBundle(id);
  if (!bundle) {
    return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
  }
  return NextResponse.json(bundle);
}

export async function PUT(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const status = body?.status as InterviewSessionStatus | undefined;
    const phase = body?.phase as InterviewPhase | undefined;

    if (status && !allowedStatus.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (phase && !allowedPhase.includes(phase)) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    const updated = updateInterviewSession(id, {
      status,
      phase,
      startedAt: body?.startedAt,
      endedAt: body?.endedAt,
      targetDurationMinutes:
        body?.targetDurationMinutes !== undefined
          ? Number(body.targetDurationMinutes)
          : undefined,
      targetQuestionCount:
        body?.targetQuestionCount !== undefined
          ? Number(body.targetQuestionCount)
          : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Error updating interview session", error);
    return NextResponse.json(
      { error: "Unable to update interview session" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deleteInterviewSession(id);

    if (!deleted) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    logInterviewEvent("info", "session_deleted", { sessionId: id });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting interview session", error);
    return NextResponse.json(
      { error: "Unable to delete interview session" },
      { status: 500 }
    );
  }
}
