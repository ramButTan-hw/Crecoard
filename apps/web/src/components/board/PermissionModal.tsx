"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, X } from "lucide-react";
import type { BoxPerms, ItemPerms } from "@/store/boardStore";
import { useServerBoard } from "@/contexts/ServerBoardContext";
import { ITEM_FN_SCHEMAS } from "@/lib/playlist";
import { cn } from "@/lib/utils";

// ─── Role toggle selector ─────────────────────────────────────────────────────

/**
 * null  = no restriction (saves as undefined)
 * string[] = specific ServerRole IDs (empty = owner-only)
 */
type PermValue = string[] | null;

function initPerm(arr?: string[]): PermValue {
  return arr === undefined ? null : arr;
}

function savePerm(v: PermValue): string[] | undefined {
  return v === null ? undefined : v;
}

function RoleSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: PermValue;
  onChange: (v: PermValue) => void;
}) {
  const { serverRoles } = useServerBoard();
  const isEveryone = value === null;

  function toggle(roleId: string) {
    if (isEveryone) {
      // Coming from "everyone" — switch to just this one role
      onChange([roleId]);
      return;
    }
    const current = value as string[];
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {/* Everyone (no restriction) chip */}
        <button
          onClick={() => onChange(null)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all border",
            isEveryone
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
          )}
          title="All members can perform this action"
        >
          @everyone
        </button>

        {/* Individual server roles */}
        {serverRoles.map((role) => {
          const selected = !isEveryone && (value as string[]).includes(role.id);
          return (
            <button
              key={role.id}
              onClick={() => toggle(role.id)}
              title={role.name}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all border",
                selected
                  ? "text-white border-transparent"
                  : isEveryone
                    ? "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] opacity-40"
                    : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
              )}
              style={selected ? { background: role.color, borderColor: role.color } : undefined}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: selected ? "rgba(255,255,255,0.7)" : role.color }}
              />
              {role.name}
            </button>
          );
        })}

        {/* Owner always chip — informational */}
        <span
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border border-[var(--border)] text-[var(--text-muted)] opacity-60 cursor-default"
          title="Owner always has access"
        >
          <Crown size={9} />
          Owner
        </span>
      </div>

      {serverRoles.length === 0 && !isEveryone && (
        <p className="text-[11px] text-[var(--text-muted)] italic">No custom roles — create roles in server settings.</p>
      )}
    </div>
  );
}

// ─── Box permissions modal ────────────────────────────────────────────────────

interface BoxPermModalProps {
  targetLabel: string;
  initialPerms?: BoxPerms;
  onSave: (perms: BoxPerms) => void;
  onClose: () => void;
}

export function BoxPermissionModal({ targetLabel, initialPerms, onSave, onClose }: BoxPermModalProps) {
  const [edit,     setEdit]     = useState<PermValue>(initPerm(initialPerms?.edit));
  const [interact, setInteract] = useState<PermValue>(initPerm(initialPerms?.interact));

  return (
    <PermModalShell title="Block Permissions" subtitle={targetLabel} onClose={onClose}
      onSave={() => { onSave({ edit: savePerm(edit), interact: savePerm(interact) }); onClose(); }}>
      <RoleSelector label="Edit" description="Who can add, remove, and rearrange items" value={edit} onChange={setEdit} />
      <RoleSelector label="Interact" description="Who can interact with items inside (click, toggle, play)" value={interact} onChange={setInteract} />
    </PermModalShell>
  );
}

// ─── Item permissions modal ───────────────────────────────────────────────────

interface ItemPermModalProps {
  targetLabel: string;
  /** Item type — unlocks per-function permission rows when a schema exists (e.g. playlist) */
  itemType?: string;
  initialPerms?: ItemPerms;
  onSave: (perms: ItemPerms) => void;
  onClose: () => void;
}

export function ItemPermissionModal({ targetLabel, itemType, initialPerms, onSave, onClose }: ItemPermModalProps) {
  const [edit,     setEdit]     = useState<PermValue>(initPerm(initialPerms?.edit));
  const [input,    setInput]    = useState<PermValue>(initPerm(initialPerms?.input));
  const [interact, setInteract] = useState<PermValue>(initPerm(initialPerms?.interact));

  // Per-function rows (granular controls inside the item, e.g. playlist playback/queue/volume)
  const fnSchema = itemType ? ITEM_FN_SCHEMAS[itemType] : undefined;
  const [fns, setFns] = useState<Record<string, PermValue>>(() =>
    Object.fromEntries((fnSchema ?? []).map((f) => [f.id, initPerm(initialPerms?.fns?.[f.id])]))
  );

  const save = () => {
    const fnsOut: Record<string, string[]> = {};
    for (const f of fnSchema ?? []) {
      const v = savePerm(fns[f.id] ?? null);
      if (v !== undefined) fnsOut[f.id] = v;
    }
    onSave({
      edit: savePerm(edit),
      input: savePerm(input),
      interact: savePerm(interact),
      fns: Object.keys(fnsOut).length > 0 ? fnsOut : undefined,
    });
    onClose();
  };

  return (
    <PermModalShell title="Item Permissions" subtitle={targetLabel} onClose={onClose} onSave={save}>
      <RoleSelector label="Edit" description="Who can edit settings and style" value={edit} onChange={setEdit} />
      <RoleSelector label="Text entry" description="Who can type or enter text" value={input} onChange={setInput} />
      <RoleSelector label="Interact" description="Who can click, toggle, and use this item (master switch)" value={interact} onChange={setInteract} />
      {fnSchema && fnSchema.length > 0 && (
        <>
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Functions</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Fine-grained controls within the item</p>
          </div>
          {fnSchema.map((f) => (
            <RoleSelector key={f.id} label={f.label} description={f.description}
              value={fns[f.id] ?? null}
              onChange={(v) => setFns((prev) => ({ ...prev, [f.id]: v }))} />
          ))}
        </>
      )}
    </PermModalShell>
  );
}

// ─── Shared shell ─────────────────────────────────────────────────────────────

function PermModalShell({
  title, subtitle, onClose, onSave, children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Portal to <body> so this escapes the board canvas's transform stacking context
  // (otherwise embed/widget iframes on the canvas paint over the modal).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[380px] max-h-[min(640px,calc(100vh-48px))] rounded-xl border border-[var(--border)] shadow-2xl flex flex-col"
        style={{ background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3.5 border-b border-[var(--border)]">
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate max-w-[300px]">{subtitle}</p>
          </div>
          <button onClick={onClose} className="mt-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-4 py-4 overflow-y-auto min-h-0">
          {children}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
