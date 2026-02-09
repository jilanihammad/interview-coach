"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  ICP,
  ICPSegment,
  Launch,
  Outreach,
  Pitch,
  Pricing,
  PricingTier,
  Product,
  Progress,
  Target,
  defaultProgress,
} from "@/lib/types";

type FormState = { name: string; description: string; status: string };
type ActiveTab = "pitch" | "pricing" | "icp" | "outreach" | "launch" | "progress";

type RepoAnalysis = {
  resolvedPath: string;
  summary: string;
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

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "building", label: "Building" },
  { value: "prelaunch", label: "Preparing launch" },
  { value: "launched", label: "Launched" },
];

const tabs: { id: ActiveTab; label: string }[] = [
  { id: "pitch", label: "Pitch" },
  { id: "pricing", label: "Pricing" },
  { id: "icp", label: "ICP" },
  { id: "outreach", label: "Outreach" },
  { id: "launch", label: "Launch" },
  { id: "progress", label: "Progress" },
];

const initialForm: FormState = { name: "", description: "", status: "draft" };
const emptyPitch: Pitch = { oneLiner: "", elevator: "", detailed: "" };
const emptyPricing: Pricing = { model: "", tiers: [], notes: "" };
const emptyICP: ICP = { segments: [], targets: [] };
const emptyOutreach: Outreach = { emailTemplates: [], linkedinTemplates: [] };
const emptyLaunch: Launch = {};

const progressLabels: { key: keyof Progress; label: string }[] = [
  { key: "pitchDone", label: "Pitch finalized" },
  { key: "pricingDone", label: "Pricing decided" },
  { key: "icpDone", label: "ICP defined" },
  { key: "landingPageDone", label: "Landing page live" },
  { key: "outreachStarted", label: "Outreach started" },
  { key: "launchScheduled", label: "Launch scheduled" },
  { key: "launched", label: "Launched" },
];

const inputClass =
  "w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";
const areaClass =
  "w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";
const badgeClass =
  "inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium";

