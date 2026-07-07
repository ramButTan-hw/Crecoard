"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Kanban, ListChecks, CalendarDays, X as XIcon } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import { useUser } from "@/contexts/UserContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { extractBoardTasks, type TaskFacts } from "@/lib/taskFacts";
import { dueMeta } from "@/components/items/TaskFields";
import { cn } from "@/lib/utils";

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KIND_ICONS = { kanban: Kanban, list: ListChecks, event: CalendarDays } as const;

function TaskRow({ t }: { t: TaskFacts }) {
  const profiles = useProfiles();
  const assignee = t.assigneeId ? profiles.get(t.assigneeId) : undefined;
  const Icon = KIND_ICONS[t.kind];
  const meta = t.due && t.kind !== "event" ? dueMeta(t.due, t.done) : null;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-overlay)]">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: t.color || "var(--accent)" }} />
      <Icon size={12} className="flex-shrink-0 text-[var(--text-muted)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-[var(--text-primary)]">{t.title}</p>
        <p className="truncate text-[10px] text-[var(--text-muted)]">
          {t.boardName}
          {t.startTime ? ` · ${t.startTime}` : ""}
        </p>
      </div>
      {meta && <span className={cn("flex-shrink-0 text-[10px] tabular-nums", meta.className)}>{meta.label}</span>}
      {assignee && (
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-bold text-white"
          style={{ background: assignee.color || "var(--accent)" }}
          title={`Assigned to ${assignee.displayName}`}
        >
          {assignee.avatarUrl?.startsWith("http")
            ? <img src={assignee.avatarUrl} alt="" className="h-full w-full object-cover" />
            : assignee.displayName[0]?.toUpperCase()}
        </span>
      )}
    </div>
  );
}

function Section({ label, tasks, tone }: { label: string; tasks: TaskFacts[]; tone?: string }) {
  if (tasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className={cn("px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider", tone ?? "text-[var(--text-muted)]")}>
        {label} · {tasks.length}
      </p>
      {tasks.map((t) => <TaskRow key={t.id} t={t} />)}
    </div>
  );
}

/**
 * Cross-board "Today" agenda: overdue / due today / next 7 days / assigned to me,
 * plus today's calendar events. Read-side only — aggregates whatever boards are
 * currently in the store (all personal boards + server boards visited this session).
 */
export function TodayPanel({ onClose }: { onClose: () => void }) {
  const { identity } = useUser();
  const { ensure } = useProfiles();
  const boards = useBoardStore((s) => s.boards);
  const serverBoards = useBoardStore((s) => s.serverBoards);

  const tasks = useMemo(() => {
    const all: TaskFacts[] = [];
    for (const b of boards) {
      if (!b.deletedAt) all.push(...extractBoardTasks(b));
    }
    for (const [key, b] of Object.entries(serverBoards)) {
      if (key.endsWith(":live") || b.deletedAt) continue; // drafts only, no live snapshots
      all.push(...extractBoardTasks(b));
    }
    return all;
  }, [boards, serverBoards]);

  useEffect(() => {
    ensure(tasks.map((t) => t.assigneeId).filter((x): x is string => !!x));
  }, [tasks, ensure]);

  const tKey = localKey(new Date());
  const weekOut = new Date();
  weekOut.setDate(weekOut.getDate() + 7);
  const wKey = localKey(weekOut);

  const byDue = (a: TaskFacts, b: TaskFacts) => (a.due ?? "").localeCompare(b.due ?? "");
  const open = tasks.filter((t) => t.kind !== "event" && !t.done);
  const overdue = open.filter((t) => t.due && t.due < tKey).sort(byDue);
  const dueToday = open.filter((t) => t.due === tKey);
  const upcoming = open.filter((t) => t.due && t.due > tKey && t.due <= wKey).sort(byDue);
  const mineUndated = open.filter((t) => !t.due && t.assigneeId === identity.userId);
  const todaysEvents = tasks
    .filter((t) => t.kind === "event" && t.due === tKey)
    .sort((a, b) => (a.startTime ?? "00:00").localeCompare(b.startTime ?? "00:00"));

  const isEmpty = !overdue.length && !dueToday.length && !upcoming.length && !mineUndated.length && !todaysEvents.length;
  const heading = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return createPortal(
    <div className="fixed inset-0 z-[998]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="absolute flex flex-col overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl"
        style={{ top: 52, right: 12, width: 320, maxHeight: "min(560px, calc(100vh - 70px))", background: "var(--surface-raised)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Today</p>
            <p className="text-[10px] text-[var(--text-muted)]">{heading}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
            <XIcon size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {isEmpty ? (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-[var(--text-muted)]">
              Nothing due and no events today.
              <br />
              Set due dates on kanban cards and list entries to see them here.
            </p>
          ) : (
            <>
              <Section label="Overdue" tasks={overdue} tone="text-red-400" />
              <Section label="Today" tasks={dueToday} tone="text-amber-400" />
              <Section label="Events today" tasks={todaysEvents} />
              <Section label="Next 7 days" tasks={upcoming} />
              <Section label="Assigned to me" tasks={mineUndated} />
            </>
          )}
        </div>
        <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
          Personal boards + server boards visited this session
        </p>
      </div>
    </div>,
    document.body
  );
}
