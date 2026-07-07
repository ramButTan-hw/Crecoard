import { supabase } from "@/lib/supabase";
import type { AuditAction, AuditLogEntry } from "@/types/server";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Prevents high-frequency actions from spamming the log within one session.
// Only one entry per action+user+server is written per RATE_WINDOW_MS.
const RATE_WINDOW_MS = 90_000; // 90 seconds
const HIGH_FREQ: Partial<Record<AuditAction, boolean>> = { board_item_added: true };
const recentLog = new Map<string, number>(); // "serverId:userId:action" → timestamp

// ─── Write ────────────────────────────────────────────────────────────────────

export async function logServerAction(
  serverId: string,
  userId: string,
  username: string,
  action: AuditAction,
  details?: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseReady() || !serverId || !userId) return;

  if (HIGH_FREQ[action]) {
    const key = `${serverId}:${userId}:${action}`;
    const last = recentLog.get(key) ?? 0;
    if (Date.now() - last < RATE_WINDOW_MS) return;
    recentLog.set(key, Date.now());
  }

  const { error } = await supabase.from("server_audit_logs").insert({
    server_id: serverId,
    user_id: userId,
    username,
    action,
    details: details ?? null,
  });
  if (error) console.error("[AuditLog] insert failed:", error.message);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchServerAuditLog(
  serverId: string,
  limit = 100
): Promise<{ entries: AuditLogEntry[]; error: string | null }> {
  if (!isSupabaseReady()) return { entries: [], error: null };

  const { data, error } = await supabase
    .from("server_audit_logs")
    .select("id, user_id, username, action, details, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const isMissing =
      error.message.includes("does not exist") || error.code === "42P01";
    return {
      entries: [],
      error: isMissing ? "migration_missing" : error.message,
    };
  }

  return {
    entries: (data ?? []).map((row) => ({
      id: row.id as string,
      userId: row.user_id as string | null,
      username: row.username as string,
      action: row.action as AuditAction,
      details: row.details as Record<string, unknown> | null,
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}

// ─── Publish history ─────────────────────────────────────────────────────────

export interface PublishEntry {
  id: string;
  publisherName: string;
  message: string | null;
  publishedAt: string;
}

export async function fetchServerPublishes(
  serverId: string,
  limit = 50,
): Promise<{ entries: PublishEntry[]; error: string | null }> {
  if (!isSupabaseReady()) return { entries: [], error: null };

  const { data, error } = await supabase
    .from("server_publishes")
    .select("id, publisher_name, message, published_at")
    .eq("server_id", serverId)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    const isMissing =
      error.message.includes("does not exist") ||
      error.message.includes("schema cache") ||
      error.code === "42P01";
    return { entries: [], error: isMissing ? "migration_missing" : error.message };
  }

  return {
    entries: (data ?? []).map((row) => ({
      id: row.id as string,
      publisherName: row.publisher_name as string,
      message: row.message as string | null,
      publishedAt: row.published_at as string,
    })),
    error: null,
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function describeAction(
  action: AuditAction,
  details: Record<string, unknown> | null
): string {
  switch (action) {
    case "box_moved":
      return "moved a block";
    case "board_item_added":
      return `added a ${details?.itemType ?? "block"} to the board`;
    case "server_updated":
      return "updated server settings";
    case "member_kicked":
      return `removed ${(details?.kickedUsername as string) ?? "a member"}`;
    case "member_role_changed":
      return `changed ${(details?.targetUsername as string) ?? "a member"}'s role to ${details?.newRole ?? "unknown"}`;
    case "theme_preset_applied":
      return `applied the ${(details?.presetName as string) ?? "a"} theme preset`;
    default:
      return action;
  }
}

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(isoString).toLocaleDateString();
}