const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    draft: "bg-slate-800 text-slate-100 border-slate-700",
    building: "bg-blue-900/40 text-blue-100 border-blue-700",
    prelaunch: "bg-amber-900/40 text-amber-100 border-amber-700",
    launched: "bg-emerald-900/40 text-emerald-100 border-emerald-700",
  };
  const classes =
    palette[status.toLowerCase()] ??
    "bg-slate-800 text-slate-100 border-slate-700";
  return <span className={`${badgeClass} ${classes}`}>{status}</span>;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("edit");
  const [form, setForm] = useState<FormState>(initialForm);
  const [activeTab, setActiveTab] = useState<ActiveTab>("pitch");

  const [pitchDraft, setPitchDraft] = useState<Pitch>(emptyPitch);
  const [pitchFeedback, setPitchFeedback] = useState("");
  const [pricingDraft, setPricingDraft] = useState<Pricing>(emptyPricing);
  const [icpDraft, setIcpDraft] = useState<ICP>(emptyICP);
  const [outreachDraft, setOutreachDraft] = useState<Outreach>(emptyOutreach);
  const [launchDraft, setLaunchDraft] = useState<Launch>(emptyLaunch);
  const [progressDraft, setProgressDraft] = useState<Progress>({
    ...defaultProgress,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sectionBusy, setSectionBusy] = useState<Record<string, boolean>>({});
  const [repoPath, setRepoPath] = useState("");
  const [repoAnalyzing, setRepoAnalyzing] = useState(false);
  const [repoAnalysis, setRepoAnalysis] = useState<RepoAnalysis | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId]
  );

  const setFormFromProduct = (product: Product) => {
    setForm({
      name: product.name,
      description: product.description,
      status: product.status || "draft",
    });
  };

  const setFeatureDraftsFromProduct = (product: Product | null) => {
    if (!product) {
      setPitchDraft(emptyPitch);
      setPitchFeedback("");
      setPricingDraft(emptyPricing);
      setIcpDraft(emptyICP);
      setOutreachDraft(emptyOutreach);
      setLaunchDraft(emptyLaunch);
      setProgressDraft({ ...defaultProgress });
      return;
    }
    setPitchDraft({
      oneLiner: product.pitch?.oneLiner ?? "",
      elevator: product.pitch?.elevator ?? "",
      detailed: product.pitch?.detailed ?? "",
    });
    setPricingDraft({
      model: product.pricing?.model ?? "",
      tiers: product.pricing?.tiers
        ? product.pricing.tiers.map((tier) => ({
            ...tier,
            features: [...tier.features],
          }))
        : [],
      notes: product.pricing?.notes ?? "",
    });
    setIcpDraft({
      segments: product.icp?.segments
        ? product.icp.segments.map((seg) => ({
            ...seg,
            painPoints: [...seg.painPoints],
            channels: [...seg.channels],
          }))
        : [],
      targets: product.icp?.targets
        ? product.icp.targets.map((t) => ({ ...t }))
        : [],
    });
    setOutreachDraft({
      emailTemplates: product.outreach?.emailTemplates
        ? [...product.outreach.emailTemplates]
        : [],
      linkedinTemplates: product.outreach?.linkedinTemplates
        ? [...product.outreach.linkedinTemplates]
        : [],
    });
    setLaunchDraft({
      productHunt: product.launch?.productHunt
        ? { ...product.launch.productHunt }
        : undefined,
      twitter: product.launch?.twitter,
      linkedin: product.launch?.linkedin,
      hackerNews: product.launch?.hackerNews,
    });
    setProgressDraft(product.progress ?? { ...defaultProgress });
  };

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json();
      const items: Product[] = data.products ?? [];
      setProducts(items);
      if (items.length === 0) {
        setMode("create");
        setSelectedId(null);
        setForm(initialForm);
        setFeatureDraftsFromProduct(null);
        return;
      }
      const current =
        (selectedId && items.find((p) => p.id === selectedId)) || items[0];
      setSelectedId(current.id);
      setMode("edit");
      setFormFromProduct(current);
      setFeatureDraftsFromProduct(current);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("Could not load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFeatureDraftsFromProduct(selectedProduct);
  }, [selectedProduct]);

  const startNew = () => {
    setMode("create");
    setSelectedId(null);
    setForm(initialForm);
    setFeatureDraftsFromProduct(null);
    setActiveTab("pitch");
    setMessage(null);
    setError(null);
  };

  const handleAnalyzeRepo = async () => {
    if (!repoPath.trim()) {
      setError("Add a local repo path first");
      return;
    }
    setRepoAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/context/repo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: repoPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Repo analysis failed");

      const analysis = data.analysis as RepoAnalysis;
      setRepoAnalysis(analysis);

      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : analysis.suggestions.name || prev.name,
        description: analysis.suggestions.description || prev.description,
      }));

      setPitchDraft((prev) => ({
        ...prev,
        detailed: prev.detailed?.trim()
          ? prev.detailed
          : analysis.suggestions.pitchHook,
      }));
      setPricingDraft((prev) => ({
        ...prev,
        notes: prev.notes?.trim() ? prev.notes : analysis.suggestions.pricingNote,
      }));
      setIcpDraft((prev) => ({
        ...prev,
        segments:
          prev.segments && prev.segments.length > 0
            ? prev.segments
            : [
                {
                  name: "Repo-derived ICP",
                  description: analysis.suggestions.icpHint,
                  painPoints: [
                    "Too much manual launch prep",
                    "Context switching between docs and code",
                  ],
                  channels: ["GitHub", "X/Twitter", "Indie Hackers"],
                },
              ],
      }));
      setOutreachDraft((prev) => ({
        ...prev,
        emailTemplates:
          prev.emailTemplates && prev.emailTemplates.length > 0
            ? prev.emailTemplates
            : [analysis.suggestions.outreachHint],
      }));
      setLaunchDraft((prev) => ({
        ...prev,
        twitter: prev.twitter?.trim() ? prev.twitter : analysis.suggestions.launchHint,
      }));

      setMessage(`Imported repo context from ${analysis.resolvedPath}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to analyze repo");
    } finally {
      setRepoAnalyzing(false);
    }
  };

  const handleSelect = (product: Product) => {
    setMode("edit");
    setSelectedId(product.id);
    setFormFromProduct(product);
    setFeatureDraftsFromProduct(product);
    setMessage(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    if (!form.name.trim() || !form.description.trim()) {
      setError("Name and description are required");
      setSaving(false);
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status.trim(),
    };
    try {
      const isEdit = mode === "edit" && selectedId;
      const res = await fetch(
        isEdit ? `/api/products/${selectedId}` : "/api/products",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      if (isEdit) {
        setProducts((prev) =>
          prev.map((p) => (p.id === data.id ? data : p))
        );
        setMessage("Product updated");
      } else {
        setProducts((prev) => [data, ...prev]);
        setSelectedId(data.id);
        setMode("edit");
        setMessage("Product created");
      }
      setFormFromProduct(data);
      setFeatureDraftsFromProduct(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = res.ok ? null : await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not delete product");
      const remaining = products.filter((p) => p.id !== id);
      setProducts(remaining);
      if (remaining.length === 0) startNew();
      else handleSelect(remaining[0]);
      setMessage("Product deleted");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not delete product");
    } finally {
      setDeletingId(null);
    }
  };

  const applyProductUpdate = (product: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    if (selectedId === product.id) {
      setFormFromProduct(product);
      setFeatureDraftsFromProduct(product);
    }
  };

  const updateProductOnServer = async (
    payload: Partial<Product>,
    successMessage?: string
  ) => {
    if (!selectedId) {
      setError("Select a product first");
      return null;
    }
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/products/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Request failed");
    applyProductUpdate(data);
    if (successMessage) setMessage(successMessage);
    return data as Product;
  };

  const setBusy = (key: string, value: boolean) =>
    setSectionBusy((prev) => ({ ...prev, [key]: value }));

  const copyToClipboard = async (value: string, label?: string) => {
    if (!value) {
      setError("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label ?? "Text"} copied`);
    } catch (err) {
      console.error("Copy failed", err);
      setError("Unable to copy to clipboard");
    }
  };

  const handleGeneratePitch = async () => {
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    setBusy("pitch", true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/generate/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          description: form.description,
          feedback: pitchFeedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to generate pitch");
      if (data.pitch) setPitchDraft(data.pitch);
      if (data.product) applyProductUpdate(data.product);
      setMessage("Pitch generated");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to generate pitch");
    } finally {
      setBusy("pitch", false);
    }
  };

  const handleSavePitch = async () => {
    if (!selectedProduct) return;
    try {
      await updateProductOnServer(
        { pitch: pitchDraft, progress: { ...progressDraft, pitchDone: true } },
        "Pitch saved"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save pitch");
    }
  };

  const handleGeneratePricing = async () => {
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    setBusy("pricing", true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/generate/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Unable to generate pricing");
      if (data.pricing) setPricingDraft(data.pricing);
      if (data.product) applyProductUpdate(data.product);
      setMessage("Pricing generated");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to generate pricing"
      );
    } finally {
      setBusy("pricing", false);
    }
  };

  const handleSavePricing = async () => {
    if (!selectedProduct) return;
    try {
      await updateProductOnServer(
        {
          pricing: pricingDraft,
          progress: { ...progressDraft, pricingDone: true },
        },
        "Pricing saved"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save pricing");
    }
  };

  const handleGenerateICP = async () => {
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    setBusy("icp", true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/generate/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to generate ICP");
      if (data.icp) setIcpDraft(data.icp);
      if (data.product) applyProductUpdate(data.product);
      setMessage("ICP generated");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to generate ICP");
    } finally {
      setBusy("icp", false);
    }
  };

  const handleSaveICP = async () => {
    if (!selectedProduct) return;
    try {
      await updateProductOnServer(
        { icp: icpDraft, progress: { ...progressDraft, icpDone: true } },
        "ICP saved"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save ICP");
    }
  };

  const handleGenerateOutreach = async () => {
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    setBusy("outreach", true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/generate/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Unable to generate outreach");
      if (data.outreach) setOutreachDraft(data.outreach);
      if (data.product) applyProductUpdate(data.product);
      setMessage("Outreach generated");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to generate outreach"
      );
    } finally {
      setBusy("outreach", false);
    }
  };

  const handleSaveOutreach = async () => {
    if (!selectedProduct) return;
    try {
      await updateProductOnServer(
        {
          outreach: outreachDraft,
          progress: { ...progressDraft, outreachStarted: true },
        },
        "Outreach saved"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save outreach");
    }
  };

  const handleGenerateLaunch = async (
    platform: "producthunt" | "twitter" | "linkedin" | "hackernews"
  ) => {
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    setBusy(`launch-${platform}`, true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/generate/launch/${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Unable to generate launch content");
      if (data.launch) setLaunchDraft(data.launch);
      else if (selectedProduct) setLaunchDraft(selectedProduct.launch ?? {});
      if (data.product) applyProductUpdate(data.product);
      setMessage("Launch content generated");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to generate launch content"
      );
    } finally {
      setBusy(`launch-${platform}`, false);
    }
  };

  const handleSaveLaunch = async () => {
    if (!selectedProduct) return;
    try {
      await updateProductOnServer(
        {
          launch: launchDraft,
          progress: { ...progressDraft, launchScheduled: true },
        },
        "Launch content saved"
      );
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to save launch content"
      );
    }
  };

  const toggleProgress = async (key: keyof Progress) => {
    if (!selectedProduct) return;
    const updated = { ...progressDraft, [key]: !progressDraft[key] };
    setProgressDraft(updated);
    try {
      await updateProductOnServer({ progress: updated }, "Progress updated");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to update progress"
      );
      setProgressDraft(progressDraft);
    }
  };

  const updateTier = (index: number, field: keyof PricingTier, value: string) => {
    setPricingDraft((prev) => {
      const tiers = [...(prev.tiers ?? [])];
      const tier = tiers[index];
      if (!tier) return prev;
      tiers[index] =
        field === "features"
          ? { ...tier, features: value.split("\n").filter(Boolean) }
          : { ...tier, [field]: value };
      return { ...prev, tiers };
    });
  };

  const addTier = () => {
    setPricingDraft((prev) => ({
      ...prev,
      tiers: [
        ...(prev.tiers ?? []),
        { name: "New tier", price: "$0", features: [] },
      ],
    }));
  };

  const removeTier = (index: number) => {
    setPricingDraft((prev) => ({
      ...prev,
      tiers: prev.tiers?.filter((_, i) => i !== index) ?? [],
    }));
  };

  const updateSegment = (
    index: number,
    field: keyof ICPSegment,
    value: string
  ) => {
    setIcpDraft((prev) => {
      const segments = [...(prev.segments ?? [])];
      const segment = segments[index];
      if (!segment) return prev;
      if (field === "painPoints" || field === "channels") {
        segments[index] = {
          ...segment,
          [field]: value.split("\n").filter(Boolean),
        };
      } else {
        segments[index] = { ...segment, [field]: value };
      }
      return { ...prev, segments };
    });
  };

  const addSegment = () => {
    setIcpDraft((prev) => ({
      ...prev,
      segments: [
        ...(prev.segments ?? []),
        {
          name: "New segment",
          description: "",
          painPoints: [],
          channels: [],
        },
      ],
    }));
  };

  const removeSegment = (index: number) => {
    setIcpDraft((prev) => ({
      ...prev,
      segments: prev.segments?.filter((_, i) => i !== index) ?? [],
    }));
  };

  const updateTarget = (index: number, field: keyof Target, value: string) => {
    setIcpDraft((prev) => {
      const targets = [...(prev.targets ?? [])];
      const target = targets[index];
      if (!target) return prev;
      targets[index] = { ...target, [field]: value };
      return { ...prev, targets };
    });
  };

  const toggleTargetContacted = (index: number) => {
    setIcpDraft((prev) => {
      const targets = [...(prev.targets ?? [])];
      const target = targets[index];
      if (!target) return prev;
      targets[index] = { ...target, contacted: !target.contacted };
      return { ...prev, targets };
    });
  };

  const addTarget = () => {
    setIcpDraft((prev) => ({
      ...prev,
      targets: [
        ...(prev.targets ?? []),
        { name: "New target", type: "company", contacted: false },
      ],
    }));
  };

  const removeTarget = (index: number) => {
    setIcpDraft((prev) => ({
      ...prev,
      targets: prev.targets?.filter((_, i) => i !== index) ?? [],
    }));
  };

  const updateLaunchField = (
    field: keyof NonNullable<Launch["productHunt"]>,
    value: string
  ) => {
    setLaunchDraft((prev) => ({
      ...prev,
      productHunt: { ...(prev.productHunt ?? {}), [field]: value },
    }));
  };

  const renderPitchTab = () => {
    const fields: { key: keyof Pitch; label: string; rows: number }[] = [
      { key: "oneLiner", label: "One-liner", rows: 3 },
      { key: "elevator", label: "Elevator", rows: 4 },
      { key: "detailed", label: "Detailed", rows: 6 },
    ];
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={pitchFeedback}
            onChange={(e) => setPitchFeedback(e.target.value)}
            placeholder="Feedback / angle (optional)"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleGeneratePitch}
            disabled={sectionBusy.pitch || !selectedProduct}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sectionBusy.pitch ? "Generating..." : "Generate"}
          </button>
          <button
            type="button"
            onClick={handleSavePitch}
            disabled={!selectedProduct}
            className="rounded border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {fields.map((field) => (
            <div
              key={field.key}
              className="rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>{field.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      pitchDraft[field.key] ?? "",
                      `${field.label} pitch`
                    )
                  }
                  className="text-blue-300 hover:text-blue-200"
                >
                  Copy
                </button>
              </div>
              <textarea
                value={pitchDraft[field.key] ?? ""}
                onChange={(e) =>
                  setPitchDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                rows={field.rows}
                className={areaClass}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPricingTab = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGeneratePricing}
          disabled={sectionBusy.pricing || !selectedProduct}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sectionBusy.pricing ? "Generating..." : "Generate pricing"}
        </button>
        <button
          type="button"
          onClick={handleSavePricing}
          disabled={!selectedProduct}
          className="rounded border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm text-slate-200">Model</label>
          <input
            value={pricingDraft.model ?? ""}
            onChange={(e) =>
              setPricingDraft((prev) => ({ ...prev, model: e.target.value }))
            }
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>Notes</span>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(pricingDraft.notes ?? "", "Pricing notes")
              }
              className="text-xs text-blue-300 hover:text-blue-200"
            >
              Copy
            </button>
          </div>
          <textarea
            value={pricingDraft.notes ?? ""}
            onChange={(e) =>
              setPricingDraft((prev) => ({ ...prev, notes: e.target.value }))
            }
            rows={3}
            className={areaClass}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">Tiers</p>
        <button
          type="button"
          onClick={addTier}
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          + Add tier
        </button>
      </div>
      {(pricingDraft.tiers ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No tiers yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(pricingDraft.tiers ?? []).map((tier, index) => (
            <div
              key={`${tier.name}-${index}`}
              className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  value={tier.name}
                  onChange={(e) => updateTier(index, "name", e.target.value)}
                  className={inputClass}
                />
                <input
                  value={tier.price}
                  onChange={(e) => updateTier(index, "price", e.target.value)}
                  className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <textarea
                value={(tier.features ?? []).join("\n")}
                onChange={(e) => updateTier(index, "features", e.target.value)}
                rows={3}
                className={areaClass}
                placeholder="Features (one per line)"
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${tier.name} – ${tier.price}\n${tier.features.join("\n")}`,
                      `${tier.name} tier`
                    )
                  }
                  className="text-blue-300 hover:text-blue-200"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => removeTier(index)}
                  className="text-red-300 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderICPTab = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerateICP}
          disabled={sectionBusy.icp || !selectedProduct}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sectionBusy.icp ? "Generating..." : "Generate ICP"}
        </button>
        <button
          type="button"
          onClick={handleSaveICP}
          disabled={!selectedProduct}
          className="rounded border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={addSegment}
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          + Add segment
        </button>
      </div>
      {(icpDraft.segments ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No segments yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(icpDraft.segments ?? []).map((segment, index) => (
            <div
              key={`${segment.name}-${index}`}
              className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  value={segment.name}
                  onChange={(e) => updateSegment(index, "name", e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeSegment(index)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={segment.description}
                onChange={(e) =>
                  updateSegment(index, "description", e.target.value)
                }
                rows={2}
                className={areaClass}
                placeholder="Description"
              />
              <textarea
                value={(segment.painPoints ?? []).join("\n")}
                onChange={(e) =>
                  updateSegment(index, "painPoints", e.target.value)
                }
                rows={3}
                className={areaClass}
                placeholder="Pain points (one per line)"
              />
              <textarea
                value={(segment.channels ?? []).join("\n")}
                onChange={(e) =>
                  updateSegment(index, "channels", e.target.value)
                }
                rows={3}
                className={areaClass}
                placeholder="Channels (one per line)"
              />
              <div className="text-right text-xs">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${segment.name}\n${segment.description}\n${segment.painPoints.join(", ")}\n${segment.channels.join(", ")}`,
                      `${segment.name} segment`
                    )
                  }
                  className="text-blue-300 hover:text-blue-200"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">Targets</p>
        <button
          type="button"
          onClick={addTarget}
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          + Add target
        </button>
      </div>
      {(icpDraft.targets ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Add people or companies.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(icpDraft.targets ?? []).map((target, index) => (
            <div
              key={`${target.name}-${index}`}
              className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  value={target.name}
                  onChange={(e) => updateTarget(index, "name", e.target.value)}
                  className={inputClass}
                />
                <select
                  value={target.type}
                  onChange={(e) =>
                    updateTarget(index, "type", e.target.value as Target["type"])
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
                >
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeTarget(index)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
              <input
                value={target.url ?? ""}
                onChange={(e) => updateTarget(index, "url", e.target.value)}
                className={inputClass}
                placeholder="URL"
              />
              <textarea
                value={target.notes ?? ""}
                onChange={(e) => updateTarget(index, "notes", e.target.value)}
                rows={2}
                className={areaClass}
                placeholder="Notes"
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={target.contacted}
                    onChange={() => toggleTargetContacted(index)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-0"
                  />
                  <span>Contacted</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${target.name} (${target.type})\n${target.url ?? ""}\n${target.notes ?? ""}`,
                      `${target.name} target`
                    )
                  }
                  className="text-blue-300 hover:text-blue-200"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderOutreachTab = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerateOutreach}
          disabled={sectionBusy.outreach || !selectedProduct}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sectionBusy.outreach ? "Generating..." : "Generate outreach"}
        </button>
        <button
          type="button"
          onClick={handleSaveOutreach}
          disabled={!selectedProduct}
          className="rounded border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() =>
            setOutreachDraft((prev) => ({
              ...prev,
              emailTemplates: [...(prev.emailTemplates ?? []), ""],
            }))
          }
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          + Add email
        </button>
      </div>
      {(outreachDraft.emailTemplates ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No emails yet.</p>
      ) : (
        <div className="space-y-3">
          {(outreachDraft.emailTemplates ?? []).map((template, index) => (
            <div
              key={`email-${index}`}
              className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Email {index + 1}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(template, "Email template")}
                    className="text-blue-300 hover:text-blue-200"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOutreachDraft((prev) => ({
                        ...prev,
                        emailTemplates:
                          prev.emailTemplates?.filter((_, i) => i !== index) ??
                          [],
                      }))
                    }
                    className="text-red-300 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <textarea
                value={template}
                onChange={(e) =>
                  setOutreachDraft((prev) => {
                    const emails = [...(prev.emailTemplates ?? [])];
                    emails[index] = e.target.value;
                    return { ...prev, emailTemplates: emails };
                  })
                }
                rows={4}
                className={areaClass}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">LinkedIn templates</p>
        <button
          type="button"
          onClick={() =>
            setOutreachDraft((prev) => ({
              ...prev,
              linkedinTemplates: [...(prev.linkedinTemplates ?? []), ""],
            }))
          }
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          + Add message
        </button>
      </div>
      {(outreachDraft.linkedinTemplates ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No LinkedIn messages yet.</p>
      ) : (
        <div className="space-y-3">
          {(outreachDraft.linkedinTemplates ?? []).map((template, index) => (
            <div
              key={`linkedin-${index}`}
              className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Message {index + 1}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(template, "LinkedIn template")
                    }
                    className="text-blue-300 hover:text-blue-200"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOutreachDraft((prev) => ({
                        ...prev,
                        linkedinTemplates:
                          prev.linkedinTemplates?.filter((_, i) => i !== index) ??
                          [],
                      }))
                    }
                    className="text-red-300 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <textarea
                value={template}
                onChange={(e) =>
                  setOutreachDraft((prev) => {
                    const templates = [...(prev.linkedinTemplates ?? [])];
                    templates[index] = e.target.value;
                    return { ...prev, linkedinTemplates: templates };
                  })
                }
                rows={4}
                className={areaClass}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderLaunchTab = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {["producthunt", "twitter", "linkedin", "hackernews"].map(
          (platform) => (
            <button
              key={platform}
              type="button"
              onClick={() =>
                handleGenerateLaunch(
                  platform as "producthunt" | "twitter" | "linkedin" | "hackernews"
                )
              }
              disabled={sectionBusy[`launch-${platform}`] || !selectedProduct}
              className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {sectionBusy[`launch-${platform}`] ? "..." : platform}
            </button>
          )
        )}
        <button
          type="button"
          onClick={handleSaveLaunch}
          disabled={!selectedProduct}
          className="rounded border border-slate-700 px-3 py-2 text-xs text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>Product Hunt</span>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(
                  [
                    launchDraft.productHunt?.tagline ?? "",
                    launchDraft.productHunt?.description ?? "",
                    launchDraft.productHunt?.firstComment ?? "",
                    launchDraft.productHunt?.makerComment ?? "",
                  ].join("\n\n"),
                  "Product Hunt kit"
                )
              }
              className="text-xs text-blue-300 hover:text-blue-200"
            >
              Copy
            </button>
          </div>
          <input
            value={launchDraft.productHunt?.tagline ?? ""}
            onChange={(e) => updateLaunchField("tagline", e.target.value)}
            className={inputClass}
            placeholder="Tagline"
          />
          <textarea
            value={launchDraft.productHunt?.description ?? ""}
            onChange={(e) => updateLaunchField("description", e.target.value)}
            rows={3}
            className={areaClass}
            placeholder="Description"
          />
          <textarea
            value={launchDraft.productHunt?.firstComment ?? ""}
            onChange={(e) => updateLaunchField("firstComment", e.target.value)}
            rows={3}
            className={areaClass}
            placeholder="First comment"
          />
          <textarea
            value={launchDraft.productHunt?.makerComment ?? ""}
            onChange={(e) => updateLaunchField("makerComment", e.target.value)}
            rows={3}
            className={areaClass}
            placeholder="Maker comment"
          />
        </div>
        <div className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>Social posts</span>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(
                  [
                    launchDraft.twitter ?? "",
                    launchDraft.linkedin ?? "",
                    launchDraft.hackerNews ?? "",
                  ].join("\n\n"),
                  "Launch posts"
                )
              }
              className="text-xs text-blue-300 hover:text-blue-200"
            >
              Copy all
            </button>
          </div>
          <textarea
            value={launchDraft.twitter ?? ""}
            onChange={(e) =>
              setLaunchDraft((prev) => ({ ...prev, twitter: e.target.value }))
            }
            rows={3}
            className={areaClass}
            placeholder="Twitter thread"
          />
          <textarea
            value={launchDraft.linkedin ?? ""}
            onChange={(e) =>
              setLaunchDraft((prev) => ({ ...prev, linkedin: e.target.value }))
            }
            rows={3}
            className={areaClass}
            placeholder="LinkedIn post"
          />
          <textarea
            value={launchDraft.hackerNews ?? ""}
            onChange={(e) =>
              setLaunchDraft((prev) => ({
                ...prev,
                hackerNews: e.target.value,
              }))
            }
            rows={3}
            className={areaClass}
            placeholder="Show HN"
          />
        </div>
      </div>
    </div>
  );

  const renderProgressTab = () => (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Track launch readiness. Toggling saves instantly.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {progressLabels.map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
          >
            <input
              type="checkbox"
              checked={progressDraft[item.key]}
              onChange={() => toggleProgress(item.key)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-0"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      {selectedProduct ? (
        <div className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
          <p>Created: {formatDate(selectedProduct.createdAt)}</p>
          <p>Updated: {formatDate(selectedProduct.updatedAt)}</p>
        </div>
      ) : null}
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "pitch":
        return renderPitchTab();
      case "pricing":
        return renderPricingTab();
      case "icp":
        return renderICPTab();
      case "outreach":
        return renderOutreachTab();
      case "launch":
        return renderLaunchTab();
      case "progress":
        return renderProgressTab();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Launcher Core
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Product Registry
            </h1>
            <p className="text-sm text-slate-400">
              Organize pitch, pricing, ICP, outreach, and launch content in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/setup"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Interview mode
            </a>
            <button
              type="button"
              onClick={startNew}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
            >
              + New product
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
          <aside className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Products</h2>
              <span className="text-xs text-slate-500">
                {products.length} total
              </span>
            </div>
            {loading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-slate-400">
                No products yet. Click “New product”.
              </p>
            ) : (
              <div className="space-y-2">
                {products.map((product) => {
                  const isActive =
                    mode === "edit" && selectedId === product.id;
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleSelect(product)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-blue-500 bg-slate-800"
                          : "border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-white">
                          {product.name}
                        </span>
                        <StatusBadge status={product.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                        {product.description}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
                        Updated {formatDate(product.updatedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {mode === "create" ? "Create" : "Edit"}
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  {mode === "create"
                    ? "New product"
                    : selectedProduct?.name ?? "Select a product"}
                </h2>
              </div>
              {selectedProduct && mode === "edit" ? (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedProduct.id)}
                  disabled={deletingId === selectedProduct.id || saving}
                  className="text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
                >
                  {deletingId === selectedProduct.id ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </div>
            {error ? (
              <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-200">
                  <span className="mb-1 block text-xs uppercase text-slate-500">
                    Name
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="e.g. GreenLens"
                  />
                </label>
                <label className="text-sm text-slate-200">
                  <span className="mb-1 block text-xs uppercase text-slate-500">
                    Status
                  </span>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                    className={inputClass}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-sm text-slate-200">
                <span className="mb-1 block text-xs uppercase text-slate-500">
                  Description
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={4}
                  className={areaClass}
                  placeholder="What does this product do and who is it for?"
                />
              </label>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Repo context (auto-fill)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    placeholder="/Users/jilani/clawd/my-repo"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleAnalyzeRepo}
                    disabled={repoAnalyzing}
                    className="rounded border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {repoAnalyzing ? "Analyzing..." : "Import from repo"}
                  </button>
                </div>
                {repoAnalysis ? (
                  <p className="mt-2 text-xs text-slate-400">
                    {repoAnalysis.summary}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving
                    ? mode === "edit"
                      ? "Saving..."
                      : "Creating..."
                    : mode === "edit"
                      ? "Save changes"
                      : "Create product"}
                </button>
                {mode === "edit" ? (
                  <button
                    type="button"
                    onClick={startNew}
                    className="text-sm text-slate-300 hover:text-white"
                    disabled={saving}
                  >
                    Start new product
                  </button>
                ) : null}
              </div>
            </form>

            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
                {renderActiveTab()}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
