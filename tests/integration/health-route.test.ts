import { describe, expect, it, vi } from "vitest";

const pingDatabase = vi.fn();
const isInterviewLlmConfigured = vi.fn();
const getVoiceCapabilities = vi.fn();

vi.mock("@/lib/db", () => ({
  pingDatabase,
}));

vi.mock("@/lib/interview/llm", () => ({
  isInterviewLlmConfigured,
}));

vi.mock("@/lib/interview/server-voice", () => ({
  getVoiceCapabilities,
}));

const { GET } = await import("@/app/api/health/route");

describe("/api/health", () => {
  it("returns 200 when dependencies are healthy", async () => {
    pingDatabase.mockReturnValue(true);
    isInterviewLlmConfigured.mockReturnValue(true);
    getVoiceCapabilities.mockReturnValue({
      sttServerAvailable: true,
      ttsServerAvailable: true,
      serverVoiceAvailable: true,
      activeSttProvider: "openai",
      availableSttProviders: ["openai"],
      activeTtsProvider: "openai",
      availableTtsProviders: ["openai"],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.healthy).toBe(true);
  });

  it("returns 503 when critical dependencies are missing", async () => {
    pingDatabase.mockReturnValue(false);
    isInterviewLlmConfigured.mockReturnValue(false);
    getVoiceCapabilities.mockReturnValue({
      sttServerAvailable: false,
      ttsServerAvailable: false,
      serverVoiceAvailable: false,
      activeSttProvider: null,
      availableSttProviders: [],
      activeTtsProvider: null,
      availableTtsProviders: [],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.healthy).toBe(false);
  });
});
