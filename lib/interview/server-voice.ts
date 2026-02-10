import { execFile, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-2";
const DEFAULT_OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || "whisper-1";
const DEFAULT_OPENAI_STT_LANGUAGE = process.env.OPENAI_STT_LANGUAGE || "en";
const DEFAULT_WHISPER_COMMAND = process.env.WHISPER_COMMAND || "whisper";
const DEFAULT_WHISPER_MODEL = process.env.WHISPER_MODEL || "base";
const DEFAULT_WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || "en";
const DEFAULT_WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 120_000);

const DEFAULT_ELEVENLABS_MODEL =
  process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const DEFAULT_ELEVENLABS_VOICE =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const DEFAULT_OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

type TtsProvider = "elevenlabs" | "openai";
type SttProvider = "deepgram" | "openai" | "whisper";

export type ProviderRunMeta = {
  provider: string;
  model?: string;
  fallbackUsed: boolean;
  latencyMs: number;
  attempts: number;
};

export type SttResult = {
  transcript: string;
  meta: ProviderRunMeta;
};

export type TtsResult = {
  audioBuffer: Buffer;
  meta: ProviderRunMeta;
};

export type VoiceCapabilities = {
  sttServerAvailable: boolean;
  ttsServerAvailable: boolean;
  serverVoiceAvailable: boolean;
  activeSttProvider: SttProvider | null;
  availableSttProviders: SttProvider[];
  activeTtsProvider: TtsProvider | null;
  availableTtsProviders: TtsProvider[];
};

function parseTtsProvider(value: string | undefined): TtsProvider | null {
  if (value === "elevenlabs" || value === "openai") return value;
  return null;
}

function parseSttProvider(value: string | undefined): SttProvider | null {
  if (value === "deepgram" || value === "openai" || value === "whisper") return value;
  return null;
}

let whisperCommandAvailableCache: boolean | null = null;

function isWhisperCommandAvailable(): boolean {
  if (whisperCommandAvailableCache !== null) {
    return whisperCommandAvailableCache;
  }

  if (DEFAULT_WHISPER_COMMAND.includes(path.sep)) {
    const result = spawnSync(DEFAULT_WHISPER_COMMAND, ["--help"], { stdio: "ignore" });
    whisperCommandAvailableCache = result.status === 0 || result.status === 1;
    return whisperCommandAvailableCache;
  }

  const result = spawnSync("which", [DEFAULT_WHISPER_COMMAND], { stdio: "ignore" });
  whisperCommandAvailableCache = result.status === 0;
  return whisperCommandAvailableCache;
}

function getAvailableSttProviders(): SttProvider[] {
  const providers: SttProvider[] = [];
  if (process.env.DEEPGRAM_API_KEY) providers.push("deepgram");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (isWhisperCommandAvailable()) providers.push("whisper");
  return providers;
}

function getAvailableTtsProviders(): TtsProvider[] {
  const providers: TtsProvider[] = [];
  if (process.env.ELEVENLABS_API_KEY) providers.push("elevenlabs");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  return providers;
}

function resolveSttProvider(): SttProvider | null {
  const configured = parseSttProvider(process.env.INTERVIEW_STT_PROVIDER?.trim());
  const available = getAvailableSttProviders();

  if (configured && available.includes(configured)) return configured;
  if (available.includes("openai")) return "openai";
  if (available.includes("deepgram")) return "deepgram";
  if (available.includes("whisper")) return "whisper";
  return null;
}

function resolveTtsProvider(): TtsProvider | null {
  const configured = parseTtsProvider(process.env.INTERVIEW_TTS_PROVIDER?.trim());
  const available = getAvailableTtsProviders();

  if (configured && available.includes(configured)) return configured;
  if (available.includes("openai")) return "openai";
  if (available.includes("elevenlabs")) return "elevenlabs";
  return null;
}

function sttModelForProvider(provider: SttProvider): string {
  if (provider === "deepgram") return DEFAULT_DEEPGRAM_MODEL;
  if (provider === "openai") return DEFAULT_OPENAI_STT_MODEL;
  return DEFAULT_WHISPER_MODEL;
}

function ttsModelForProvider(provider: TtsProvider): string {
  if (provider === "openai") return DEFAULT_OPENAI_TTS_MODEL;
  return DEFAULT_ELEVENLABS_MODEL;
}

function resolveSttProviderChain(): SttProvider[] {
  const available = getAvailableSttProviders();
  const configured = resolveSttProvider();

  const fallbacks = (process.env.INTERVIEW_STT_FALLBACKS || "")
    .split(",")
    .map((value) => parseSttProvider(value.trim()))
    .filter((value): value is SttProvider => value !== null);

  const ordered = [configured, ...fallbacks].filter(
    (value): value is SttProvider => value !== null
  );

  const withAvailableTail = [
    ...ordered,
    ...available.filter((provider) => !ordered.includes(provider)),
  ];

  return Array.from(new Set(withAvailableTail));
}

