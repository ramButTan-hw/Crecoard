import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireBot } from "@/lib/botAuth";
import { mutateBoardItem } from "@/lib/botBoardWrite";

/**
 * POST /api/bot/list-entry — append an entry to a list item (board:write).
 * Body: { boardId, itemId, text, due?, checked? }
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
  // Plain text only — list entries render as HTML, so escape angle brackets.
  const text = String(body.text ?? "").trim().slice(0, 500)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!boardId || !itemId || !text) {
    return NextResponse.json({ error: "boardId, itemId, and text are required." }, { status: 400 });
  }

  const outcome = await mutateBoardItem(db, {
    boardId,
    serverId: bot.serverId,
    itemId,
    expectType: "list",
    mutate: (item) => {
      const entry = {
        id: randomUUID(),
        text,
        checked: body.checked === true,
        due: typeof body.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : undefined,
      };
      item.listItems = [...((item.listItems as unknown[] | undefined) ?? []), entry];
      return { ok: true, result: entry };
    },
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ entry: outcome.result });
}
