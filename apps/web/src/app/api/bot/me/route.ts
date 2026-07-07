import { NextResponse, type NextRequest } from "next/server";
import { requireBot } from "@/lib/botAuth";

/** GET /api/bot/me — identity + granted scopes (no permission required). */
export async function GET(req: NextRequest) {
  const auth = await requireBot(req);
  if (!auth.ok) return auth.response;
  const { bot } = auth;
  return NextResponse.json({
    id: bot.id,
    serverId: bot.serverId,
    name: bot.name,
    avatar: bot.avatar,
    permissions: bot.permissions,
  });
}
