import { NextResponse } from "next/server";

import {
  addInterviewMessage,
  getInterviewSessionById,
  listInterviewMessages,
  updateInterviewSession,
} from "@/lib/db";
import { nextAssistantTurn } from "@/lib/interview/engine";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const session = getInterviewSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    const body = await request.json();
    const candidateAnswer = String(body?.candidateAnswer ?? "").trim();

    if (candidateAnswer) {
      addInterviewMessage(id, "candidate", candidateAnswer, { source: "turn" });
    }

    const messages = listInterviewMessages(id);
    const turn = nextAssistantTurn(session, messages);
    const assistantMessage = addInterviewMessage(id, "assistant", turn.content, {
      kind: turn.kind,
      source: "turn",
    });

    let phase = session.phase;
    let status = session.status;

    if (turn.kind === "kickoff") {
      phase = "intro";
      status = "in_progress";
    } else if (turn.kind === "question") {
      phase = "question";
    } else if (turn.kind === "follow_up") {
      phase = "follow_up";
    } else if (turn.kind === "wrap_up") {
      phase = "scoring";
      status = "completed";
    }

    const updatedSession = updateInterviewSession(id, {
      phase,
      status,
      startedAt:
        status === "in_progress" && !session.startedAt
          ? new Date().toISOString()
          : session.startedAt,
      endedAt: turn.kind === "wrap_up" ? new Date().toISOString() : session.endedAt,
    });

    return NextResponse.json({ session: updatedSession, assistantMessage, turn });
  } catch (error) {
    console.error("Error generating assistant turn", error);
    return NextResponse.json(
      { error: "Unable to generate assistant turn" },
      { status: 500 }
    );
  }
}