export function getVoiceCapabilities(): VoiceCapabilities {
  const availableSttProviders = getAvailableSttProviders();
  const availableTtsProviders = getAvailableTtsProviders();
  const activeSttProvider = resolveSttProvider();
  const activeTtsProvider = resolveTtsProvider();

  const sttServerAvailable = availableSttProviders.length > 0;
  const ttsServerAvailable = availableTtsProviders.length > 0;

  return {
    sttServerAvailable,
    ttsServerAvailable,
    serverVoiceAvailable: sttServerAvailable && ttsServerAvailable,
    activeSttProvider,
    availableSttProviders,
    activeTtsProvider,
    availableTtsProviders,
  };
}

function inferAudioExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export async function transcribeAudioWithDeepgram(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    model: DEFAULT_DEEPGRAM_MODEL,
    punctuate: "true",
    smart_format: "true",
    filler_words: "false",
  });

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType || "audio/webm",
      },
      body: new Uint8Array(audioBuffer),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Deepgram STT failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };

  const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
  if (!transcript) {
    throw new Error("no speech detected");
  }

  return transcript;
}

export async function transcribeAudioWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const formData = new FormData();
  const extension = inferAudioExtension(mimeType || "audio/webm");

  formData.append("model", DEFAULT_OPENAI_STT_MODEL);
  formData.append("language", DEFAULT_OPENAI_STT_LANGUAGE);
  formData.append(
    "file",
    new File([new Uint8Array(audioBuffer)], `candidate.${extension}`, {
      type: mimeType || "audio/webm",
    })
  );

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI STT failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as { text?: string };
  const transcript = String(payload?.text || "").trim();

  if (!transcript) {
    throw new Error("no speech detected");
  }

  return transcript;
}

export async function transcribeAudioWithWhisper(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!isWhisperCommandAvailable()) {
    throw new Error("WHISPER command is not available");
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "interview-whisper-"));
  const extension = inferAudioExtension(mimeType || "audio/webm");
  const audioPath = path.join(tmpDir, `candidate.${extension}`);
  const outputFile = path.join(tmpDir, "candidate.txt");

  try {
    await fs.writeFile(audioPath, audioBuffer);

    const args = [
      audioPath,
      "--model",
      DEFAULT_WHISPER_MODEL,
      "--output_format",
      "txt",
      "--output_dir",
      tmpDir,
      "--language",
      DEFAULT_WHISPER_LANGUAGE,
      "--verbose",
      "False",
      "--fp16",
      "False",
    ];

    await execFileAsync(DEFAULT_WHISPER_COMMAND, args, {
      timeout: DEFAULT_WHISPER_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    const transcript = (await fs.readFile(outputFile, "utf8")).trim();
    if (!transcript) {
      throw new Error("no speech detected");
    }

    return transcript;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("timed out") || message.includes("ETIMEDOUT")) {
      throw new Error("Whisper STT timed out");
    }
    throw new Error(`Whisper STT failed: ${message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<SttResult> {
  const chain = resolveSttProviderChain();

  if (chain.length === 0) {
    throw new Error("No STT provider configured");
  }

  const errors: string[] = [];

  for (let index = 0; index < chain.length; index += 1) {
    const provider = chain[index];
    const startedAt = Date.now();

    try {
      const transcript =
        provider === "deepgram"
          ? await transcribeAudioWithDeepgram(audioBuffer, mimeType)
          : provider === "openai"
            ? await transcribeAudioWithOpenAI(audioBuffer, mimeType)
            : await transcribeAudioWithWhisper(audioBuffer, mimeType);

      return {
        transcript,
        meta: {
          provider,
          model: sttModelForProvider(provider),
          fallbackUsed: index > 0,
          latencyMs: Date.now() - startedAt,
          attempts: index + 1,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`All STT providers failed (${errors.join(" | ")})`);
}

export async function synthesizeSpeechWithElevenLabs(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: DEFAULT_ELEVENLABS_MODEL,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${detail}`);
  }

  const audio = await response.arrayBuffer();
  return Buffer.from(audio);
}

export async function synthesizeSpeechWithOpenAI(text: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_TTS_MODEL,
      voice: DEFAULT_OPENAI_TTS_VOICE,
      input: text,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI TTS failed: ${response.status} ${detail}`);
  }

  const audio = await response.arrayBuffer();
  return Buffer.from(audio);
}

export async function synthesizeSpeech(text: string): Promise<TtsResult> {
  const provider = resolveTtsProvider();

  if (!provider) {
    throw new Error("No TTS provider configured");
  }

  const startedAt = Date.now();
  const audioBuffer =
    provider === "openai"
      ? await synthesizeSpeechWithOpenAI(text)
      : await synthesizeSpeechWithElevenLabs(text);

  return {
    audioBuffer,
    meta: {
      provider,
      model: ttsModelForProvider(provider),
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt,
      attempts: 1,
    },
  };
}
