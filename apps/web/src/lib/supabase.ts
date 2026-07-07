import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Singleton browser client — re-used across client components and collaboration.ts.
// Returns a no-op client when env vars are not configured (local-only dev).
export const supabase = createBrowserClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
);

// Duck-typed interface for the Next.js cookie store returned by `cookies()` from "next/headers"
interface NextCookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): void;
}

// Server client factory — pass the Next.js cookie store from `cookies()` in route handlers / server components
export function createServerSupabaseClient(cookieStore: NextCookieStore) {
  return createServerClient(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies cannot be set; only Route Handlers can set them
          }
        },
      },
    }
  );
}
