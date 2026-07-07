import { NextResponse, type NextRequest } from "next/server";
import { requireBot, boardBelongsToServer } from "@/lib/botAuth";

/**
 * GET /api/bot/chat?boardId=&itemId=&since=&limit= — poll messages (chat:read).
 * `since` is an ISO timestamp; poll with the last message's createdAt.
 */
export async function GET(req: NextRequest) {
  const auth = await requireBot(req, "chat:read");
  if (!auth.ok) return auth.response;
  const { bot, db } = auth;

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId") ?? "";
  const itemId = url.searchParams.get("itemId") ?? "";
  const since = url.searchParams.get("since");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  if (!boardId || !itemId) {
    return NextResponse.json({ error: "boardId and itemId are required." }, { status: 400 });
  }
  if (!(await boardBelongsToServer(db, boardId, bot.serverId))) {
    return NextResponse.json({ error: "Board not found on this bot's server." }, { status: 404 });
  }

  let q = db
    .from("board_chat_messages")
    .select("id, author_id, author_name, author_avatar, content, gif_url, image_url, created_at")
    .eq("board_id", boardId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (since) q = q.gt("created_at", since);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    messages: (data ?? []).map((m) => ({
      id: m.id,
      authorId: m.author_id,
      authorName: m.author_name,
      authorAvatar: m.author_avatar,
      content: m.content,
      gifUrl: m.gif_url,
      imageUrl: m.image_url,
      createdAt: m.created_at,
      isBot: m.author_id === bot.id,
    })),
  });
}

/**
 * POST /api/bot/chat — send a message as the bot (chat:write).
 * Body: { boardId, itemId, content }. Appears live via Supabase Realtime.
 */
export async function POST(req: NextRequest) {
  const auth = await requireBot(req, "chat:write");
  if (!auth.ok) return auth.response;
  const { bot, db } = auth;

  let body: { boardId?: string; itemId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const boardId = body.boardId ?? "";
  const itemId = body.itemId ?? "";
  const content = (body.content ?? "").trim();
  if (!boardId || !itemId || !content || content.length > 2000) {
    return NextResponse.json({ error: "boardId, itemId, and content (1–2000 chars) are required." }, { status: 400 });
  }
  if (!(await boardBelongsToServer(db, boardId, bot.serverId))) {
    return NextResponse.json({ error: "Board not found on this bot's server." }, { status: 404 });
  }

  const { data, error } = await db
    .from("board_chat_messages")
    .insert({
      board_id: boardId,
      item_id: itemId,
      author_id: bot.id,
      author_name: bot.name,
      author_avatar: bot.avatar ?? "🤖",
      content,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id, createdAt: data.created_at });
}
