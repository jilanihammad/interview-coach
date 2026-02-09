import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import {
  Product,
  Progress,
  defaultProgress,
  ICP,
  Launch,
  Outreach,
  Pitch,
  Pricing,
} from "./types";
import {
  CreateInterviewSessionInput,
  InterviewMessage,
  InterviewMessageRole,
  InterviewPhase,
  InterviewScore,
  InterviewScoreDimension,
  InterviewSession,
  InterviewSessionBundle,
  InterviewSessionStatus,
} from "./interview/types";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "launcher.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  pitch TEXT,
  pricing TEXT,
  icp TEXT,
  outreach TEXT,
  launch TEXT,
  progress TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  targetCompany TEXT NOT NULL,
  roleTitle TEXT NOT NULL,
  roleLevel TEXT,
  jobDescription TEXT NOT NULL,
  mode TEXT NOT NULL,
  targetDurationMinutes INTEGER,
  targetQuestionCount INTEGER,
  startedAt TEXT,
  endedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_messages (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  indexInSession INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  meta TEXT,
  FOREIGN KEY (sessionId) REFERENCES interview_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interview_scores (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  recommendedFix TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (sessionId) REFERENCES interview_sessions(id) ON DELETE CASCADE
);
`);

const serializeJson = (value: unknown): string | null => {
  if (value === undefined) return null;
  return JSON.stringify(value);
};

const parseJson = <T>(value: string | null): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const mapRowToProduct = (row: Record<string, unknown>): Product => {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    status: String(row.status),
    pitch: parseJson<Pitch>((row.pitch as string | null) ?? null),
    pricing: parseJson<Pricing>((row.pricing as string | null) ?? null),
    icp: parseJson<ICP>((row.icp as string | null) ?? null),
    outreach: parseJson<Outreach>((row.outreach as string | null) ?? null),
    launch: parseJson<Launch>((row.launch as string | null) ?? null),
    progress:
      parseJson<Progress>((row.progress as string | null) ?? null) ?? {
        ...defaultProgress,
      },
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
};

const mapRowToInterviewSession = (
  row: Record<string, unknown>
): InterviewSession => ({
  id: String(row.id),
  status: String(row.status) as InterviewSessionStatus,
  phase: String(row.phase) as InterviewPhase,
  targetCompany: String(row.targetCompany),
  roleTitle: String(row.roleTitle),
  roleLevel: row.roleLevel ? String(row.roleLevel) : undefined,
  jobDescription: String(row.jobDescription),
  mode: String(row.mode) as InterviewSession["mode"],
  targetDurationMinutes:
    row.targetDurationMinutes !== null && row.targetDurationMinutes !== undefined
      ? Number(row.targetDurationMinutes)
      : undefined,
  targetQuestionCount:
    row.targetQuestionCount !== null && row.targetQuestionCount !== undefined
      ? Number(row.targetQuestionCount)
      : undefined,
  startedAt: row.startedAt ? String(row.startedAt) : undefined,
  endedAt: row.endedAt ? String(row.endedAt) : undefined,
  createdAt: String(row.createdAt),
  updatedAt: String(row.updatedAt),
});

const mapRowToInterviewMessage = (
  row: Record<string, unknown>
): InterviewMessage => ({
  id: String(row.id),
  sessionId: String(row.sessionId),
  role: String(row.role) as InterviewMessageRole,
  content: String(row.content),
  indexInSession: Number(row.indexInSession),
  createdAt: String(row.createdAt),
  meta: parseJson<Record<string, unknown>>((row.meta as string | null) ?? null),
});

const mapRowToInterviewScore = (row: Record<string, unknown>): InterviewScore => ({
  id: String(row.id),
  sessionId: String(row.sessionId),
  dimension: String(row.dimension) as InterviewScoreDimension,
  score: Number(row.score),
  rationale: String(row.rationale),
  recommendedFix: row.recommendedFix ? String(row.recommendedFix) : undefined,
  createdAt: String(row.createdAt),
});

export type CreateProductInput = {
  name: string;
  description: string;
  status?: string;
  pitch?: Pitch;
  pricing?: Pricing;
  icp?: ICP;
  outreach?: Outreach;
  launch?: Launch;
  progress?: Progress;
};

export type UpdateProductInput = Partial<CreateProductInput>;

export const listProducts = (): Product[] => {
  const rows = db
    .prepare("SELECT * FROM products ORDER BY updatedAt DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapRowToProduct);
};

export const getProductById = (id: string): Product | null => {
  const row = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRowToProduct(row);
};

export const createProduct = (input: CreateProductInput): Product => {
  const now = new Date().toISOString();
  const product: Product = {
    id: uuidv4(),
    name: input.name.trim(),
    description: input.description.trim(),
    status: input.status?.trim() || "draft",
    pitch: input.pitch,
    pricing: input.pricing,
    icp: input.icp,
    outreach: input.outreach,
    launch: input.launch,
    progress: input.progress ?? { ...defaultProgress },
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO products (id, name, description, status, pitch, pricing, icp, outreach, launch, progress, createdAt, updatedAt)
     VALUES (@id, @name, @description, @status, @pitch, @pricing, @icp, @outreach, @launch, @progress, @createdAt, @updatedAt)`
  ).run({
    ...product,
    pitch: serializeJson(product.pitch),
    pricing: serializeJson(product.pricing),
    icp: serializeJson(product.icp),
    outreach: serializeJson(product.outreach),
    launch: serializeJson(product.launch),
    progress: serializeJson(product.progress),
  });

  return product;
};

