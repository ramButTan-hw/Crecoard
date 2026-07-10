"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, Braces, Download, FileText, Image as ImageIcon, Pin, PinOff, RotateCcw, Trash2, X } from "lucide-react";
import type { BlockItem, Box } from "@/store/boardStore";
import {
  BlockArchiveEntry, listBlockArchives, deleteBlockArchive,
  setBlockArchivePinned, downloadArchivesJson, MAX_AUTO_PER_BOX,
} from "@/lib/blockArchive";
import { periodLabel, downloadArchivesText, downloadArchivePng, downloadArchiveCapture } from "@/lib/archiveExport";
import { cn } from "@/lib/utils";

interface Props {
  boardId: string;
  box: Box;
  /** Restore a snapshot's items into the block (caller handles store + collab) */
  onRestore: (items: BlockItem[]) => void;
  onClose: () => void;
}

/** Browse a block's archived snapshots: pin, restore, export, or delete them. */
export function BlockArchiveModal({ boardId, box, onRestore, onClose }: Props) {
  const [entries, setEntries] = useState<BlockArchiveEntry[] | null>(null);
  // Export picker: which entry it's for ("all" = footer button) and where to draw it
  const [exportFor, setExportFor] = useState<{ id: string | "all"; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void listBlockArchives(boardId, box.id).then((e) => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [boardId, box.id]);

  const patch = (id: string, p: Partial<BlockArchiveEntry>) =>
    setEntries((es) => es?.map((e) => (e.id === id ? { ...e, ...p } : e)) ?? null);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-[var(--border)] shadow-2xl max-h-[70vh]"
        style={{ background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Archive size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Archive — {box.title || "Untitled block"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {entries === null ? (
            <p className="px-2 py-8 text-center text-[12px] text-[var(--text-muted)]">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12px] text-[var(--text-muted)]">
              Nothing archived yet. Recurring resets save each finished period here,
              or use &quot;Save to archive&quot; in the block&apos;s right-click menu.
            </p>
          ) : (
            <div className="space-y-1">
              {entries.map((e) => (
                <div key={e.id} className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-[var(--surface-overlay)] transition-colors">
                  {e.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.imageUrl}
                      alt=""
                      className="h-10 w-14 shrink-0 rounded border border-[var(--border)] object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--text-primary)]">{periodLabel(e)}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {e.items.length} item{e.items.length !== 1 ? "s" : ""} · {e.kind === "auto" ? "auto" : "manual"}
                      {e.pinned && " · pinned"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title={e.pinned ? "Unpin (auto-saves past the last 30 get pruned)" : "Pin — keep forever"}
                      onClick={() => { void setBlockArchivePinned(e.id, !e.pinned); patch(e.id, { pinned: !e.pinned }); }}
                      className={cn("rounded p-1.5 transition-colors hover:bg-[var(--surface)]", e.pinned ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                    >
                      {e.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button
                      title="Restore into the block (current contents are archived first)"
                      onClick={() => { onRestore(e.items); onClose(); }}
                      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      title="Export…"
                      onClick={(ev) => {
                        const r = ev.currentTarget.getBoundingClientRect();
                        setExportFor({ id: e.id, x: r.right, y: r.bottom + 4 });
                      }}
                      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      title="Delete snapshot"
                      onClick={() => { void deleteBlockArchive(e.id); setEntries((es) => es?.filter((x) => x.id !== e.id) ?? null); }}
                      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {e.pinned && <Pin size={11} className="text-[var(--accent)] group-hover:hidden" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Keeps the last {MAX_AUTO_PER_BOX} auto-saves — pin or export to keep forever.
          </p>
          {entries && entries.length > 0 && (
            <button
              onClick={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                setExportFor({ id: "all", x: r.right, y: r.top - 8 });
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
            >
              <Download size={12} />
              Export all
            </button>
          )}
        </div>

        {/* Export format picker — .txt for reading anywhere, .png to share, .json for full data */}
        {exportFor && (() => {
          const single = exportFor.id === "all" ? null : entries?.find((e) => e.id === exportFor.id) ?? null;
          const targets = single ? [single] : entries ?? [];
          const base = single ? `${box.title || "block"}-${periodLabel(single)}` : `${box.title || "block"}-archive`;
          const options: { icon: React.ReactNode; label: string; hint: string; run: () => void }[] = [
            { icon: <FileText size={13} />, label: "Text file", hint: ".txt — opens anywhere", run: () => downloadArchivesText(targets, base) },
            // Real capture when the snapshot has one; drawn journal card otherwise
            ...(single ? [{
              icon: <ImageIcon size={13} />,
              label: "Image",
              hint: single.imageUrl ? ".png — as captured" : ".png — journal card",
              run: () => void (single.imageUrl ? downloadArchiveCapture(single, base) : downloadArchivePng(single, box.style)),
            }] : []),
            { icon: <Braces size={13} />, label: "Data", hint: ".json — full backup", run: () => downloadArchivesJson(targets, base) },
          ];
          return (
            <>
              <div className="fixed inset-0 z-[10001]" onMouseDown={() => setExportFor(null)} />
              <div
                className="fixed z-[10002] min-w-[190px] rounded-xl border border-[var(--border)] py-1.5 shadow-2xl"
                style={{
                  left: Math.max(8, Math.min(exportFor.x - 190, window.innerWidth - 198)),
                  top: Math.max(8, Math.min(exportFor.y, window.innerHeight - 132)),
                  background: "var(--surface-raised)",
                }}
              >
                {options.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => { o.run(); setExportFor(null); }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                  >
                    <span className="shrink-0 text-[var(--text-muted)]">{o.icon}</span>
                    <span className="flex-1">{o.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{o.hint}</span>
                  </button>
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>,
    document.body
  );
}
