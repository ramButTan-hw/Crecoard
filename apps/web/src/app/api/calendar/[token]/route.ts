import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/apiAuth";
import { buildIcs } from "@/lib/ics";
import type { BlockItem, CalendarEvent } from "@/store/boardStore";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}
function isConfigured() {
  return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && Boolean(SUPABASE_SERVICE_KEY);
}

/** Find a calendar item anywhere in a board's JSONB (boxes or canvas-level items). */
function findCalendarItem(data: unknown, itemId: string): BlockItem | null {
  const board = data as { boxes?: { items?: BlockItem[] }[]; boardItems?: BlockItem[] } | null;
  if (!board) return null;
  for (const box of board.boxes ?? []) {
    const hit = (box.items ?? []).find((i) => i.id === itemId && i.type === "calendar");
    if (hit) return hit;
  }
  const canvas = (board.boardItems ?? []).find((i) => i.id === itemId && i.type === "calendar");
  return canvas ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.replace(/\.ics$/i, ""); // tolerate a trailing .ics some clients append

  // Public endpoint (calendar apps can't authenticate) — throttle by IP to blunt
  // token brute-forcing.
  const limited = rateLimit(`cal-sub:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  if (!isConfigured()) {
    return NextResponse.json({ error: "Calendar subscriptions require Supabase to be configured." }, { status: 501 });
  }
  if (!/^[a-z0-9]{8,64}$/i.test(token)) {
    return NextResponse.json({ error: "Invalid subscription token." }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: sub, error: subErr } = await db
    .from("calendar_subscriptions")
    .select("board_id, item_id")
    .eq("token", token)
    .single();
  if (subErr || !sub) {
    return NextResponse.json({ error: "Unknown subscription token." }, { status: 404 });
  }

  const { data: boardRow, error: boardErr } = await db
    .from("boards")
    .select("data")
    .eq("id", sub.board_id)
    .single();
  if (boardErr || !boardRow) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  const item = findCalendarItem(boardRow.data, sub.item_id);
  if (!item) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  const events: CalendarEvent[] = item.calendarEvents ?? [];
  const name = (boardRow.data as { name?: string } | null)?.name || "Crecoard Calendar";
  const ics = buildIcs(events, name);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      // Let calendar clients and CDNs cache briefly; feeds are polled infrequently.
      "Cache-Control": "public, max-age=300",
    },
  });
}
