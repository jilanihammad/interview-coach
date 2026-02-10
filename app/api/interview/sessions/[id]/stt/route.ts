import { NextResponse } from "next/server";

import {
  addInterviewProviderUsage,
  getInterviewSessionById,
} from "@/lib/db";
import { logInterviewEvent } from "@/lib/interview/observability";
import { consumeRateLimit, getClientIp, readEnvInt } from "@/lib/interview/rate-limit";
import { transcribeAudio } from "@/lib/interview/server-voice";

type SessionRouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STT_RATE_LIMIT = readEnvInt("INTERVIEW_RATE_STT", 40);
const STT_RATE_WINDOW_MS = readEnvInt("INTERVIEW_RATE_STT_WINDOW_MS", 60 * 1000);
const MAX_AUDIO_BYTES = readEnvInt("INTERVIEW_MAX_AUDIO_BYTES", 5 * 1024 * 1024);

export async function POST(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const clientIp = getClientIp(request);

    const rateLimit = consumeRateLimit(
      `stt:${clientIp}:${id}`,
      STT_RATE_LIMIT,
      STT_RATE_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many transcription requests. Please slow down." },
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

    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "audio file is required" },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `audio file exceeds maximum size (${MAX_AUDIO_BYTES} bytes)` },
        { status: 413 }
      );
    }

    const mimeType = audioFile.type || "audio/webm";
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    if (!audioBuffer.length) {
      return NextResponse.json({ error: "audio file is empty" }, { status: 400 });
    }

    const result = await transcribeAudio(audioBuffer, mimeType);

    addInterviewProviderUsage({
      sessionId: id,
      category: "stt",
      provider: result.meta.provider,
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
      fallbackUsed: result.meta.fallbackUsed,
      success: true,
    });

    logInterviewEvent("info", "stt_success", {
      sessionId: id,
      provider: result.meta.provider,
      model: result.meta.model,
      fallbackUsed: result.meta.fallbackUsed,
      latencyMs: result.meta.latencyMs,
      clientIp,
    });

    return NextResponse.json({ transcript: result.transcript, stt: result.meta });
  } catch (error) {
    console.error("Error transcribing interview audio", error);
    const message = error instanceof Error ? error.message : "Unable to transcribe audio";

    addInterviewProviderUsage({
      category: "stt",
      provider: "unknown",
      model: undefined,
      success: false,
      error: message,
    });

    if (message.includes("not configured") || message.includes("No STT provider configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    if (message.toLowerCase().includes("no speech detected")) {
      return NextResponse.json({ error: "no speech detected" }, { status: 400 });
    }

    if (message.toLowerCase().includes("timed out")) {
      return NextResponse.json({ error: "transcription timed out" }, { status: 504 });
    }

    if (message.toLowerCase().includes("invalid") || message.toLowerCase().includes("codec")) {
      return NextResponse.json({ error: "unsupported or invalid audio" }, { status: 422 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
