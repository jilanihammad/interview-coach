import { NextResponse } from "next/server";

import {
  addInterviewMessage,
  addInterviewProviderUsage,
  getInterviewSessionById,
  listInterviewMessages,
  updateInterviewSession,
} from "@/lib/db";
import { nextAssistantTurn } from "@/lib/interview/engine";
import {
  generateInterviewerTurnWithLlm,
  isInterviewLlmConfigured,
} from "@/lib/interview/llm";
import { logInterviewEvent } from "@/lib/interview/observability";
import { consumeRateLimit, getClientIp, readEnvInt } from "@/lib/interview/rate-limit";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const processingTurns = new Set<string>();

const TURN_RATE_LIMIT = readEnvInt("INTERVIEW_RATE_TURNS", 40);
const TURN_RATE_WINDOW_MS = readEnvInt("INTERVIEW_RATE_TURNS_WINDOW_MS", 60 * 1000);
const MAX_CANDIDATE_TURNS = readEnvInt("INTERVIEW_MAX_CANDIDATE_TURNS", 25);
const MAX_SESSION_DURATION_MINUTES = readEnvInt("INTERVIEW_MAX_SESSION_DURATION_MIN", 90);

function isSessionLockedForTurns(status: string, phase: string): boolean {
  return status === "cancelled" || status === "completed" || phase === "scoring" || phase === "done";
}

export async function POST(request: Request, context: SessionRouteContext) {
  const { id } = await context.params;

  const clientIp = getClientIp(request);
  const rateLimit = consumeRateLimit(
    `turn:${clientIp}:${id}`,
    TURN_RATE_LIMIT,
    TURN_RATE_WINDOW_MS
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many turn submissions. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSec),
        },
      }
    );
  }

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

    if (session.startedAt) {
      const startedAtMs = Date.parse(session.startedAt);
      if (Number.isFinite(startedAtMs)) {
        const elapsedMin = (Date.now() - startedAtMs) / (60 * 1000);
        if (elapsedMin > MAX_SESSION_DURATION_MINUTES) {
          updateInterviewSession(id, {
            status: "cancelled",
            phase: "done",
            endedAt: new Date().toISOString(),
          });

          return NextResponse.json(
            { error: "Session expired due to max duration. Please start a new session." },
            { status: 410 }
          );
        }
      }
    }

    const messagesBeforeTurn = listInterviewMessages(id);
    const candidateTurnCount = messagesBeforeTurn.filter((m) => m.role === "candidate").length;

    if (candidateAnswer && candidateTurnCount >= MAX_CANDIDATE_TURNS) {
      return NextResponse.json(
        { error: "Session reached the maximum answer limit. Please end and score." },
        { status: 410 }
      );
    }

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
    let llmMeta:
      | {
          provider: string;
          model: string;
          fallbackUsed: boolean;
          latencyMs?: number;
          attempts?: number;
        }
      | null = null;

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

        addInterviewProviderUsage({
          sessionId: id,
          category: "llm",
          provider: llmTurn.meta.provider,
          model: llmTurn.meta.model,
          latencyMs: llmTurn.meta.latencyMs,
          fallbackUsed: llmTurn.meta.fallbackUsed,
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("LLM interviewer turn failed, using deterministic fallback", error);
        addInterviewProviderUsage({
          sessionId: id,
          category: "llm",
          provider: "deterministic",
          model: "fallback",
          success: false,
          error: message,
        });
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

    logInterviewEvent("info", "assistant_turn_generated", {
      sessionId: id,
      turnKind: turn.kind,
      usedLlm: Boolean(llmMeta),
      provider: llmMeta?.provider || "deterministic",
      model: llmMeta?.model || "fallback",
      fallbackUsed: llmMeta?.fallbackUsed || false,
      clientIp,
    });

    return NextResponse.json({
      session: updatedSession,
      assistantMessage,
      turn: { ...turn, content: assistantContent },
      llm: llmMeta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logInterviewEvent("error", "assistant_turn_error", {
      sessionId: id,
      error: message,
    });

    return NextResponse.json(
      { error: "Unable to generate assistant turn" },
      { status: 500 }
    );
  } finally {
    processingTurns.delete(id);
  }
}
