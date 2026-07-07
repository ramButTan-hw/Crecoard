import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush, pushConfigured } from "@/lib/webpush";

// Web Push for board chat. Called by a database trigger (pg_net webhook) on
// every board_chat_messages INSERT. The payload only nominates a message id —
// everything pushed is re-read from the database with the service role, so a
// forged request can at worst re-announce a real recent message (and the
// throttle caps even that).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const MENTION_TOKEN = /<@([0-9a-fA-F-]{36})>/g;
/** Non-mention pushes per (user, channel) at most once per this window. */
const THROTTLE_MS = 5 * 60 * 1000;
/** Ignore trigger replays for old messages. */
const MAX_AGE_MS = 2 * 60 * 1000;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

function ready(): boolean {
  return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && Boolean(SUPABASE_SERVICE_KEY);
}

export async function POST(req: NextRequest) {
  if (!ready() || !pushConfigured()) return NextResponse.json({ skipped: "not configured" });

  let messageId: string | undefined;
  try {
    const body = await req.json();
    messageId = body?.record?.id ?? body?.id;
  } catch { /* fall through */ }
  if (!messageId) return NextResponse.json({ error: "no message id" }, { status: 400 });

  const db = admin();

  // Re-read the message — the DB is the only trusted source of content.
  const { data: msg } = await db
    .from("board_chat_messages")
    .select("id, board_id, channel, author_id, author_name, content, created_at")
    .eq("id", messageId)
    .single();
  if (!msg) return NextResponse.json({ error: "unknown message" }, { status: 404 });
  if (Date.now() - new Date(msg.created_at as string).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ skipped: "stale" });
  }

  // Recipients: everyone who can see the board, minus the author.
  const { data: board } = await db
    .from("boards")
    .select("id, user_id, server_id")
    .eq("id", msg.board_id)
    .single();
  if (!board) return NextResponse.json({ error: "unknown board" }, { status: 404 });

  let recipientIds: string[] = [];
  if (board.server_id) {
    const { data: members } = await db
      .from("server_members")
      .select("user_id")
      .eq("server_id", board.server_id);
    recipientIds = (members ?? []).map((m) => m.user_id as string);
  } else {
    const { data: collabs } = await db
      .from("board_collaborators")
      .select("user_id")
      .eq("board_id", board.id);
    recipientIds = [board.user_id as string, ...(collabs ?? []).map((c) => c.user_id as string)];
  }
  recipientIds = [...new Set(recipientIds)].filter((id) => id && id !== msg.author_id);
  if (recipientIds.length === 0) return NextResponse.json({ sent: 0 });

  const mentioned = new Set([...(msg.content as string ?? "").matchAll(MENTION_TOKEN)].map((m) => m[1]));
  const chatKey = `${msg.board_id}::${(msg.channel as string) ?? "general"}`;
  const channelLabel = `#${(msg.channel as string) ?? "general"}`;

  // Notification preferences: channel pref wins, then the user's server-wide
  // default (`server::<id>`), then 'all'.
  const prefKeys = board.server_id ? [chatKey, `server::${board.server_id}`] : [chatKey];
  const { data: prefRows } = await db
    .from("chat_notification_prefs")
    .select("user_id, chat_key, level")
    .in("chat_key", prefKeys)
    .in("user_id", recipientIds);
  const channelPref = new Map<string, string>();
  const serverPref = new Map<string, string>();
  for (const r of prefRows ?? []) {
    if (r.chat_key === chatKey) channelPref.set(r.user_id as string, r.level as string);
    else serverPref.set(r.user_id as string, r.level as string);
  }
  recipientIds = recipientIds.filter((id) => {
    const level = channelPref.get(id) ?? serverPref.get(id) ?? "all";
    if (level === "mute") return false;
    if (level === "mentions") return mentioned.has(id);
    return true;
  });
  if (recipientIds.length === 0) return NextResponse.json({ sent: 0, skipped: "prefs" });

  // Throttle non-mention pushes per user+channel.
  const { data: recent } = await db
    .from("push_chat_log")
    .select("user_id, sent_at")
    .eq("chat_key", chatKey)
    .in("user_id", recipientIds);
  const lastSent = new Map((recent ?? []).map((r) => [r.user_id as string, new Date(r.sent_at as string).getTime()]));
  const now = Date.now();
  const targets = recipientIds.filter((id) =>
    mentioned.has(id) || (lastSent.get(id) ?? 0) < now - THROTTLE_MS
  );
  if (targets.length === 0) return NextResponse.json({ sent: 0, skipped: "throttled" });

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", targets);
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  // Resolve mention tokens to display names for the push preview.
  const nameOf = new Map<string, string>();
  if (mentioned.size > 0) {
    const { data: profs } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", [...mentioned]);
    for (const pr of profs ?? []) nameOf.set(pr.id as string, (pr.display_name as string) || "user");
  }
  const preview = ((msg.content as string) ?? "")
    .replace(MENTION_TOKEN, (_, id: string) => `@${nameOf.get(id) ?? "user"}`)
    .replace(/<box:[^>]+>/g, "▦")
    .slice(0, 120) || "sent a message";

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (sub) => {
    const isMention = mentioned.has(sub.user_id as string);
    const res = await sendPush(
      { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string },
      {
        title: isMention
          ? `${msg.author_name} mentioned you in ${channelLabel}`
          : `${msg.author_name} · ${channelLabel}`,
        body: preview,
        tag: chatKey, // coalesce per channel — a burst shows one notification
        url: "/",
      }
    );
    if (res.ok) sent++;
    else if (res.gone) dead.push(sub.id as string);
  }));

  if (dead.length > 0) await db.from("push_subscriptions").delete().in("id", dead);
  await db.from("push_chat_log").upsert(
    targets.map((user_id) => ({ user_id, chat_key: chatKey, sent_at: new Date().toISOString() })),
    { onConflict: "user_id,chat_key" }
  );

  return NextResponse.json({ sent });
}
