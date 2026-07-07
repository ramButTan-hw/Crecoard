import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

// ─── Supabase readiness ───────────────────────────────────────────────────────
// Mirrors the check in middleware.ts. When Supabase is NOT configured (local-only
// dev) we skip auth so the app remains usable; in production it is always
// configured, so the auth gate is always enforced.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseConfigured(): boolean {
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("placeholder") &&
    !SUPABASE_URL.includes("your-project") &&
    SUPABASE_ANON_KEY !== "your-anon-key"
  );
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
// `userId` is the authenticated user's id, or null when Supabase is unconfigured
// (local dev). Routes should use `userId ?? getClientIp(req)` as the rate-limit key.
//
// NOTE: a real Supabase session is required — the "guest" cookie used for the UI
// is client-settable and therefore not a security boundary, so it does NOT grant
// access to these key-spending / proxy endpoints.
export type AuthOk = { ok: true; userId: string | null };
export type AuthFail = { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<AuthOk | AuthFail> {
  // Local-only dev: Supabase not configured → allow through (no user context).
  if (!supabaseConfigured()) return { ok: true, userId: null };

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  return { ok: true, userId: user.id };
}

// ─── Client IP ────────────────────────────────────────────────────────────────
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Simple fixed-window, in-memory limiter. This is per-instance only: on a
// multi-instance / serverless deployment each instance keeps its own counters,
// so the effective limit is (limit × instances). It is a baseline guard against
// abuse and quota theft — swap in a shared store (Upstash/Redis) for a hard cap.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the Map cannot grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type RateLimitResult = { ok: true } | { ok: false; response: NextResponse };

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Slow down and try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      ),
    };
  }

  existing.count += 1;
  return { ok: true };
}
