const DEFAULT_DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-2";
const DEFAULT_ELEVENLABS_MODEL =
  process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const DEFAULT_ELEVENLABS_VOICE =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const DEFAULT_OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

type TtsProvider = "elevenlabs" | "openai";

export type VoiceCapabilities = {
  sttServerAvailable: boolean;
  ttsServerAvailable: boolean;
  serverVoiceAvailable: boolean;
  activeTtsProvider: TtsProvider | null;
  availableTtsProviders: TtsProvider[];
};

function parseTtsProvider(value: string | undefined): TtsProvider | null {
  if (value === "elevenlabs" || value === "openai") return value;
  return null;
}

function getAvailableTtsProviders(): TtsProvider[] {
  const providers: TtsProvider[] = [];
  if (process.env.ELEVENLABS_API_KEY) providers.push("elevenlabs");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  return providers;
}

function resolveTtsProvider(): TtsProvider | null {
  const configured = parseTtsProvider(process.env.INTERVIEW_TTS_PROVIDER?.trim());
  const available = getAvailableTtsProviders();

  if (configured && available.includes(configured)) return configured;
  if (available.includes("elevenlabs")) return "elevenlabs";
  if (available.includes("openai")) return "openai";
  return null;
}

export function getVoiceCapabilities(): VoiceCapabilities {
  const sttServerAvailable = Boolean(process.env.DEEPGRAM_API_KEY);
  const availableTtsProviders = getAvailableTtsProviders();
  const activeTtsProvider = resolveTtsProvider();
  const ttsServerAvailable = availableTtsProviders.length > 0;

  return {
    sttServerAvailable,
    ttsServerAvailable,
    serverVoiceAvailable: sttServerAvailable && ttsServerAvailable,
    activeTtsProvider,
    availableTtsProviders,
  };
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

  const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return transcript?.trim() || "";
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

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const provider = resolveTtsProvider();

  if (!provider) {
    throw new Error("No TTS provider configured");
  }

  if (provider === "openai") {
    return synthesizeSpeechWithOpenAI(text);
  }

  return synthesizeSpeechWithElevenLabs(text);
}
