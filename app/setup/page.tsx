"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetCompany, setTargetCompany] = useState("Google");
  const [roleTitle, setRoleTitle] = useState("Software Engineer");
  const [roleLevel, setRoleLevel] = useState("L4");
  const [jobDescription, setJobDescription] = useState("");
  const [mode, setMode] = useState<"time" | "question_count">("time");
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(45);
  const [targetQuestionCount, setTargetQuestionCount] = useState(5);

  const handleCreateSession = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/interview/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCompany,
          roleTitle,
          roleLevel,
          jobDescription,
          mode,
          targetDurationMinutes: mode === "time" ? targetDurationMinutes : undefined,
          targetQuestionCount:
            mode === "question_count" ? targetQuestionCount : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to create interview session");
      }

      router.push(`/session?id=${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create interview session");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Interview Copilot</p>
          <h1 className="text-3xl font-semibold">Setup interview session</h1>
          <p className="mt-2 text-sm text-slate-400">
            Paste a role brief, choose session format, and start a realistic mock interview.
          </p>
        </div>

        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={handleCreateSession}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-300">Target company</span>
              <input
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                placeholder="Google"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-slate-300">Role</span>
              <input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                placeholder="Software Engineer"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Level (optional)</span>
            <input
              value={roleLevel}
              onChange={(e) => setRoleLevel(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              placeholder="L4 / IC5 / Staff"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Job description</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={8}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              placeholder="Paste JD text here..."
            />
          </label>

          <div className="space-y-2 rounded border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-sm text-slate-300">Session format</p>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "time"}
                  onChange={() => setMode("time")}
                />
                Time-boxed
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "question_count"}
                  onChange={() => setMode("question_count")}
                />
                Question-count
              </label>
            </div>

            {mode === "time" ? (
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Duration (minutes)</span>
                <input
                  type="number"
                  min={10}
                  max={90}
                  value={targetDurationMinutes}
                  onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
            ) : (
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Number of questions</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={targetQuestionCount}
                  onChange={(e) => setTargetQuestionCount(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Creating..." : "Start interview"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
