import {
  buildEvaluatorSystemPrompt,
  buildInterviewerSystemPrompt,
} from "./prompts";
import {
  InterviewFeedbackSummary,
  InterviewMessage,
  InterviewScoreDimension,
  InterviewSession,
} from "./types";

export type InterviewLlmProvider = "openai" | "xai" | "google";

type ProviderConfig = {
  provider: InterviewLlmProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

type ProviderRunMeta = {
  provider: InterviewLlmProvider;
  model: string;
  fallbackUsed: boolean;
  latencyMs: number;
  attempts: number;
};

type JsonObject = Record<string, unknown>;

type EvaluatorDimensionScore = {
  dimension: InterviewScoreDimension;
  score: number;
  rationale: string;
  recommendedFix?: string;
};

type EvaluatorResult = {
  scores: EvaluatorDimensionScore[];
  summary: Pick<InterviewFeedbackSummary, "strengths" | "gaps" | "frameworkSuggestions" | "focusAreas">;
  meta: ProviderRunMeta;
};

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const XAI_BASE_URL = process.env.XAI_BASE_URL || "https://api.x.ai/v1";

const DEFAULT_MODELS: Record<InterviewLlmProvider, string> = {
  openai: process.env.INTERVIEW_LLM_OPENAI_MODEL || "gpt-4.1-mini",
  xai: process.env.INTERVIEW_LLM_XAI_MODEL || "grok-2-latest",
  google: process.env.INTERVIEW_LLM_GOOGLE_MODEL || "gemini-2.0-flash",
};

const REQUIRED_DIMENSIONS: InterviewScoreDimension[] = [
  "star_structure",
  "specificity",
  "clarity",
  "relevance",
  "leadership_impact",
];

const MAX_TRANSCRIPT_CHARS = 10_000;

function parseProvider(value: string | undefined): InterviewLlmProvider | null {
  if (value === "openai" || value === "xai" || value === "google") {
    return value;
  }
  return null;
}

function getConfiguredProvider(provider: InterviewLlmProvider): ProviderConfig | null {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      provider,
      model: process.env.INTERVIEW_LLM_MODEL?.trim() || DEFAULT_MODELS.openai,
      apiKey,
      baseUrl: OPENAI_BASE_URL,
    };
  }

  if (provider === "xai") {
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      provider,
      model: process.env.INTERVIEW_LLM_MODEL?.trim() || DEFAULT_MODELS.xai,
      apiKey,
      baseUrl: XAI_BASE_URL,
    };
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    provider,
    model: process.env.INTERVIEW_LLM_MODEL?.trim() || DEFAULT_MODELS.google,
    apiKey,
  };
}

function getConfiguredProviderChain(): ProviderConfig[] {
  const primary =
    parseProvider(process.env.INTERVIEW_LLM_PROVIDER?.trim()) ||
    (process.env.OPENAI_API_KEY ? "openai" : null) ||
    (process.env.XAI_API_KEY ? "xai" : null) ||
    (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY ? "google" : null);

  const fallbacks = (process.env.INTERVIEW_LLM_FALLBACKS || "")
    .split(",")
    .map((item) => parseProvider(item.trim()))
    .filter((value): value is InterviewLlmProvider => value !== null);

  const ordered = [primary, ...fallbacks].filter(
    (value): value is InterviewLlmProvider => value !== null
  );

  const unique = Array.from(new Set(ordered));

  const configured = unique
    .map((provider) => getConfiguredProvider(provider))
    .filter((value): value is ProviderConfig => value !== null);

  return configured;
}

export function isInterviewLlmConfigured(): boolean {
  return getConfiguredProviderChain().length > 0;
}

function trimTo(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

function compactTranscript(messages: InterviewMessage[]): string {
  const lines = messages.slice(-14).map((message) => {
    const content = message.content.replace(/\s+/g, " ").trim();
    return `${message.role.toUpperCase()}: ${content}`;
  });

  return trimTo(lines.join("\n"), MAX_TRANSCRIPT_CHARS);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiText(payload: JsonObject): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = (choices[0] || {}) as JsonObject;
  const message = (first.message || {}) as JsonObject;
  const content = message.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as JsonObject).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}

