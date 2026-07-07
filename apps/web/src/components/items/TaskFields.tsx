"use client";

/**
 * Shared due-date + assignee UI for task-shaped items (kanban cards, list entries).
 * Items keep owning their data — these are just the common chips, picker rows,
 * and a small popover editor, so every task-shaped item renders the vocabulary
 * the same way. (Groundwork for calendar projection / Today panel.)
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CalendarDays, X as XIcon } from "lucide-react";
import type { ServerMember } from "@/types/server";
import { useServerBoard } from "@/contexts/ServerBoardContext";
import { useUser } from "@/contexts/UserContext";
import { REMINDER_LEADS, eventStartDate, createReminder } from "@/lib/reminders";
import { cn } from "@/lib/utils";

/** Parse a YYYY-MM-DD due string as a local date (new Date("YYYY-MM-DD") is UTC). */
export function parseDue(due: string): Date {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function dueMeta(due: string, done: boolean): { label: string; className: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((parseDue(due).getTime() - today.getTime()) / 86400000);
  const label =
    diffDays === 0 ? "Today"
    : diffDays === 1 ? "Tomorrow"
    : parseDue(due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (done) return { label, className: "text-[var(--text-muted)] opacity-70" };
  if (diffDays < 0) return { label, className: "text-red-400" };
  if (diffDays === 0) return { label, className: "text-amber-400" };
  return { label, className: "text-[var(--text-muted)]" };
}

export function DueChip({ due, done, fontSize = 11 }: { due: string; done?: boolean; fontSize?: number }) {
  const { label, className } = dueMeta(due, !!done);
  return (
    <span className={cn("inline-flex items-center gap-1", className)} style={{ fontSize }}>
      <CalendarDays size={fontSize} className="flex-shrink-0" />
      <span className="whitespace-nowrap tabular-nums">{label}</span>
    </span>
  );
}

export function MemberAvatar({ member, size = 16, title }: { member: ServerMember; size?: number; title?: string }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.55)), background: "var(--accent)" }}
      title={title ?? `Assigned to ${member.username}`}
    >
      {member.avatar?.startsWith("http")
        ? <img src={member.avatar} alt="" className="h-full w-full object-cover" />
        : member.avatar}
    </span>
  );
}

