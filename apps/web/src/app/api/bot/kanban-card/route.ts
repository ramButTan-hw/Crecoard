import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireBot } from "@/lib/botAuth";
import { mutateBoardItem } from "@/lib/botBoardWrite";

/**
 * POST /api/bot/kanban-card — append a card to a kanban item (board:write).
 * Body: { boardId, itemId, text, columnId?, description?, color?, due?, assigneeId? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireBot(req, "board:write");
  if (!auth.ok) return auth.response;
  const { bot, db } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const boardId = String(body.boardId ?? "");
  const itemId = String(body.itemId ?? "");
  const text = String(body.text ?? "").trim().slice(0, 300);
  if (!boardId || !itemId || !text) {
    return NextResponse.json({ error: "boardId, itemId, and text are required." }, { status: 400 });
  }

  const outcome = await mutateBoardItem(db, {
    boardId,
    serverId: bot.serverId,
    itemId,
    expectType: "kanban",
    mutate: (item) => {
      const columns = (item.kanbanColumns as { id: string }[] | undefined) ?? [
        { id: "col-todo" }, { id: "col-inprogress" }, { id: "col-done" },
      ];
      const requested = typeof body.columnId === "string" ? body.columnId : undefined;
      const columnId = requested && columns.some((c) => c.id === requested) ? requested : columns[0]?.id;
      if (!columnId) return { ok: false, error: "Kanban has no columns." };

      const cards = (item.kanbanCards as { columnId: string; order: number }[] | undefined) ?? [];
      const maxOrder = cards.filter((c) => c.columnId === columnId).reduce((m, c) => Math.max(m, c.order), -1);
      const card = {
        id: randomUUID(),
        columnId,
        text,
        description: typeof body.description === "string" ? body.description.slice(0, 1000) : undefined,
        color: typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : undefined,
        due: typeof body.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : undefined,
        assigneeId: typeof body.assigneeId === "string" ? body.assigneeId : undefined,
        order: maxOrder + 1,
      };
      item.kanbanCards = [...cards, card];
      return { ok: true, result: card };
    },
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ card: outcome.result });
}