function extractGeminiText(payload: JsonObject): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = (candidates[0] || {}) as JsonObject;
  const content = (first.content || {}) as JsonObject;
  const parts = Array.isArray(content.parts) ? content.parts : [];

  const text = parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = (part as JsonObject).text;
      return typeof value === "string" ? value : "";
    })
    .join(" ")
    .trim();

  return text;
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  maxTokens = 700
): Promise<string> {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    },
    30_000
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${config.provider} LLM failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as JsonObject;
  const text = extractOpenAiText(payload);
  if (!text) {
    throw new Error(`${config.provider} LLM returned empty response`);
  }

  return text;
}

async function callGemini(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  maxTokens = 700
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    },
    30_000
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`google LLM failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as JsonObject;
  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error("google LLM returned empty response");
  }

  return text;
}

async function callProvider(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  maxTokens = 700
): Promise<string> {
  if (config.provider === "google") {
    return callGemini(config, systemPrompt, userPrompt, temperature, maxTokens);
  }

  return callOpenAiCompatible(config, systemPrompt, userPrompt, temperature, maxTokens);
}

async function runProviderChain(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  maxTokens = 700
): Promise<{ text: string; meta: ProviderRunMeta }> {
  const chain = getConfiguredProviderChain();
  if (chain.length === 0) {
    throw new Error("No LLM providers configured");
  }

  const errors: string[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const config = chain[i];
    const startedAt = Date.now();

    try {
      const text = await callProvider(config, systemPrompt, userPrompt, temperature, maxTokens);
      return {
        text,
        meta: {
          provider: config.provider,
          model: config.model,
          fallbackUsed: i > 0,
          latencyMs: Date.now() - startedAt,
          attempts: i + 1,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.provider}: ${message}`);
    }
  }

  throw new Error(`All LLM providers failed (${errors.join(" | ")})`);
}

function cleanAssistantOutput(text: string): string {
  return text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/i, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function extractJsonFromText(raw: string): JsonObject {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw.trim();

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    // Ignore and continue with loose extraction
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = candidate.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(sliced) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  }

  throw new Error("LLM did not return valid JSON");
}

function toStringArray(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeScore(value: number): number {
  const bounded = Math.max(0, Math.min(5, value));
  return Math.round(bounded * 2) / 2;
}

function normalizeEvaluatorScores(payload: JsonObject): EvaluatorDimensionScore[] {
  const rawDimensions = Array.isArray(payload.dimensions) ? payload.dimensions : [];

  const parsed = new Map<InterviewScoreDimension, EvaluatorDimensionScore>();

  for (const item of rawDimensions) {
    if (!item || typeof item !== "object") continue;

    const row = item as JsonObject;
    const dimension = String(row.dimension || "") as InterviewScoreDimension;

    if (!REQUIRED_DIMENSIONS.includes(dimension)) continue;

    const scoreRaw = Number(row.score);
    const rationale = String(row.rationale || "").trim();
    const recommendedFix = String(row.recommendedFix || "").trim();

    if (!Number.isFinite(scoreRaw) || !rationale) continue;

    parsed.set(dimension, {
      dimension,
      score: normalizeScore(scoreRaw),
      rationale,
      recommendedFix: recommendedFix || undefined,
    });
  }

  const normalized = REQUIRED_DIMENSIONS.map((dimension) => parsed.get(dimension)).filter(
    (value): value is EvaluatorDimensionScore => Boolean(value)
  );

  if (normalized.length !== REQUIRED_DIMENSIONS.length) {
    throw new Error("Evaluator response missing required score dimensions");
  }

  return normalized;
}

function normalizeEvaluatorSummary(
  payload: JsonObject
): Pick<InterviewFeedbackSummary, "strengths" | "gaps" | "frameworkSuggestions" | "focusAreas"> {
  const summary = (payload.summary || {}) as JsonObject;

  const strengths = toStringArray(summary.strengths, 5);
  const gaps = toStringArray(summary.gaps, 5);

  const frameworkSuggestionsRaw = Array.isArray(summary.frameworkSuggestions)
    ? summary.frameworkSuggestions
    : [];

  const frameworkSuggestions = frameworkSuggestionsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as JsonObject;
      const name = String(row.name || "").trim();
      const description = String(row.description || "").trim();
      const template = String(row.template || "").trim();
      if (!name || !description || !template) return null;
      return { name, description, template };
    })
    .filter(
      (
        item
      ): item is { name: string; description: string; template: string } => Boolean(item)
    )
    .slice(0, 3);

  const focusAreasRaw = Array.isArray(summary.focusAreas) ? summary.focusAreas : [];
  const focusAreas = focusAreasRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as JsonObject;
      const area = String(row.area || "").trim();
      const reason = String(row.reason || "").trim();
      const practice = String(row.practice || "").trim();
      if (!area || !reason || !practice) return null;
      return { area, reason, practice };
    })
    .filter(
      (
        item
      ): item is { area: string; reason: string; practice: string } => Boolean(item)
    )
    .slice(0, 3);

  return {
    strengths,
    gaps,
    frameworkSuggestions,
    focusAreas,
  };
}

