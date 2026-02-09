"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Session = {
  id: string;
  status: string;
  phase: string;
  targetCompany: string;
  roleTitle: string;
  roleLevel?: string;
  mode: "time" | "question_count";
  targetDurationMinutes?: number;
  targetQuestionCount?: number;
  createdAt: string;
};

type Message = {
  id: string;
  role: "assistant" | "candidate" | "system";
  content: string;
  createdAt: string;
};

export default function SessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") || "";

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [candidateAnswer, setCandidateAnswer] = useState("");

  const timerLabel = useMemo(() => {
    if (!session) return "";
    if (session.mode === "time") {
      return `${session.targetDurationMinutes ?? 45} min`;
    }
    return `${session.targetQuestionCount ?? 5} questions`;
  }, [session]);

  const loadSession = async () => {
    if (!sessionId) {
      setError("Missing session id");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/interview/sessions/${sessionId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to load interview session");
      }
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load interview session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const postMessage = async (role: Message["role"], content: string) => {
    const response = await fetch(`/api/interview/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to add message");
    setMessages((prev) => [...prev, data.message]);
  };

  const handleStartSession = async () => {
    if (!session) return;

    try {
      setSending(true);
      await fetch(`/api/interview/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "in_progress",
          phase: "intro",
          startedAt: new Date().toISOString(),
        }),
      });

      await postMessage(
        "assistant",
        `Welcome. We'll run a realistic behavioral interview for ${session.roleTitle} at ${session.targetCompany}. Start by telling me about yourself and why this role is a fit.`
      );

      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start session");
    } finally {
      setSending(false);
    }
  };

  const handleCandidateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!candidateAnswer.trim()) return;

    try {
      setSending(true);
      const answer = candidateAnswer.trim();
      setCandidateAnswer("");

      await postMessage("candidate", answer);
      await postMessage(
        "assistant",
        "Thanks — good detail there. Follow-up: what was the measurable result, and what would you do differently next time?"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send answer");
    } finally {
      setSending(false);
    }
  };

  const handleEndSession = async () => {
    if (!session) return;

    try {
      setSending(true);
      await fetch(`/api/interview/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          phase: "scoring",
          endedAt: new Date().toISOString(),
        }),
      });

      router.push(`/feedback?id=${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end session");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto max-w-3xl text-sm text-slate-400">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Interview Session</p>
            <h1 className="text-2xl font-semibold">
              {session?.roleTitle} @ {session?.targetCompany}
            </h1>
            <p className="text-sm text-slate-400">
              {session?.roleLevel ? `${session.roleLevel} • ` : ""}
              {timerLabel} • phase: {session?.phase}
            </p>
          </div>
          <div className="flex gap-2">
            {session?.status === "draft" ? (
              <button
                type="button"
                onClick={handleStartSession}
                disabled={sending}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Start
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleEndSession}
              disabled={sending || !session}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              End and score
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Transcript (skeleton)</h2>
          <div className="max-h-[420px] space-y-2 overflow-auto rounded border border-slate-800 bg-slate-950/50 p-3">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet. Start the session.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded p-2 text-sm ${
                    m.role === "assistant"
                      ? "bg-blue-500/10 text-blue-100"
                      : m.role === "candidate"
                        ? "bg-slate-800 text-slate-100"
                        : "bg-amber-500/10 text-amber-100"
                  }`}
                >
                  <p className="mb-1 text-[11px] uppercase tracking-wide opacity-70">{m.role}</p>
                  <p>{m.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleCandidateSubmit} className="mt-3 space-y-2">
            <textarea
              value={candidateAnswer}
              onChange={(e) => setCandidateAnswer(e.target.value)}
              rows={4}
              placeholder="Type candidate answer (voice bridge will plug into this next)..."
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !candidateAnswer.trim()}
              className="rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              Send answer + follow-up
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
