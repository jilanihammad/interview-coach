import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type RepoSignals = {
  languages: string[];
  packageName?: string;
  scripts: string[];
  hasReadme: boolean;
  hasApiRoutes: boolean;
  hasDb: boolean;
  keyFiles: string[];
  recentCommits: string[];
};

export type RepoAnalysis = {
  resolvedPath: string;
  summary: string;
  signals: RepoSignals;
  suggestions: {
    name?: string;
    description: string;
    pitchHook: string;
    pricingNote: string;
    icpHint: string;
    outreachHint: string;
    launchHint: string;
  };
};

const EXT_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
};

function safeRead(filePath: string, max = 4000): string {
  try {
    return fs.readFileSync(filePath, "utf8").slice(0, max);
  } catch {
    return "";
  }
}

function listFiles(repoPath: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        out.push(path.relative(repoPath, abs));
      }
      if (out.length > 1500) return;
    }
  };
  walk(repoPath);
  return out;
}

export function analyzeRepo(inputPath: string): RepoAnalysis {
  const resolvedPath = path.resolve(inputPath || ".");
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error("Repo path not found");
  }

  const files = listFiles(resolvedPath);
  const readme = safeRead(path.join(resolvedPath, "README.md"), 5000);
  const packageJsonRaw = safeRead(path.join(resolvedPath, "package.json"), 5000);
  const pyproject = safeRead(path.join(resolvedPath, "pyproject.toml"), 3000);

  let packageName: string | undefined;
  let scripts: string[] = [];
  try {
    if (packageJsonRaw) {
      const pkg = JSON.parse(packageJsonRaw);
      packageName = pkg?.name;
      scripts = Object.keys(pkg?.scripts || {}).slice(0, 8);
    }
  } catch {}

  const langCount = new Map<string, number>();
  for (const f of files) {
    const lang = EXT_LANG[path.extname(f).toLowerCase()];
    if (!lang) continue;
    langCount.set(lang, (langCount.get(lang) || 0) + 1);
  }
  const languages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
    .slice(0, 3);

  const hasApiRoutes = files.some((f) => f.startsWith("app/api/") || f.startsWith("pages/api/"));
  const hasDb = files.some((f) => /db|sqlite|prisma|schema/i.test(f));
  const keyFiles = files.filter((f) => /README|package\.json|pyproject|app\/api|lib\/db|prisma|schema/i.test(f)).slice(0, 12);

  let recentCommits: string[] = [];
  try {
    const raw = execSync("git log --oneline -n 5", { cwd: resolvedPath, encoding: "utf8" });
    recentCommits = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {}

  const repoLabel = packageName || path.basename(resolvedPath);
  const readmeLine = readme.split("\n").find((l) => l.trim().length > 20) || "";
  const pyprojectLine = pyproject.split("\n").find((l) => l.includes("description")) || "";
  const descSource = readmeLine || pyprojectLine || `${repoLabel} project`;

  const summary = [
    `${repoLabel} appears to be a ${languages[0] || "software"} project`,
    hasApiRoutes ? "with API routes" : "with app code",
    hasDb ? "and persistent data/storage" : "and lightweight storage",
  ].join(" ");

  return {
    resolvedPath,
    summary,
    signals: {
      languages,
      packageName,
      scripts,
      hasReadme: Boolean(readme),
      hasApiRoutes,
      hasDb,
      keyFiles,
      recentCommits,
    },
    suggestions: {
      name: packageName || undefined,
      description: `${summary}. ${descSource.replace(/^#\s*/, "").slice(0, 220)}`,
      pitchHook: `${repoLabel} helps users ship faster by automating repetitive product work from the codebase context.`,
      pricingNote: "Offer a generous starter tier, then a Pro plan for teams that need advanced automation and faster iteration.",
      icpHint: "Indie founders and small product teams who already have a repo and want launch-ready messaging without manual drafting.",
      outreachHint: "Lead with what the repo already proves (working features, API routes, persistence), then offer a quick personalized launch teardown.",
      launchHint: "Highlight concrete shipped capabilities inferred from the repo and include a clear CTA for beta users.",
    },
  };
}
