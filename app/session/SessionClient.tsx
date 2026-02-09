"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createSpeechRecognition,
  speakText,
  SpeechRecognitionLike,
  stopSpeaking,
} from "@/lib/interview/browser-voice";

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

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [candidateAnswer, setCandidateAnswer] = useState("");

  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const timerLabel = useMemo(() => {
    if (!session) return "";
    if (session.mode === "time") {
      return `${session.targetDurationMinutes ?? 45} min`;
    }
    return `${session.targetQuestionCount ?? 5} questions`;
  }, [session]);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "",
    [messages]
  );

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

  useEffect(() => {
    const recognition = createSpeechRecognition("en-US");
    if (!recognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let finalized = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalized += `${text.trim()} `;
        } else {
          interim += text;
        }
      }

      if (finalized.trim()) {
        setCandidateAnswer((prev) => `${prev} ${finalized}`.trim());
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognition.stop();
    };
  }, []);

  const runAssistantTurn = async (payload?: { candidateAnswer?: string }) => {
    const response = await fetch(`/api/interview/sessions/${sessionId}/assistant-turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to generate assistant turn");

    await loadSession();

    if (autoSpeak && data?.assistantMessage?.content) {
      speakText(data.assistantMessage.content, { rate: 1, pitch: 1 });
    }
  };

  const handleStartSession = async () => {
    try {
      setSending(true);
      await runAssistantTurn();
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
      setInterimTranscript("");

      await runAssistantTurn({ candidateAnswer: answer });
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

  const handleStartListening = () => {
    if (!recognitionRef.current) return;
    setInterimTranscript("");
    recognitionRef.current.start();
    setIsListening(true);
  };

  const handleStopListening = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
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
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => speakText(latestAssistantMessage)}
              disabled={!latestAssistantMessage}
              className="rounded border border-slate-700 px-3 py-2 text-xs text-white disabled:opacity-50"
            >
              Speak last prompt
            </button>
            <button
              type="button"
              onClick={stopSpeaking}
              className="rounded border border-slate-700 px-3 py-2 text-xs text-white"
            >
              Stop voice
            </button>
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
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Transcript</h2>
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
              placeholder="Speak or type your answer..."
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />

            {interimTranscript ? (
              <p className="text-xs text-slate-400">Listening: {interimTranscript}</p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={sending || !candidateAnswer.trim()}
                  className="rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                >
                  Send answer
                </button>

                {speechSupported ? (
                  isListening ? (
                    <button
                      type="button"
                      onClick={handleStopListening}
                      className="rounded border border-red-400/50 px-3 py-2 text-xs text-red-200"
                    >
                      Stop mic
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartListening}
                      className="rounded border border-emerald-400/50 px-3 py-2 text-xs text-emerald-200"
                    >
                      Start mic
                    </button>
                  )
                ) : (
                  <span className="text-xs text-slate-500">
                    Browser speech recognition not supported here.
                  </span>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                />
                Auto-speak interviewer
              </label>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
