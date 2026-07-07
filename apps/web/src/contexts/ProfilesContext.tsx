"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface CachedProfile {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  color?: string;
}

interface ProfilesContextValue {
  /** Current profile for a user id, if loaded. */
  get: (id: string) => CachedProfile | undefined;
  /** Request profiles for these ids (batched). Safe to call every render. */
  ensure: (ids: string[]) => void;
}

const ProfilesContext = createContext<ProfilesContextValue>({
  get: () => undefined,
  ensure: () => {},
});

export function useProfiles(): ProfilesContextValue {
  return useContext(ProfilesContext);
}

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

/**
 * Caches users' *current* display name + avatar by id, so chat (and anywhere
 * else) shows live profile info instead of the name/avatar that was snapshotted
 * onto each message when it was sent.
 */
export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Record<string, CachedProfile>>({});
  const requested = useRef<Set<string>>(new Set());
  const queue = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const ids = [...queue.current];
    queue.current.clear();
    if (!ids.length || !isSupabaseReady()) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, color")
      .in("id", ids);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data) {
          next[p.id as string] = {
            id: p.id as string,
            displayName: (p.display_name as string) || "Unknown",
            username: (p.username as string | null) ?? undefined,
            avatarUrl: (p.avatar_url as string | null) ?? undefined,
            color: (p.color as string | null) ?? undefined,
          };
        }
        return next;
      });
    }
  }, []);

  const ensure = useCallback((ids: string[]) => {
    let added = false;
    for (const id of ids) {
      if (!id || requested.current.has(id)) continue;
      requested.current.add(id);
      queue.current.add(id);
      added = true;
    }
    if (added) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 60);
    }
  }, [flush]);

  const get = useCallback((id: string) => profiles[id], [profiles]);

  return (
    <ProfilesContext.Provider value={{ get, ensure }}>
      {children}
    </ProfilesContext.Provider>
  );
}
