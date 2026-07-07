"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import type { Box, BoxRecurrence } from "@/store/boardStore";
import { nextBoundary, FREQ_LABELS, RecurrenceFreq } from "@/lib/recurringBlocks";
import { cn } from "@/lib/utils";

interface Props {
  box: Box;
  onApply: (recurrence: BoxRecurrence | undefined) => void;
  /** Open the template in the expanded editor (only offered once recurrence exists) */
  onEditTemplate: () => void;
  onClose: () => void;
}

/**
 * Configure a block's recurring reset: at each daily/weekly/monthly boundary the
 * block's contents snap back to a saved template (with optional archiving of the
 * outgoing contents). The template is frozen from the block's current items.
 */
export function RecurrenceModal({ box, onApply, onEditTemplate, onClose }: Props) {
  const existing = box.recurrence;
  const [freq, setFreq] = useState<RecurrenceFreq>(existing?.freq ?? "daily");
  const [autoArchive, setAutoArchive] = useState(existing?.autoArchive ?? true);
  // Creating always freezes the current items; editing keeps the old template unless asked
  const [updateTemplate, setUpdateTemplate] = useState(!existing);

  const templateCount = updateTemplate ? box.items.length : existing?.templateItems.length ?? 0;
  const nextReset = new Date(nextBoundary(freq, new Date()));

  const save = () => {
    onApply({
      freq,
      autoArchive,
      templateItems: updateTemplate
        ? JSON.parse(JSON.stringify(box.items))
        : existing?.templateItems ?? [],
      nextResetAt: nextBoundary(freq, new Date()),
      lastResetAt: existing?.lastResetAt,
    });
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--border)] p-5 shadow-2xl"
        style={{ background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recurring reset</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <p className="mb-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
          {`"${box.title || "This block"}" will reset to its template at the start of each period — perfect for a journal or checklist you fill in fresh every time.`}
        </p>

        {/* Frequency */}
        <div className="mb-4 flex gap-1.5">
          {(Object.keys(FREQ_LABELS) as RecurrenceFreq[]).map((f) => (
            <button
              key={f}
              onClick={() => setFreq(f)}
              className={cn(
                "flex-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all",
                freq === f
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
              )}
            >
              {FREQ_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Options */}
        <label className="mb-2 flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={autoArchive} onChange={(e) => setAutoArchive(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span className="text-[12px] text-[var(--text-secondary)]">
            Save outgoing contents to the block archive before each reset
            <span className="block text-[11px] text-[var(--text-muted)]">View past periods via right-click → View archive</span>
          </span>
        </label>

        {existing && (
          <label className="mb-2 flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={updateTemplate} onChange={(e) => setUpdateTemplate(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span className="text-[12px] text-[var(--text-secondary)]">Replace the template with the block&apos;s current contents</span>
          </label>
        )}

        <div className="mb-4 mt-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <span className="text-[11px] text-[var(--text-muted)]">
            Template: {templateCount} item{templateCount !== 1 ? "s" : ""} · Next reset:{" "}
            {nextReset.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </span>
          {existing && (
            <button
              onClick={() => { onClose(); onEditTemplate(); }}
              className="shrink-0 text-[11px] font-medium text-[var(--accent)] hover:underline"
            >
              Edit template →
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          {existing ? (
            <button
              onClick={() => { onApply(undefined); onClose(); }}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Turn off
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
              Cancel
            </button>
            <button onClick={save} className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity">
              {existing ? "Save" : "Make recurring"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
