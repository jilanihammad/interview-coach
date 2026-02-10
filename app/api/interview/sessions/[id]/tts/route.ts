import { NextResponse } from "next/server";

import {
  addInterviewProviderUsage,
  getInterviewSessionById,
} from "@/lib/db";
import { logInterviewEvent } from "@/lib/interview/observability";
import { consumeRateLimit, getClientIp, readEnvInt } from "@/lib/interview/rate-limit";
import { synthesizeSpeech } from "@/lib/interview/server-voice";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTS_RATE_LIMIT = readEnvInt("INTERVIEW_RATE_TTS", 40);
const TTS_RATE_WINDOW_MS = readEnvInt("INTERVIEW_RATE_TTS_WINDOW_MS", 60 * 1000);

export async function POST(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const clientIp = getClientIp(request);

    const rateLimit = consumeRateLimit(
      `tts:${clientIp}:${id}`,
      TTS_RATE_LIMIT,
      TTS_RATE_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many TTS requests. Please slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSec),
          },
        }
      );
    }

    const session = getInterviewSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    const body = (await request.json()) as { text?: string };
    const text = String(body?.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const result = await synthesizeSpeech(text);

    addInterviewProviderUsage({
      sessionId: id,
      category: "tts",
      provider: result.meta.provider,
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
      fallbackUsed: result.meta.fallbackUsed,
      success: true,
    });

    logInterviewEvent("info", "tts_success", {
      sessionId: id,
      provider: result.meta.provider,
      model: result.meta.model,
      fallbackUsed: result.meta.fallbackUsed,
      latencyMs: result.meta.latencyMs,
      clientIp,
    });

    return new Response(new Uint8Array(result.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate audio";
    console.error("Error generating interview audio", error);

    addInterviewProviderUsage({
      category: "tts",
      provider: "unknown",
      success: false,
      error: message,
    });

    if (message.includes("not configured") || message.includes("No TTS provider configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
