import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that never require authentication
// (/wallpaper renders only this machine's locally-cached boards — nothing remote)
const PUBLIC_PREFIXES = ["/login", "/auth", "/api", "/invite", "/wallpaper", "/download", "/capture", "/privacy", "/terms"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let public routes through
  if (isPublic(pathname)) {
    return NextResponse.next({ request });
  }

  // Local-only dev: Supabase not configured → skip all auth checks
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabaseReady =
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("placeholder") &&
    !supabaseUrl.includes("your-project") &&
    supabaseKey !== "your-anon-key";
  if (!supabaseReady) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(
            name,
            value,
            options as Parameters<typeof supabaseResponse.cookies.set>[2]
          )
        );
      },
    },
  });

  // Refresh session — must be called before any logic that reads the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guest mode: user explicitly clicked "Continue without account"
  const isGuest = request.cookies.get("plancraft-guest")?.value === "true";

  if (!user && !isGuest) {
    // Unauthenticated and no guest flag → send to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all page routes; skip Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
