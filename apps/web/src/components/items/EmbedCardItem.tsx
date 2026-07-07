"use client";

import { ExternalLink, Zap } from "lucide-react";
import type { BlockItem, EmbedCardData } from "@/store/boardStore";

// ─── Renderer ─────────────────────────────────────────────────────────────────

interface EmbedCardItemProps {
  item: BlockItem;
  collapsed?: boolean;
}

export function EmbedCardItem({ item, collapsed }: EmbedCardItemProps) {
  const card: EmbedCardData = item.embedCard ?? {};
  const accent = card.accentColor ?? "var(--accent)";
  const hasFields = card.fields && card.fields.length > 0;

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-secondary)] truncate">
        <Zap size={11} className="flex-shrink-0" style={{ color: accent }} />
        <span className="truncate">{card.title ?? "Integration card"}</span>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden rounded-md"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
    >
      {/* Left accent bar */}
      <div className="flex-shrink-0 w-1 rounded-l-md" style={{ background: accent }} />

      <div className="flex flex-col flex-1 min-w-0 p-3 gap-2 overflow-hidden">
        {/* Header row: icon + title + optional thumbnail */}
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            {/* Source label */}
            {card.source && (
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: accent, opacity: 0.85 }}>
                {card.source}
              </p>
            )}

            {/* Title */}
            {card.title && (
              <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
                {card.title}
              </p>
            )}

            {/* Description */}
            {card.description && (
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-0.5 line-clamp-3">
                {card.description}
              </p>
            )}
          </div>

          {/* Thumbnail */}
          {card.thumbnailUrl && (
            <img
              src={card.thumbnailUrl}
              alt=""
              className="w-12 h-12 flex-shrink-0 rounded object-cover border border-[var(--border)]"
            />
          )}
        </div>

        {/* Fields */}
        {hasFields && (
          <div className="grid gap-x-3 gap-y-1.5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {card.fields!.map((f, i) => (
              <div key={i} className={f.inline === false ? "col-span-full" : ""}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {f.label}
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Large image */}
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt=""
            className="w-full rounded object-cover border border-[var(--border)]"
            style={{ maxHeight: 120 }}
          />
        )}

        {/* Footer */}
        {(card.footer || card.timestamp) && (
          <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-[var(--border)]">
            <span className="text-[11px] text-[var(--text-muted)] truncate">
              {[card.footer, card.timestamp ? new Date(card.timestamp).toLocaleString() : undefined]
                .filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style panel ──────────────────────────────────────────────────────────────

interface EmbedCardStylePanelProps {
  item: BlockItem;
  upd: (patch: Partial<BlockItem>) => void;
}

export function EmbedCardStylePanel({ item, upd }: EmbedCardStylePanelProps) {
  const card = item.embedCard ?? {};
  const patch = (p: Partial<EmbedCardData>) => upd({ embedCard: { ...card, ...p } });

  return (
    <div className="p-4 flex flex-col gap-4 text-xs">
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Content</p>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-secondary)]">Title</span>
          <input
            value={card.title ?? ""}
            onChange={(e) => patch({ title: e.target.value })}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-secondary)]">Description</span>
          <textarea
            value={card.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-secondary)]">Source label</span>
          <input
            value={card.source ?? ""}
            onChange={(e) => patch({ source: e.target.value })}
            placeholder="e.g. GitHub, Tracker.gg"
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-secondary)]">Footer</span>
          <input
            value={card.footer ?? ""}
            onChange={(e) => patch({ footer: e.target.value })}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Appearance</p>

        <label className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">Accent color</span>
          <input
            type="color"
            value={card.accentColor ?? "#d59ee8"}
            onChange={(e) => patch({ accentColor: e.target.value })}
            className="h-6 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Fields</p>
        <p className="text-[var(--text-muted)] leading-relaxed">
          Fields are set by incoming webhooks. To add fields manually, send a POST to your board&apos;s webhook URL.
        </p>
        {(card.fields ?? []).length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {card.fields!.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                <span className="text-[var(--text-muted)] w-20 truncate">{f.label}</span>
                <span className="text-[var(--text-primary)] flex-1 truncate">{f.value}</span>
                <button
                  onClick={() => patch({ fields: card.fields!.filter((_, j) => j !== i) })}
                  className="text-[var(--text-muted)] hover:text-red-400 flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
