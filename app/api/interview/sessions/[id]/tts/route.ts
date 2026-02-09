import { NextResponse } from "next/server";

import { getInterviewSessionById } from "@/lib/db";
import { synthesizeSpeech } from "@/lib/interview/server-voice";

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

    const body = (await request.json()) as { text?: string };
    const text = String(body?.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const audioBuffer = await synthesizeSpeech(text);

    return new Response(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating interview audio", error);
    const message = error instanceof Error ? error.message : "Unable to generate audio";

    if (message.includes("not configured") || message.includes("No TTS provider configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
