"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_SPEC, ensureAnimClass, specHash, type AnimSpec, type AnimStep } from "@/lib/animSpec";
import { deletePreset, listPresets, savePreset, type AnimPreset } from "@/lib/animLibrary";

/**
 * Animation library + keyframe builder. Applying always COPIES the spec onto
 * the item (via onApply) — the library is an authoring surface only.
 */
export function AnimationStudio({ serverId, initial, onApply, onClose }: {
  serverId: string | null;
  initial?: AnimSpec;
  onApply: (spec: AnimSpec) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"library" | "builder">(initial ? "builder" : "library");
  const [draft, setDraft] = useState<AnimSpec>(initial ?? DEFAULT_SPEC);
  const [presets, setPresets] = useState<AnimPreset[] | null>(null);
  const [saveTarget, setSaveTarget] = useState<"personal" | "server">("personal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listPresets(serverId).then((list) => { if (!cancelled) setPresets(list); });
    return () => { cancelled = true; };
  }, [serverId, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewClass = useMemo(() => ensureAnimClass(draft), [draft]);
  const previewKey = specHash(draft);

  const patchStep = (i: number, patch: Partial<AnimStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const addStep = () => setDraft((d) => {
    if (d.steps.length >= 6) return d;
    const last = d.steps[d.steps.length - 1];
    const prev = d.steps[d.steps.length - 2];
    const mid: AnimStep = { ...prev, at: Math.round((prev.at + last.at) / 2) };
    return { ...d, steps: [...d.steps.slice(0, -1), mid, last] };
  });

  const removeStep = (i: number) => setDraft((d) =>
    d.steps.length <= 2 || i === 0 || i === d.steps.length - 1 ? d : { ...d, steps: d.steps.filter((_, j) => j !== i) });

  const save = async () => {
    setSaving(true);
    await savePreset(draft, saveTarget === "server" ? serverId : null);
    setSaving(false);
    setView("library");
  };

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, suffix = "") => (
    <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
      <span className="w-11 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 cursor-pointer" style={{ accentColor: "var(--accent)" }} />
      <span className="w-10 text-right tabular-nums text-[var(--text-secondary)]">{value}{suffix}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-[440px] max-h-[min(680px,calc(100vh-48px))] flex-col rounded-xl border border-[var(--border)] shadow-2xl"
        style={{ background: "var(--surface-raised)" }} onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            {view === "builder" && (
              <button onClick={() => setView("library")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <ArrowLeft size={14} />
              </button>
            )}
            <Wand2 size={14} className="text-[var(--accent)]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              {view === "library" ? "Animation library" : "Animation builder"}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><X size={16} /></button>
        </div>

        {view === "library" ? (
          <>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-[200px]">
              {presets === null && <p className="p-4 text-center text-xs text-[var(--text-muted)]">Loading…</p>}
              {presets?.length === 0 && (
                <p className="p-4 text-center text-xs text-[var(--text-muted)]">No saved animations yet — build your first one.</p>
              )}
              {presets?.map((p) => (
                <div key={p.id} className="group flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                  <span key={specHash(p.spec)} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--surface-overlay)] text-[11px] font-bold text-[var(--text-primary)]", ensureAnimClass(p.spec))}>
                    Aa
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {p.spec.duration}s · {p.spec.loop ? "loop" : "once"}{p.serverId ? " · shared to server" : ""}
                    </p>
                  </div>
                  <button onClick={() => { setDraft(p.spec); setView("builder"); }}
                    className="rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-[var(--text-primary)]">
                    Edit
                  </button>
                  {p.mine && (
                    <button onClick={() => { void deletePreset(p.id); setPresets((l) => (l ?? []).filter((x) => x.id !== p.id)); }}
                      className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-red-400">
                      <Trash2 size={11} />
                    </button>
                  )}
                  <button onClick={() => onApply(p.spec)}
                    className="rounded bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 transition-opacity">
                    Apply
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--border)] p-3">
              <button onClick={() => { setDraft(DEFAULT_SPEC); setView("builder"); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                <Plus size={12} /> New animation
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Preview */}
              <div className="flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] py-6">
                <span key={previewKey} className={cn("rounded bg-[var(--surface-overlay)] px-4 py-2 text-sm font-bold text-[var(--text-primary)]", previewClass)}>
                  Aa
                </span>
              </div>

              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 40) }))}
                placeholder="Animation name"
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />

              {/* Steps */}
              {draft.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {i === 0 ? "Start" : i === draft.steps.length - 1 ? "End" : `Step · ${s.at}%`}
                    </p>
                    {i > 0 && i < draft.steps.length - 1 && (
                      <button onClick={() => removeStep(i)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                    )}
                  </div>
                  {i > 0 && i < draft.steps.length - 1 &&
                    slider("Offset", s.at, 1, 99, 1, (v) => patchStep(i, { at: v }), "%")}
                  {slider("Opacity", s.opacity, 0, 1, 0.05, (v) => patchStep(i, { opacity: v }))}
                  {slider("Move X", s.x, -100, 100, 1, (v) => patchStep(i, { x: v }), "px")}
                  {slider("Move Y", s.y, -100, 100, 1, (v) => patchStep(i, { y: v }), "px")}
                  {slider("Scale", s.scale, 0.2, 2.5, 0.05, (v) => patchStep(i, { scale: v }), "×")}
                  {slider("Rotate", s.rotate, -180, 180, 1, (v) => patchStep(i, { rotate: v }), "°")}
                </div>
              ))}
              {draft.steps.length < 6 && (
                <button onClick={addStep} className="flex items-center justify-center gap-1 rounded border border-dashed border-[var(--border)] py-1.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  <Plus size={11} /> Add step
                </button>
              )}

              {/* Timing */}
              <div className="rounded-lg border border-[var(--border)] p-2.5 flex flex-col gap-1.5">
                {slider("Duration", draft.duration, 0.1, 6, 0.1, (v) => setDraft((d) => ({ ...d, duration: v })), "s")}
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="w-11 shrink-0">Easing</span>
                  <select value={draft.easing} onChange={(e) => setDraft((d) => ({ ...d, easing: e.target.value as AnimSpec["easing"] }))}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--text-primary)] outline-none">
                    {["linear", "ease", "ease-in", "ease-out", "ease-in-out", "bounce"].map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={draft.loop} onChange={(e) => setDraft((d) => ({ ...d, loop: e.target.checked }))} className="accent-[var(--accent)]" />
                    Loop
                  </label>
                  {draft.loop && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[var(--text-secondary)]">
                      <input type="checkbox" checked={!!draft.alternate} onChange={(e) => setDraft((d) => ({ ...d, alternate: e.target.checked }))} className="accent-[var(--accent)]" />
                      Alternate direction
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              {serverId && (
                <select value={saveTarget} onChange={(e) => setSaveTarget(e.target.value as "personal" | "server")}
                  className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--text-muted)] outline-none">
                  <option value="personal">My library</option>
                  <option value="server">Server library</option>
                </select>
              )}
              <button onClick={() => void save()} disabled={saving}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">
                {saving ? "Saving…" : "Save to library"}
              </button>
              <span className="ml-auto" />
              <button onClick={() => onApply(draft)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 transition-opacity">
                <Check size={12} /> Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
