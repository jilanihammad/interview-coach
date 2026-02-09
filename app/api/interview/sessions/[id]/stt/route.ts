import { NextResponse } from "next/server";

import { getInterviewSessionById } from "@/lib/db";
import { transcribeAudioWithDeepgram } from "@/lib/interview/server-voice";

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

    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "audio file is required" },
        { status: 400 }
      );
    }

    const mimeType = audioFile.type || "audio/webm";
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    if (!audioBuffer.length) {
      return NextResponse.json({ error: "audio file is empty" }, { status: 400 });
    }

    const transcript = await transcribeAudioWithDeepgram(audioBuffer, mimeType);

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Error transcribing interview audio", error);
    const message = error instanceof Error ? error.message : "Unable to transcribe audio";

    if (message.includes("not configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
