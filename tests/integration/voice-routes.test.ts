import { beforeEach, describe, expect, it, vi } from "vitest";

const getInterviewSessionById = vi.fn();
const transcribeAudioWithDeepgram = vi.fn();
const synthesizeSpeechWithElevenLabs = vi.fn();
const getVoiceCapabilities = vi.fn();

vi.mock("@/lib/db", () => ({
  getInterviewSessionById,
}));

vi.mock("@/lib/interview/server-voice", () => ({
  transcribeAudioWithDeepgram,
  synthesizeSpeechWithElevenLabs,
  getVoiceCapabilities,
}));

const sttRoute = await import("@/app/api/interview/sessions/[id]/stt/route");
const ttsRoute = await import("@/app/api/interview/sessions/[id]/tts/route");
const voiceRoute = await import("@/app/api/interview/voice/route");

describe("voice routes", () => {
  beforeEach(() => {
    getInterviewSessionById.mockReset();
    transcribeAudioWithDeepgram.mockReset();
    synthesizeSpeechWithElevenLabs.mockReset();
    getVoiceCapabilities.mockReset();

    getInterviewSessionById.mockReturnValue({ id: "s1" });
  });

  it("returns capabilities", async () => {
    getVoiceCapabilities.mockReturnValue({
      sttServerAvailable: true,
      ttsServerAvailable: false,
      serverVoiceAvailable: false,
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
    transcribeAudioWithDeepgram.mockResolvedValue("hello world");

    const form = new FormData();
    form.append("audio", new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" }));

    const res = await sttRoute.POST(new Request("http://localhost", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "s1" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.transcript).toBe("hello world");
  });

  it("tts returns 400 for empty text", async () => {
    const res = await ttsRoute.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "" }) }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("tts returns audio/mpeg on success", async () => {
    synthesizeSpeechWithElevenLabs.mockResolvedValue(Buffer.from([1, 2, 3]));

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
    synthesizeSpeechWithElevenLabs.mockRejectedValue(new Error("ELEVENLABS_API_KEY is not configured"));

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
