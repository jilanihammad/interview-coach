import { NextResponse } from "next/server";

import {
  addInterviewMessage,
  getInterviewSessionById,
  listInterviewMessages,
  updateInterviewSession,
} from "@/lib/db";
import { nextAssistantTurn } from "@/lib/interview/engine";
import {
  generateInterviewerTurnWithLlm,
  isInterviewLlmConfigured,
} from "@/lib/interview/llm";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const processingTurns = new Set<string>();

function isSessionLockedForTurns(status: string, phase: string): boolean {
  return status === "cancelled" || status === "completed" || phase === "scoring" || phase === "done";
}

export async function POST(request: Request, context: SessionRouteContext) {
  const { id } = await context.params;

  if (processingTurns.has(id)) {
    return NextResponse.json({ error: "Turn already in progress" }, { status: 409 });
  }

  processingTurns.add(id);

  try {
    const session = getInterviewSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    if (isSessionLockedForTurns(session.status, session.phase)) {
      return NextResponse.json(
        { error: "Session is not accepting more turns" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const candidateAnswer = String(body?.candidateAnswer ?? "").trim();
    const responseDurationSecRaw = Number(body?.responseDurationSec);
    const responseDurationSec = Number.isFinite(responseDurationSecRaw)
      ? Math.max(0, responseDurationSecRaw)
      : undefined;

    if (candidateAnswer) {
      const wordCount = candidateAnswer.split(/\s+/).filter(Boolean).length;

      addInterviewMessage(id, "candidate", candidateAnswer, {
        source: "turn",
        responseDurationSec,
        wordCount,
      });
    }

    const messages = listInterviewMessages(id);
    const turn = nextAssistantTurn(session, messages);

    let assistantContent = turn.content;
    let llmMeta: { provider: string; model: string; fallbackUsed: boolean } | null = null;

    if (isInterviewLlmConfigured()) {
      try {
        const llmTurn = await generateInterviewerTurnWithLlm({
          session,
          messages,
          turnKind: turn.kind,
          fallbackContent: turn.content,
        });
        assistantContent = llmTurn.content;
        llmMeta = llmTurn.meta;
      } catch (error) {
        console.warn("LLM interviewer turn failed, using deterministic fallback", error);
      }
    }

    const assistantMessage = addInterviewMessage(id, "assistant", assistantContent, {
      kind: turn.kind,
      source: llmMeta ? "llm" : "turn",
      llm: llmMeta || undefined,
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

    return NextResponse.json({
      session: updatedSession,
      assistantMessage,
      turn: { ...turn, content: assistantContent },
      llm: llmMeta,
    });
  } catch (error) {
    console.error("Error generating assistant turn", error);
    return NextResponse.json(
      { error: "Unable to generate assistant turn" },
      { status: 500 }
    );
  } finally {
    processingTurns.delete(id);
  }
}
