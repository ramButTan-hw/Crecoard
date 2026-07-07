/**
 * TaskFacts — read-side projection over task-shaped board items.
 *
 * Items keep owning their data (kanban cards, list entries, calendar events);
 * these extractors map each native shape onto one small shared interface so
 * aggregate views (Today panel) can render them together without a unified
 * task entity or any schema migration.
 */

import type { Board, BlockItem } from "@/store/boardStore";

export interface TaskFacts {
  /** Stable key: `${itemId}:${entryId}` */
  id: string;
  title: string;
  due?: string; // YYYY-MM-DD
  done: boolean;
  assigneeId?: string;
  color?: string;
  startTime?: string; // HH:MM — calendar events only
  kind: "kanban" | "list" | "event";
  boardId: string;
  boardName: string;
}

/** Flatten rich-text HTML (contenteditable list entries) to plain text for titles/exports. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function itemTasks(item: BlockItem, board: Board): TaskFacts[] {
  const out: TaskFacts[] = [];

  if (item.type === "kanban") {
    // When kanbanColumns is unset the renderer falls back to defaults where
    // "col-done" is the done column — mirror that here.
    const doneColIds = item.kanbanColumns
      ? new Set(item.kanbanColumns.filter((c) => c.isDone).map((c) => c.id))
      : new Set(["col-done"]);
    for (const card of item.kanbanCards ?? []) {
      if (!card.due && !card.assigneeId) continue;
      out.push({
        id: `${item.id}:${card.id}`,
        title: card.text || "(untitled)",
        due: card.due,
        done: doneColIds.has(card.columnId),
        assigneeId: card.assigneeId,
        color: card.color,
        kind: "kanban",
        boardId: board.id,
        boardName: board.name,
      });
    }
    return out;
  }

  if (item.type === "list") {
    for (const entry of item.listItems ?? []) {
      if (!entry.due && !entry.assigneeId) continue;
      out.push({
        id: `${item.id}:${entry.id}`,
        title: htmlToPlainText(entry.text) || "(untitled)",
        due: entry.due,
        done: entry.checked,
        assigneeId: entry.assigneeId,
        kind: "list",
        boardId: board.id,
        boardName: board.name,
      });
    }
    return out;
  }

  if (item.type === "calendar") {
    // Local events only — feed events are external schedule data (and RRULE
    // expansions can be hundreds of rows), not tasks the user owns.
    for (const ev of item.calendarEvents ?? []) {
      out.push({
        id: `${item.id}:${ev.id}`,
        title: ev.title,
        due: ev.date,
        done: false,
        color: ev.color,
        startTime: ev.startTime,
        kind: "event",
        boardId: board.id,
        boardName: board.name,
      });
    }
    return out;
  }

  return out;
}

/** Extract every task-shaped fact from one board (boxes + canvas-level items). */
export function extractBoardTasks(board: Board): TaskFacts[] {
  const out: TaskFacts[] = [];
  for (const box of board.boxes) {
    for (const it of box.items) out.push(...itemTasks(it, board));
  }
  for (const it of board.boardItems ?? []) out.push(...itemTasks(it, board));
  return out;
}
