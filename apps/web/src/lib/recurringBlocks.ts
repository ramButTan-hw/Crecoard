"use client";

import { nanoid } from "nanoid";
import { useBoardStore, BlockItem, BoxRecurrence } from "@/store/boardStore";
import type { BoardOp } from "./collaboration";
import { saveBlockArchive } from "./blockArchive";

export type RecurrenceFreq = BoxRecurrence["freq"];

export const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/**
 * Next period boundary after `from`, in local time:
 * daily → next midnight, weekly → next Monday 00:00, monthly → 1st of next month 00:00.
 */
export function nextBoundary(freq: RecurrenceFreq, from: Date): number {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  if (freq === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (freq === "weekly") {
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  } else {
    d.setMonth(d.getMonth() + 1, 1);
  }
  return d.getTime();
}

/** Deep-clone template items with fresh ids so no id is ever shared across periods. */
export function instantiateTemplate(templateItems: BlockItem[]): BlockItem[] {
  const clones: BlockItem[] = JSON.parse(JSON.stringify(templateItems));
  return clones.map((item) => ({ ...item, id: nanoid() }));
}

/**
 * Reset every due recurring block on the board: archive the outgoing contents
 * (when enabled), swap in a fresh copy of the template, and schedule the next
 * boundary. Safe to call repeatedly — blocks whose boundary hasn't passed are
 * untouched, and the archive write is idempotent per (box, boundary).
 */
export function runDueRecurringResets(
  boardId: string,
  broadcastOp?: (op: Omit<BoardOp, "senderId">) => void
): void {
  const st = useBoardStore.getState();
  const board = st.boards.find((b) => b.id === boardId) ?? st.serverBoards[boardId];
  if (!board || board.isFinished) return;
  const now = Date.now();

  // Crash recovery: a template-edit stash with no open editor means the session
  // died mid-edit (reload/crash). Discard the partial template edits and restore
  // the live items so the block isn't stuck displaying its template.
  for (const box of board.boxes) {
    if (box.templateEditStash && st.expandedBoxId !== box.id) {
      st.endTemplateEdit(boardId, box.id, false);
    }
  }

  for (const box of board.boxes) {
    const rec = box.recurrence;
    // Never reset mid-template-edit — the box currently holds the template, not live items
    if (!rec || box.templateEditStash || now < rec.nextResetAt) continue;

    if (rec.autoArchive && box.items.length > 0) {
      void saveBlockArchive({
        boardId,
        boxId: box.id,
        title: box.title,
        periodStart: rec.lastResetAt ?? null,
        periodEnd: rec.nextResetAt,
        kind: "auto",
        pinned: false,
        items: box.items,
      });
    }

    const freshItems = instantiateTemplate(rec.templateItems);
    const recurrence: BoxRecurrence = { ...rec, lastResetAt: now, nextResetAt: nextBoundary(rec.freq, new Date(now)) };
    st.replaceBoxItems(boardId, box.id, freshItems);
    st.updateBox(boardId, box.id, { recurrence });
    broadcastOp?.({ op: "replaceBoxItems", boardId, boxId: box.id, items: freshItems });
    broadcastOp?.({ op: "updateBox", boardId, boxId: box.id, patch: { recurrence } });
  }
}
