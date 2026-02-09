import { beforeEach, describe, expect, it, vi } from "vitest";

const getInterviewSessionById = vi.fn();
const transcribeAudio = vi.fn();
const synthesizeSpeech = vi.fn();
const getVoiceCapabilities = vi.fn();

vi.mock("@/lib/db", () => ({
  getInterviewSessionById,
}));

vi.mock("@/lib/interview/server-voice", () => ({
  transcribeAudio,
  synthesizeSpeech,
  getVoiceCapabilities,
}));

const sttRoute = await import("@/app/api/interview/sessions/[id]/stt/route");
const ttsRoute = await import("@/app/api/interview/sessions/[id]/tts/route");
const voiceRoute = await import("@/app/api/interview/voice/route");

describe("voice routes", () => {
  beforeEach(() => {
    getInterviewSessionById.mockReset();
    transcribeAudio.mockReset();
    synthesizeSpeech.mockReset();
    getVoiceCapabilities.mockReset();

    getInterviewSessionById.mockReturnValue({ id: "s1" });
  });

  it("returns capabilities", async () => {
    getVoiceCapabilities.mockReturnValue({
      sttServerAvailable: true,
      ttsServerAvailable: false,
      serverVoiceAvailable: false,
      activeSttProvider: "openai",
      availableSttProviders: ["openai", "whisper"],
      activeTtsProvider: null,
      availableTtsProviders: [],
    });

    const res = await voiceRoute.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.serverVoiceAvailable).toBe(false);
  });

  it("stt returns 404 for missing session", async () => {
    getInterviewSessionById.mockReturnValue(null);

    const form = new FormData();
    form.append("audio", new File([new Uint8Array([1])], "a.webm", { type: "audio/webm" }));

    const res = await sttRoute.POST(new Request("http://localhost", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("stt validates missing audio", async () => {
    const form = new FormData();

    const res = await sttRoute.POST(new Request("http://localhost", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "s1" }),
    });

    expect(res.status).toBe(400);
  });

  it("stt returns transcript on success", async () => {
    transcribeAudio.mockResolvedValue("hello world");

    const form = new FormData();
    form.append("audio", new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" }));

    const res = await sttRoute.POST(new Request("http://localhost", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "s1" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.transcript).toBe("hello world");
  });

  it("stt maps timeout errors to 504", async () => {
    transcribeAudio.mockRejectedValue(new Error("Whisper STT timed out"));

    const form = new FormData();
    form.append("audio", new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" }));

    const res = await sttRoute.POST(new Request("http://localhost", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "s1" }),
    });

    expect(res.status).toBe(504);
  });

  it("tts returns 400 for empty text", async () => {
    const res = await ttsRoute.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "" }) }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("tts returns audio/mpeg on success", async () => {
    synthesizeSpeech.mockResolvedValue(Buffer.from([1, 2, 3]));

    const res = await ttsRoute.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ text: "hi" }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/mpeg");
  });

  it("tts maps not-configured errors to 503", async () => {
    synthesizeSpeech.mockRejectedValue(new Error("No TTS provider configured"));

    const res = await ttsRoute.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(503);
  });
});
