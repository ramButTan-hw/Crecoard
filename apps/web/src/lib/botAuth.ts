/**
 * Bot authentication for /api/bot/* routes — server-side only (Node crypto).
 *
 * Bots authenticate with `Authorization: Bot crecoard_bot_...`. Only the
 * SHA-256 hash of the token is stored; lookup is by hash. Every request is
 * rate limited per bot and checked against the bot's granted scopes
 * (see lib/botPermissions.ts).
 */

import { createHash, randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/apiAuth";
import { BOT_TOKEN_PREFIX, type BotPermission } from "@/lib/botPermissions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function botApiConfigured(): boolean {
  return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && Boolean(SERVICE_KEY);
}

export function botDb(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export function generateBotToken(): string {
  return BOT_TOKEN_PREFIX + randomBytes(24).toString("hex");
}

export function hashBotToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface BotIdentity {
  id: string;
  serverId: string;
  name: string;
  avatar: string | null;
  permissions: string[];
}

export type BotAuthResult = { ok: true; bot: BotIdentity; db: SupabaseClient } | { ok: false; response: NextResponse };

function fail(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

export async function requireBot(req: NextRequest, permission?: BotPermission): Promise<BotAuthResult> {
  if (!botApiConfigured()) return fail(501, "Bot API requires Supabase (service role) to be configured.");

  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bot\s+(\S+)$/i);
  if (!match || !match[1].startsWith(BOT_TOKEN_PREFIX)) {
    return fail(401, "Missing or malformed Authorization header — expected: Authorization: Bot <token>");
  }
  const tokenHash = hashBotToken(match[1]);

  const limited = rateLimit(`bot:${tokenHash}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return { ok: false, response: limited.response };

  const db = botDb();
  const { data, error } = await db
    .from("server_bots")
    .select("id, server_id, name, avatar, permissions")
    .eq("token_hash", tokenHash)
    .single();
  if (error || !data) return fail(401, "Unknown bot token.");

  const bot: BotIdentity = {
    id: data.id as string,
    serverId: data.server_id as string,
    name: data.name as string,
    avatar: (data.avatar as string | null) ?? null,
    permissions: (data.permissions as string[]) ?? [],
  };

  if (permission && !bot.permissions.includes(permission)) {
    return fail(403, `Bot lacks the "${permission}" permission — a server owner can grant it in Server Settings → Bots.`);
  }

  // Fire-and-forget usage timestamp
  void db.from("server_bots").update({ last_used_at: new Date().toISOString() }).eq("id", bot.id).then(() => {});

  return { ok: true, bot, db };
}

/** True when the board belongs to the bot's server — every board-scoped route must check this. */
export async function boardBelongsToServer(db: SupabaseClient, boardId: string, serverId: string): Promise<boolean> {
  const { data } = await db.from("boards").select("id").eq("id", boardId).eq("server_id", serverId).maybeSingle();
  return !!data;
}
