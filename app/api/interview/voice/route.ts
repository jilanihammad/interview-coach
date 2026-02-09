import { NextResponse } from "next/server";

import { getVoiceCapabilities } from "@/lib/interview/server-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getVoiceCapabilities());
}