export const updateProduct = (
  id: string,
  updates: UpdateProductInput
): Product | null => {
  const existing = getProductById(id);
  if (!existing) return null;

  const mergedProgress: Progress =
    updates.progress !== undefined
      ? { ...existing.progress, ...updates.progress }
      : existing.progress;

  const merged: Product = {
    ...existing,
    ...updates,
    name: updates.name?.trim() ?? existing.name,
    description: updates.description?.trim() ?? existing.description,
    status: updates.status?.trim() ?? existing.status,
    pitch: updates.pitch ?? existing.pitch,
    pricing: updates.pricing ?? existing.pricing,
    icp: updates.icp ?? existing.icp,
    outreach: updates.outreach ?? existing.outreach,
    launch: updates.launch ?? existing.launch,
    progress: mergedProgress,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE products
     SET name = @name,
         description = @description,
         status = @status,
         pitch = @pitch,
         pricing = @pricing,
         icp = @icp,
         outreach = @outreach,
         launch = @launch,
         progress = @progress,
         updatedAt = @updatedAt
     WHERE id = @id`
  ).run({
    ...merged,
    pitch: serializeJson(merged.pitch),
    pricing: serializeJson(merged.pricing),
    icp: serializeJson(merged.icp),
    outreach: serializeJson(merged.outreach),
    launch: serializeJson(merged.launch),
    progress: serializeJson(merged.progress),
  });

  return merged;
};

export const deleteProduct = (id: string): boolean => {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  return result.changes > 0;
};

export const createInterviewSession = (
  input: CreateInterviewSessionInput
): InterviewSession => {
  const now = new Date().toISOString();
  const session: InterviewSession = {
    id: uuidv4(),
    status: "draft",
    phase: "setup",
    targetCompany: input.targetCompany.trim(),
    roleTitle: input.roleTitle.trim(),
    roleLevel: input.roleLevel?.trim() || undefined,
    jobDescription: input.jobDescription.trim(),
    mode: input.mode,
    targetDurationMinutes: input.targetDurationMinutes,
    targetQuestionCount: input.targetQuestionCount,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO interview_sessions (
      id, status, phase, targetCompany, roleTitle, roleLevel, jobDescription,
      mode, targetDurationMinutes, targetQuestionCount, startedAt, endedAt,
      createdAt, updatedAt
    ) VALUES (
      @id, @status, @phase, @targetCompany, @roleTitle, @roleLevel, @jobDescription,
      @mode, @targetDurationMinutes, @targetQuestionCount, @startedAt, @endedAt,
      @createdAt, @updatedAt
    )`
  ).run({
    ...session,
    startedAt: null,
    endedAt: null,
  });

  return session;
};

