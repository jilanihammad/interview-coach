import { NextResponse } from "next/server";
import { analyzeRepo } from "@/lib/repo-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const repoPath = String(body?.repoPath || ".").trim();

    if (!repoPath) {
      return NextResponse.json({ error: "repoPath is required" }, { status: 400 });
    }

    const analysis = analyzeRepo(repoPath);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error analyzing repo context", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to analyze repo" },
      { status: 500 }
    );
  }
}
