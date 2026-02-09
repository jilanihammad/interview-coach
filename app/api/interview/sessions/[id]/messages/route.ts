import { NextResponse } from "next/server";

import {
  addInterviewMessage,
  getInterviewSessionById,
  listInterviewMessages,
} from "@/lib/db";
import { InterviewMessageRole } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRouteContext = { params: Promise<{ id: string }> };

const allowedRoles: InterviewMessageRole[] = ["assistant", "candidate", "system"];

export async function GET(_request: Request, context: SessionRouteContext) {
  const { id } = await context.params;
  const session = getInterviewSessionById(id);
  if (!session) {
    return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
  }

  const messages = listInterviewMessages(id);
  return NextResponse.json({ messages });
}

export async function POST(request: Request, context: SessionRouteContext) {
  try {
    const { id } = await context.params;
    const session = getInterviewSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }

    const body = await request.json();
    const role = body?.role as InterviewMessageRole;
    const content = String(body?.content ?? "").trim();

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "role must be assistant, candidate, or system" },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const message = addInterviewMessage(id, role, content, body?.meta);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Error adding interview message", error);
    return NextResponse.json(
      { error: "Unable to add interview message" },
      { status: 500 }
    );
  }
}
