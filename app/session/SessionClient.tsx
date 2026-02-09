"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createSpeechRecognition,
  speakText,
  SpeechRecognitionLike,
  stopSpeaking,
} from "@/lib/interview/browser-voice";

type VoiceProvider = "browser" | "server";

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

type VoiceCapabilities = {
  sttServerAvailable: boolean;
  ttsServerAvailable: boolean;
  serverVoiceAvailable: boolean;
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [candidateAnswer, setCandidateAnswer] = useState("");

  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("browser");
  const [voiceCapabilities, setVoiceCapabilities] = useState<VoiceCapabilities>({
    sttServerAvailable: false,
    ttsServerAvailable: false,
    serverVoiceAvailable: false,
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const fallbackToBrowserVoice = (message: string) => {
    setVoiceProvider("browser");
    if (typeof window !== "undefined") {
      localStorage.setItem("interview_voice_provider", "browser");
    }
    setNotice(message);
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

  useEffect(() => {
    const loadVoiceCapabilities = async () => {
      try {
        const response = await fetch("/api/interview/voice");
        const data = (await response.json()) as VoiceCapabilities;
        if (!response.ok) return;

        setVoiceCapabilities(data);

        const saved =
          typeof window !== "undefined"
            ? (localStorage.getItem("interview_voice_provider") as VoiceProvider | null)
            : null;

        if (saved === "server" && data.serverVoiceAvailable) {
          setVoiceProvider("server");
        }
      } catch {
        // Keep defaults and browser fallback.
      }
    };

    void loadVoiceCapabilities();
  }, []);

  useEffect(() => {
    if (voiceProvider === "server" && !voiceCapabilities.serverVoiceAvailable) {
      fallbackToBrowserVoice("Server voice is unavailable. Switched to browser voice.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceCapabilities.serverVoiceAvailable]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
      stopSpeaking();
    };
  }, []);

  const playServerTts = async (text: string) => {
    const response = await fetchWithTimeout(
      `/api/interview/sessions/${sessionId}/tts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      15000
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Unable to generate TTS audio");
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);

    audioRef.current?.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    try {
      await audio.play();
    } finally {
      setTimeout(() => URL.revokeObjectURL(audioUrl), 60000);
    }
  };

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
      if (voiceProvider === "server" && voiceCapabilities.ttsServerAvailable) {
        try {
          await playServerTts(data.assistantMessage.content);
        } catch {
          fallbackToBrowserVoice("Server TTS failed. Switched to browser voice output.");
          speakText(data.assistantMessage.content, { rate: 1, pitch: 1 });
        }
      } else {
        speakText(data.assistantMessage.content, { rate: 1, pitch: 1 });
      }
    }
  };

  const handleStartSession = async () => {
    try {
      setSending(true);
      setError(null);
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
      setError(null);
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

  const transcribeServerAudio = async (audioBlob: Blob) => {
    try {
      setIsTranscribing(true);
      setError(null);

      const formData = new FormData();
      formData.append("audio", audioBlob, "candidate-answer.webm");

      const response = await fetchWithTimeout(
        `/api/interview/sessions/${sessionId}/stt`,
        {
          method: "POST",
          body: formData,
        },
        10000
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to transcribe audio");
      }

      if (data?.transcript) {
        setCandidateAnswer((prev) => `${prev} ${String(data.transcript)}`.trim());
      }
    } catch {
      fallbackToBrowserVoice("Server STT failed. Switched to browser microphone mode.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const startServerRecording = async () => {
    if (!voiceCapabilities.sttServerAvailable) {
      fallbackToBrowserVoice("Server STT is unavailable. Switched to browser microphone mode.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      fallbackToBrowserVoice("Microphone capture API unavailable. Switched to browser mode.");
      return;
    }

    try {
      setError(null);
      setInterimTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        setIsListening(false);

        const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        recordedChunksRef.current = [];

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        if (audioBlob.size > 0) {
          void transcribeServerAudio(audioBlob);
        }
      };

      recorder.start();
      setIsListening(true);
    } catch {
      fallbackToBrowserVoice("Could not access microphone for server STT. Using browser mode.");
    }
  };

  const stopServerRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleStartListening = () => {
    if (voiceProvider === "server") {
      void startServerRecording();
      return;
    }

    if (!recognitionRef.current) return;
    setInterimTranscript("");
    recognitionRef.current.start();
    setIsListening(true);
  };

  const handleStopListening = () => {
    if (voiceProvider === "server") {
      stopServerRecording();
      return;
    }

    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
  };

  const handleStopVoicePlayback = () => {
    audioRef.current?.pause();
    stopSpeaking();
  };

  const handleToggleSpeak = () => {
    if (isListening) {
      handleStopListening();
      return;
    }

    handleStopVoicePlayback();
    handleStartListening();
  };

  const handleVoiceProviderChange = (next: VoiceProvider) => {
    if (next === "server" && !voiceCapabilities.serverVoiceAvailable) {
      fallbackToBrowserVoice("Server voice is not configured. Staying on browser voice.");
      return;
    }

    setVoiceProvider(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("interview_voice_provider", next);
    }
    setNotice(next === "server" ? "Using server voice mode." : "Using browser voice mode.");
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

        {notice ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {notice}
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

            {isTranscribing ? (
              <p className="text-xs text-blue-300">Transcribing audio...</p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSpeak}
                  disabled={isTranscribing || (!speechSupported && !voiceCapabilities.sttServerAvailable)}
                  className={`rounded border px-3 py-2 text-xs font-semibold ${
                    isListening
                      ? "border-red-400/50 text-red-200"
                      : "border-emerald-400/50 text-emerald-200"
                  } disabled:opacity-50`}
                >
                  {isListening ? "Stop speak" : "Start speak"}
                </button>

                <button
                  type="submit"
                  disabled={sending || isTranscribing || !candidateAnswer.trim()}
                  className="rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                >
                  Send
                </button>

                {!speechSupported && !voiceCapabilities.sttServerAvailable ? (
                  <span className="text-xs text-slate-500">Mic capture not supported here.</span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2">
                  <span>Voice</span>
                  <select
                    value={voiceProvider}
                    onChange={(e) =>
                      handleVoiceProviderChange(e.target.value as VoiceProvider)
                    }
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                  >
                    <option value="browser">Browser</option>
                    <option
                      value="server"
                      disabled={!voiceCapabilities.serverVoiceAvailable}
                    >
                      Server
                    </option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                  />
                  Auto-speak interviewer
                </label>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