export async function generateInterviewerTurnWithLlm(input: {
  session: InterviewSession;
  messages: InterviewMessage[];
  turnKind: "kickoff" | "question" | "follow_up" | "wrap_up";
  fallbackContent: string;
}): Promise<{ content: string; meta: ProviderRunMeta }> {
  const systemPrompt = `${buildInterviewerSystemPrompt(input.session)}\n\nOutput rules:\n- Return only the interviewer message text, no markdown, no quotes.\n- Keep response concise (max 90 words).\n- Respect requested turn kind exactly.`;

  const userPrompt = [
    `Requested turn kind: ${input.turnKind}`,
    "Use the recent transcript and produce the next interviewer utterance.",
    "If you are unsure, stay close to this fallback draft:",
    input.fallbackContent,
    "Recent transcript:",
    compactTranscript(input.messages),
  ].join("\n\n");

  const { text, meta } = await runProviderChain(systemPrompt, userPrompt, 0.35, 320);
  const content = cleanAssistantOutput(text);

  if (!content) {
    throw new Error("LLM generated empty interviewer turn");
  }

  return { content, meta };
}

export async function generateEvaluatorScorecardWithLlm(input: {
  session: InterviewSession;
  messages: InterviewMessage[];
}): Promise<EvaluatorResult> {
  const transcript = compactTranscript(input.messages);

  const systemPrompt = `${buildEvaluatorSystemPrompt(input.session)}\n\nReturn JSON only.`;
  const userPrompt = [
    "Evaluate this interview transcript.",
    "Return strict JSON with this shape:",
    JSON.stringify(
      {
        dimensions: REQUIRED_DIMENSIONS.map((dimension) => ({
          dimension,
          score: 0,
          rationale: "",
          recommendedFix: "",
        })),
        summary: {
          strengths: [""],
          gaps: [""],
          frameworkSuggestions: [{ name: "", description: "", template: "" }],
          focusAreas: [{ area: "", reason: "", practice: "" }],
        },
      },
      null,
      2
    ),
    "Rules:",
    "- Include every required dimension exactly once.",
    "- score must be between 0 and 5 (0.5 increments allowed).",
    "- rationale and recommendedFix must be specific and actionable.",
    "Transcript:",
    transcript,
  ].join("\n\n");

  const { text, meta } = await runProviderChain(systemPrompt, userPrompt, 0.15, 1200);
  const parsed = extractJsonFromText(text);

  return {
    scores: normalizeEvaluatorScores(parsed),
    summary: normalizeEvaluatorSummary(parsed),
    meta,
  };
}
