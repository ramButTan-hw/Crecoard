import { NextResponse, type NextRequest } from "next/server";
import { requireBot } from "@/lib/botAuth";

/** GET /api/bot/members — the bot's server member list (members:read). */
export async function GET(req: NextRequest) {
  const auth = await requireBot(req, "members:read");
  if (!auth.ok) return auth.response;
  const { bot, db } = auth;

  const { data: members, error } = await db
    .from("server_members")
    .select("user_id, role")
    .eq("server_id", bot.serverId)
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (members ?? []).map((m) => m.user_id as string);
  const profileById = new Map<string, { display_name?: string; username?: string; avatar_url?: string }>();
  if (ids.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", ids);
    for (const p of profiles ?? []) profileById.set(p.id as string, p);
  }

  return NextResponse.json({
    members: (members ?? []).map((m) => {
      const p = profileById.get(m.user_id as string);
      return {
        userId: m.user_id,
        role: m.role,
        displayName: p?.display_name ?? "Unknown",
        username: p?.username ?? null,
        avatarUrl: p?.avatar_url ?? null,
      };
    }),
  });
}