export function AssigneeRows({
  members, assigneeId, onPick,
}: { members: ServerMember[]; assigneeId?: string; onPick: (id?: string) => void }) {
  const rowCls = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-[var(--surface-overlay)]",
      active ? "bg-[var(--surface-overlay)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
    );
  return (
    <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
      <button onClick={() => onPick(undefined)} className={rowCls(!assigneeId)}>
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)]">
          <XIcon size={9} />
        </span>
        Unassigned
      </button>
      {members.map((m) => (
        <button key={m.userId} onClick={() => onPick(m.userId)} className={rowCls(assigneeId === m.userId)}>
          <MemberAvatar member={m} size={16} title={m.username} />
          <span className="truncate">{m.username}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * "Remind me" lead-time buttons for anything with a due date — same UX as the
 * calendar event popup, backed by the same cron/email/push reminders pipeline.
 * All-day semantics: reminders anchor to 9:00 on the due day (see eventStartDate).
 */
export function RemindMeControl({ title, due, boardId, itemId }: {
  title: string;
  due?: string;
  boardId?: string;
  itemId?: string;
}) {
  const { identity } = useUser();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A task carries only a due date, so the user picks the due time (the anchor)
  // and how far ahead to be reminded. The reminder fires at (due time − lead).
  const [time, setTime] = useState("09:00");
  const [lead, setLead] = useState(0);
  if (!due) return null;

  const anchor = eventStartDate(due, time || undefined);
  const fireAt = new Date(anchor.getTime() - lead);
  const passed = fireAt.getTime() <= Date.now();
  const firePreview = fireAt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Editing any field after a successful set re-arms the button for another.
  const touch = () => { if (done) setDone(false); if (err) setErr(null); };

  const setReminder = async () => {
    if (passed) { setErr("That time is already past — pick a later time."); return; }
    setBusy(true);
    const res = await createReminder({
      userId: identity.userId,
      title: title.trim() || "Task",
      body: `Due ${anchor.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      remindAt: fireAt,
      boardId,
      itemId,
      url: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setErr("Couldn't set reminder — sign in and try again.");
  };

  const fieldCls = "min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"><Bell size={13} /> Reminder</span>

      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="w-11 shrink-0">Due at</span>
        <input type="time" aria-label="Due time" value={time} onChange={(e) => { setTime(e.target.value); touch(); }} className={fieldCls} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="w-11 shrink-0">Remind</span>
        <select aria-label="How early to remind" value={lead} onChange={(e) => { setLead(Number(e.target.value)); touch(); }} className={fieldCls}>
          {REMINDER_LEADS.map((l) => <option key={l.label} value={l.ms}>{l.label}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className={cn("text-[11px]", passed ? "text-red-400" : "text-[var(--text-muted)]")}>
          {passed ? "Time already past" : <>Fires <span className="font-medium text-[var(--text-secondary)]">{firePreview}</span></>}
        </span>
        {done ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400"><Bell size={11} /> Reminder set</span>
        ) : (
          <button
            onClick={setReminder}
            disabled={busy || passed}
            className="rounded-md px-3 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Setting…" : "Set reminder"}
          </button>
        )}
      </div>

      {err && <p className="text-[11px] text-red-400">{err}</p>}
      {done && (
        <p className="text-[10px] leading-tight text-[var(--text-muted)]">
          You&apos;ll be notified by email{typeof window !== "undefined" && window.electron ? " and a desktop ping" : ""}. Change a field above to add another.
        </p>
      )}
    </div>
  );
}

/** Anchored member picker for table "member" cells. */
export function MemberPickerPopover({
  x, y, assigneeId, onPick, onClose,
}: {
  x: number;
  y: number;
  assigneeId?: string;
  onPick: (id?: string) => void;
  onClose: () => void;
}) {
  const { members } = useServerBoard();
  const width = 200;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 220));
  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="absolute flex flex-col gap-1 rounded-xl border border-[var(--border)] p-2 shadow-2xl"
        style={{ left, top, width, background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {members.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">No server members — member columns only resolve on server boards.</p>
        ) : (
          <AssigneeRows members={members} assigneeId={assigneeId} onPick={onPick} />
        )}
      </div>
    </div>,
    document.body
  );
}

/** Small anchored editor for due + assignee on inline rows (list entries). */
export function TaskFieldsPopover({
  x, y, due, assigneeId, onChange, onClose, remind,
}: {
  x: number;
  y: number;
  due?: string;
  assigneeId?: string;
  onChange: (patch: { due?: string; assigneeId?: string }) => void;
  onClose: () => void;
  /** When set, shows the "Remind me" control once a due date exists. */
  remind?: { title: string; boardId?: string; itemId: string };
}) {
  const { members } = useServerBoard();
  const width = 220;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 340));
  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="absolute flex flex-col gap-2 rounded-xl border border-[var(--border)] p-3 shadow-2xl"
        style={{ left, top, width, background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Due date</span>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={due ?? ""}
            onChange={(e) => onChange({ due: e.target.value || undefined, assigneeId })}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {due && (
            <button
              onClick={() => onChange({ due: undefined, assigneeId })}
              className="flex-shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </div>
        {members.length > 0 && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Assignee</span>
            <AssigneeRows
              members={members}
              assigneeId={assigneeId}
              onPick={(id) => onChange({ due, assigneeId: id })}
            />
          </>
        )}
        {remind && (due ? (
          <RemindMeControl title={remind.title} due={due} boardId={remind.boardId} itemId={remind.itemId} />
        ) : (
          <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
            <Bell size={12} className="opacity-70" /> Add a due date to set a reminder
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
