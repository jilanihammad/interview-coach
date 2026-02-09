const DEFAULT_DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-2";
const DEFAULT_ELEVENLABS_MODEL =
  process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const DEFAULT_ELEVENLABS_VOICE =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

export type VoiceCapabilities = {
  sttServerAvailable: boolean;
  ttsServerAvailable: boolean;
  serverVoiceAvailable: boolean;
};

export function getVoiceCapabilities(): VoiceCapabilities {
  const sttServerAvailable = Boolean(process.env.DEEPGRAM_API_KEY);
  const ttsServerAvailable = Boolean(process.env.ELEVENLABS_API_KEY);

  return {
    sttServerAvailable,
    ttsServerAvailable,
    serverVoiceAvailable: sttServerAvailable && ttsServerAvailable,
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
