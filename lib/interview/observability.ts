type LogLevel = "info" | "warn" | "error";

type LogData = Record<string, unknown>;

function safeJson(input: LogData): string {
  try {
    return JSON.stringify(input);
  } catch {
    return JSON.stringify({ message: "failed to serialize log payload" });
  }
}

export function logInterviewEvent(
  level: LogLevel,
  event: string,
  data: LogData = {}
): void {
  const payload = {
    ts: new Date().toISOString(),
    scope: "interview",
    level,
    event,
    ...data,
  };

  const serialized = safeJson(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