export const listInterviewSessions = (): InterviewSession[] => {
  const rows = db
    .prepare("SELECT * FROM interview_sessions ORDER BY updatedAt DESC")
    .all() as Record<string, unknown>[];
  return rows.map((row) => mapRowToInterviewSession(row));
};

export const getInterviewSessionById = (id: string): InterviewSession | null => {
  const row = db
    .prepare("SELECT * FROM interview_sessions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRowToInterviewSession(row);
};

export const updateInterviewSession = (
  id: string,
  updates: Partial<
    Pick<
      InterviewSession,
      | "status"
      | "phase"
      | "startedAt"
      | "endedAt"
      | "targetDurationMinutes"
      | "targetQuestionCount"
    >
  >
): InterviewSession | null => {
  const existing = getInterviewSessionById(id);
  if (!existing) return null;

  const merged: InterviewSession = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE interview_sessions
     SET status = @status,
         phase = @phase,
         targetDurationMinutes = @targetDurationMinutes,
         targetQuestionCount = @targetQuestionCount,
         startedAt = @startedAt,
         endedAt = @endedAt,
         updatedAt = @updatedAt
     WHERE id = @id`
  ).run({
    ...merged,
    startedAt: merged.startedAt ?? null,
    endedAt: merged.endedAt ?? null,
  });

  return merged;
};

export const addInterviewMessage = (
  sessionId: string,
  role: InterviewMessageRole,
  content: string,
  meta?: Record<string, unknown>
): InterviewMessage => {
  const now = new Date().toISOString();

  const indexRow = db
    .prepare(
      "SELECT COALESCE(MAX(indexInSession), -1) as maxIndex FROM interview_messages WHERE sessionId = ?"
    )
    .get(sessionId) as { maxIndex: number };

  const message: InterviewMessage = {
    id: uuidv4(),
    sessionId,
    role,
    content: content.trim(),
    indexInSession: Number(indexRow.maxIndex) + 1,
    createdAt: now,
    meta,
  };

  db.prepare(
    `INSERT INTO interview_messages (id, sessionId, role, content, indexInSession, createdAt, meta)
     VALUES (@id, @sessionId, @role, @content, @indexInSession, @createdAt, @meta)`
  ).run({
    ...message,
    meta: serializeJson(meta),
  });

  db.prepare("UPDATE interview_sessions SET updatedAt = ? WHERE id = ?").run(now, sessionId);

  return message;
};

export const listInterviewMessages = (sessionId: string): InterviewMessage[] => {
  const rows = db
    .prepare(
      "SELECT * FROM interview_messages WHERE sessionId = ? ORDER BY indexInSession ASC"
    )
    .all(sessionId) as Record<string, unknown>[];
  return rows.map((row) => mapRowToInterviewMessage(row));
};

export const addInterviewScore = (
  sessionId: string,
  dimension: InterviewScoreDimension,
  score: number,
  rationale: string,
  recommendedFix?: string
): InterviewScore => {
  const boundedScore = Math.max(0, Math.min(5, score));
  const scoreRow: InterviewScore = {
    id: uuidv4(),
    sessionId,
    dimension,
    score: boundedScore,
    rationale: rationale.trim(),
    recommendedFix: recommendedFix?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO interview_scores (id, sessionId, dimension, score, rationale, recommendedFix, createdAt)
     VALUES (@id, @sessionId, @dimension, @score, @rationale, @recommendedFix, @createdAt)`
  ).run({
    ...scoreRow,
    recommendedFix: scoreRow.recommendedFix ?? null,
  });

  return scoreRow;
};

export const listInterviewScores = (sessionId: string): InterviewScore[] => {
  const rows = db
    .prepare("SELECT * FROM interview_scores WHERE sessionId = ? ORDER BY createdAt ASC")
    .all(sessionId) as Record<string, unknown>[];
  return rows.map((row) => mapRowToInterviewScore(row));
};

export const getInterviewSessionBundle = (
  sessionId: string
): InterviewSessionBundle | null => {
  const session = getInterviewSessionById(sessionId);
  if (!session) return null;

  return {
    session,
    messages: listInterviewMessages(sessionId),
    scores: listInterviewScores(sessionId),
  };
};
