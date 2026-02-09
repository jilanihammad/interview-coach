import { NextResponse } from "next/server";

import {
  addInterviewScore,
  getInterviewSessionById,
  listInterviewScores,
} from "@/lib/db";
import { InterviewScoreDimension } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRouteContext = { params: Promise<{ id: string }> };

const allowedDimensions: InterviewScoreDimension[] = [
  "star_structure",
  "specificity",
  "clarity",
  "relevance",
  "leadership_impact",
];

export async function GET(_request: Request, context: SessionRouteContext) {
  const { id } = await context.params;
  const session = getInterviewSessionById(id);
  if (!session) {
    return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
  }

  const scores = listInterviewScores(id);
  return NextResponse.json({ scores });
}

export async function POST(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const session = getInterviewSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    const body = await request.json();
    const dimension = body?.dimension as InterviewScoreDimension;
    const score = Number(body?.score);
    const rationale = String(body?.rationale ?? "").trim();
    const recommendedFix = String(body?.recommendedFix ?? "").trim();

    if (!allowedDimensions.includes(dimension)) {
      return NextResponse.json({ error: "Invalid score dimension" }, { status: 400 });
    }

    if (!Number.isFinite(score)) {
      return NextResponse.json({ error: "score is required" }, { status: 400 });
    }

    if (!rationale) {
      return NextResponse.json({ error: "rationale is required" }, { status: 400 });
    }

    const saved = addInterviewScore(
      id,
      dimension,
      score,
      rationale,
      recommendedFix || undefined
    );

    return NextResponse.json({ score: saved }, { status: 201 });
  } catch (error) {
    console.error("Error adding interview score", error);
    return NextResponse.json(
      { error: "Unable to add interview score" },
      { status: 500 }
    );
  }
}
