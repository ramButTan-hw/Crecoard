"use client";

import {
  createContext, useCallback, useContext, useEffect, useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { getSelfIdentity, updateSelfIdentity, type SelfIdentity } from "@/lib/collaboration";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

type ProfileRow = Record<string, unknown>;

function rowToIdentity(row: ProfileRow, base: SelfIdentity): SelfIdentity {
  return {
    ...base,
    userId: (row.id as string) || base.userId,
    displayName: (row.display_name as string) || base.displayName,
    username: (row.username as string | undefined) ?? base.username,
    avatarUrl: (row.avatar_url as string | undefined) ?? base.avatarUrl,
    bannerUrl: (row.banner_url as string | undefined) ?? base.bannerUrl,
    color: (row.color as string) || base.color,
    pronouns: (row.pronouns as string | undefined) ?? base.pronouns,
    status: (row.status as string | undefined) ?? base.status,
    statusEmoji: (row.status_emoji as string | undefined) ?? base.statusEmoji,
    favoriteBoardId: (row.favorite_board_id as string | undefined) ?? base.favoriteBoardId,
    profileBoard: (row.profile_board as SelfIdentity["profileBoard"]) ?? base.profileBoard,
  };
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface UserContextValue {
  identity: SelfIdentity;
  /** True until the Supabase fetch resolves; immediately false for guests */
  loading: boolean;
  /** True only after Supabase confirmed a logged-in user (never true for guests) */
  isLoggedIn: boolean;
  /** Persists profile changes: Supabase when available, always localStorage */
  updateProfile: (patch: Partial<Omit<SelfIdentity, "userId">>) => Promise<void>;
  /** Set the unique username (handle). Returns an error key on failure. */
  setUsername: (username: string) => Promise<{ ok: boolean; error?: string }>;
  /** Signs out of Supabase and redirects to /login */
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be inside <UserProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<SelfIdentity>(() => getSelfIdentity());
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseReady()) { setLoading(false); return; }

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }

      setSupabaseUserId(user.id);
      setIsLoggedIn(true);

      // Fetch existing profile row
      let { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // First sign-in: seed profile from OAuth metadata + local identity
      if (!profile) {
        const local = getSelfIdentity();
        const { data: created } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            display_name:
              user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              local.displayName,
            avatar_url:
              user.user_metadata?.avatar_url ??
              user.user_metadata?.picture ??
              null,
            color: local.color,
          })
          .select()
          .single();
        profile = created;
      }

      if (profile && !cancelled) {
        // Use a clean base — never let localStorage guest values bleed into an account.
        const cleanBase: SelfIdentity = {
          userId: user.id,
          displayName: "Anonymous",
          color: "#d59ee8",
        };
        const merged = rowToIdentity(profile, cleanBase);
        // Keep localStorage in sync so collaboration cursor functions still work
        updateSelfIdentity(merged);
        setIdentity(merged);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const updateProfile = useCallback(async (
    patch: Partial<Omit<SelfIdentity, "userId">>,
  ): Promise<void> => {
    // Update state + localStorage immediately for instant UI response
    setIdentity((prev) => {
      const next = { ...prev, ...patch };
      updateSelfIdentity(next);
      return next;
    });

    if (!isSupabaseReady() || !supabaseUserId) return;

    // Map to DB column names — only include keys present in patch
    const row: Record<string, unknown> = {
      id: supabaseUserId,
      updated_at: new Date().toISOString(),
    };
    if ("displayName" in patch)      row.display_name       = patch.displayName;
    if ("avatarUrl" in patch)        row.avatar_url         = patch.avatarUrl ?? null;
    if ("bannerUrl" in patch)        row.banner_url         = patch.bannerUrl ?? null;
    if ("color" in patch)            row.color              = patch.color;
    if ("pronouns" in patch)         row.pronouns           = patch.pronouns ?? null;
    if ("status" in patch)           row.status             = patch.status ?? null;
    if ("statusEmoji" in patch)      row.status_emoji       = patch.statusEmoji ?? null;
    if ("favoriteBoardId" in patch)  row.favorite_board_id  = patch.favoriteBoardId ?? null;
    if ("profileBoard" in patch)     row.profile_board      = patch.profileBoard ?? null;

    await supabase.from("profiles").upsert(row, { onConflict: "id" });
  }, [supabaseUserId]);

  const setUsername = useCallback(async (username: string): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { ok: false, error: "offline" };
    const { data, error } = await supabase.rpc("set_username", { p_username: username });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("taken")) return { ok: false, error: "taken" };
      if (msg.includes("invalid")) return { ok: false, error: "invalid" };
      return { ok: false, error: "failed" };
    }
    const clean = (data as string) ?? username;
    setIdentity((prev) => ({ ...prev, username: clean }));
    updateSelfIdentity({ username: clean }); // keep the local identity in sync
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseReady()) await supabase.auth.signOut();
    // Clear the last-user cache so the next user gets a clean theme slate
    if (typeof window !== "undefined") localStorage.removeItem("plancraft-last-user-id");
    window.location.href = "/login";
  }, []);

  return (
    <UserContext.Provider value={{ identity, loading, isLoggedIn, updateProfile, setUsername, signOut }}>
      {children}
    </UserContext.Provider>
  );
}
