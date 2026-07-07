import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, rateLimit } from "@/lib/apiAuth";
import { botApiConfigured, botDb, generateBotToken, hashBotToken } from "@/lib/botAuth";
import { BOT_PERMISSIONS } from "@/lib/botPermissions";

/**
 * POST /api/bots — register a bot on a server (owner/admin only).
 * The plaintext token is returned exactly once; only its hash is stored.
 */
export async function POST(req: NextRequest) {
  if (!botApiConfigured()) {
    return NextResponse.json({ error: "Bot API requires Supabase (service role) to be configured." }, { status: 501 });
  }
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!auth.userId) {
    return NextResponse.json({ error: "Sign in to create bots." }, { status: 401 });
  }

  const limited = rateLimit(`bots-create:${auth.userId}`, { limit: 10, windowMs: 3_600_000 });
  if (!limited.ok) return limited.response;

  let body: { serverId?: string; name?: string; avatar?: string; permissions?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const serverId = body.serverId ?? "";
  if (!serverId || !name || name.length > 40) {
    return NextResponse.json({ error: "serverId and a name (1–40 chars) are required." }, { status: 400 });
  }
  const validPerms = new Set(BOT_PERMISSIONS.map((p) => p.id as string));
  const permissions = (body.permissions ?? []).filter((p) => validPerms.has(p));

  const db = botDb();

  // Caller must be owner or admin of the target server
  const { data: membership } = await db
    .from("server_members")
    .select("role")
    .eq("server_id", serverId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role as string)) {
    return NextResponse.json({ error: "Only server owners and admins can create bots." }, { status: 403 });
  }

  const token = generateBotToken();
  const { data, error } = await db
    .from("server_bots")
    .insert({
      server_id: serverId,
      name,
      avatar: body.avatar?.slice(0, 300) ?? "🤖",
      token_hash: hashBotToken(token),
      permissions,
      created_by: auth.userId,
    })
    .select("id, name, avatar, permissions, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bot: data, token }); // token: shown once, never retrievable again
}
