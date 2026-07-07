import { NextResponse, type NextRequest } from "next/server";
import { requireBot } from "@/lib/botAuth";

/**
 * GET /api/bot/board?boardId= — full board JSONB (board:read).
 * Omit boardId to list the server's boards (ids + names only).
 */
export async function GET(req: NextRequest) {
  const auth = await requireBot(req, "board:read");
  if (!auth.ok) return auth.response;
  const { bot, db } = auth;

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");

  if (!boardId) {
    const { data, error } = await db
      .from("boards")
      .select("id, data, updated_at")
      .eq("server_id", bot.serverId)
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      boards: (data ?? []).map((b) => ({
        id: b.id,
        name: ((b.data as { name?: string }) ?? {}).name ?? "Untitled",
        updatedAt: b.updated_at,
      })),
    });
  }

  const { data, error } = await db
    .from("boards")
    .select("id, data, updated_at")
    .eq("id", boardId)
    .eq("server_id", bot.serverId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Board not found on this bot's server." }, { status: 404 });

  return NextResponse.json({ id: data.id, board: data.data, updatedAt: data.updated_at });
}
