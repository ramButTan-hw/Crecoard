import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase";
import { mutateBoardItem } from "@/lib/botBoardWrite";
import { rateLimit } from "@/lib/apiAuth";

// POST /api/server-board/kanban — let a signed-in server MEMBER edit a kanban's
// cards, gated by the item's Interact permission (item.perms.interact) resolved
// against the member's server role(s). The client sends the full updated cards
// array; we replace just that item's cards via the service role (so other board
// items are never clobbered). Owners/admins don't use this — they edit directly.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
function admin() { return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }); }
function configured() { return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && Boolean(SERVICE_KEY); }

interface Card {
  id: string; columnId: string; text: string; order: number;
  description?: string; color?: string; due?: string; assigneeId?: string;
}

/** Sanitize the client-provided cards — never trust the array shape. */
function sanitizeCards(raw: unknown, columnIds: Set<string>): Card[] {
  if (!Array.isArray(raw)) return [];
  const out: Card[] = [];
  for (const c of raw.slice(0, 500)) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    const columnId = typeof o.columnId === "string" ? o.columnId : "";
    if (!id) continue;
    if (columnIds.size > 0 && !columnIds.has(columnId)) continue; // can't validate when columns are defaulted
    out.push({
      id,
      columnId,
      text: typeof o.text === "string" ? o.text.slice(0, 500) : "",
      order: typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 0,
      description: typeof o.description === "string" ? o.description.slice(0, 2000) : undefined,
      color: typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : undefined,
      due: typeof o.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.due) ? o.due : undefined,
      assigneeId: typeof o.assigneeId === "string" ? o.assigneeId.slice(0, 64) : undefined,
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!configured()) return NextResponse.json({ error: "Server not configured." }, { status: 501 });

  const supabase = createServerSupabaseClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const limited = rateLimit(`kanban-edit:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const boardId = String(body.boardId ?? "");
  const serverId = String(body.serverId ?? "");
  const itemId = String(body.itemId ?? "");
  if (!boardId || !serverId || !itemId) {
    return NextResponse.json({ error: "boardId, serverId, and itemId are required." }, { status: 400 });
  }

  const db = admin();

  // The caller must be a member of the server that owns this board.
  const { data: membership } = await db
    .from("server_members")
    .select("user_id, role, role_ids")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You're not a member of this server." }, { status: 403 });

  const viewerRole = (membership.role as string | null) ?? "member";
  const viewerRoleIds = (membership.role_ids as string[] | null) ?? [];

  const outcome = await mutateBoardItem(db, {
    boardId,
    serverId,
    itemId,
    expectType: "kanban",
    mutate: (item) => {
      // Authorize by the item's Interact permission (mirrors roleAllowed on the
      // client): owner/admin always; undefined → everyone; [] → owner-only;
      // otherwise the member must hold one of the listed server roles.
      const interact = (item.perms as { interact?: string[] } | undefined)?.interact;
      const allowed =
        viewerRole === "owner" || viewerRole === "admin" ||
        interact === undefined ||
        (interact.length > 0 && interact.some((id) => viewerRoleIds.includes(id)));
      if (!allowed) {
        return { ok: false, error: "You don't have permission to edit these cards." };
      }
      const columnIds = new Set(((item.kanbanColumns as { id: string }[] | undefined) ?? []).map((c) => c.id));
      const cards = sanitizeCards(body.cards, columnIds);
      item.kanbanCards = cards;
      return { ok: true, result: { count: cards.length } };
    },
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...(outcome.result as object) });
}
