import { NextResponse } from "next/server";

import { pingDatabase } from "@/lib/db";
import { isInterviewLlmConfigured } from "@/lib/interview/llm";
import { getVoiceCapabilities } from "@/lib/interview/server-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dbHealthy = pingDatabase();
  const llmConfigured = isInterviewLlmConfigured();
  const voice = getVoiceCapabilities();

  const healthy = dbHealthy && llmConfigured && voice.sttServerAvailable && voice.ttsServerAvailable;

  return NextResponse.json(
    {
      healthy,
      dbHealthy,
      llmConfigured,
      voice,
      ts: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
