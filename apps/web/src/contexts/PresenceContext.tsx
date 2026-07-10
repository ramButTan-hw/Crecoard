"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";
import { readUserPrefs } from "@/lib/userPrefs";
import type { PresenceStatus } from "@/types/server";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

const STORAGE_KEY = "crecoard-presence-status";

function savedStatus(): PresenceStatus {
  if (typeof window === "undefined") return "online";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dnd" || v === "offline" ? v : "online";
}

interface PresenceContextValue {
  /** userId → status for everyone currently present (online or dnd). Absent = offline. */
  online: Record<string, PresenceStatus>;
  /** The current user's chosen status. */
  myStatus: PresenceStatus;
  setMyStatus: (s: PresenceStatus) => void;
}

const PresenceContext = createContext<PresenceContextValue>({
  online: {},
  myStatus: "online",
  setMyStatus: () => {},
});

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}

/**
 * Global Realtime presence. Each signed-in client tracks its status on one shared
 * channel keyed by user id; everyone derives who's online from the presence state.
 * Choosing "offline" untracks (you still see others, but appear offline to them).
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { identity, isLoggedIn } = useUser();
  const userId = identity.userId;

  const [online, setOnline] = useState<Record<string, PresenceStatus>>({});
  const [myStatus, setMyStatusState] = useState<PresenceStatus>(savedStatus);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isLoggedIn || !userId || !isSupabaseReady()) return;

    const channel = supabase.channel("presence:online", {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ status: PresenceStatus }>();
      const map: Record<string, PresenceStatus> = {};
      for (const [uid, metas] of Object.entries(state)) {
        const meta = metas[metas.length - 1];
        if (meta?.status && meta.status !== "offline") map[uid] = meta.status;
      }
      setOnline(map);
    });

    // Effective broadcast status: the privacy master switch (Settings → Privacy →
    // "Show online status") forces you invisible regardless of your chosen status.
    const applyTracking = () => {
      const cur = savedStatus();
      if (cur === "offline" || !readUserPrefs().showOnlineStatus) void channel.untrack();
      else void channel.track({ status: cur });
    };

    void channel.subscribe((status) => { if (status === "SUBSCRIBED") applyTracking(); });

    // React to the privacy toggle changing (same tab + across tabs)
    const onPrefs = () => applyTracking();
    window.addEventListener("crecoard:prefs-changed", onPrefs);
    window.addEventListener("storage", onPrefs);

    return () => {
      channelRef.current = null;
      window.removeEventListener("crecoard:prefs-changed", onPrefs);
      window.removeEventListener("storage", onPrefs);
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn, userId]);

  const setMyStatus = useCallback((s: PresenceStatus) => {
    setMyStatusState(s);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, s);
    const ch = channelRef.current;
    if (!ch) return;
    if (s === "offline" || !readUserPrefs().showOnlineStatus) void ch.untrack();
    else void ch.track({ status: s });
  }, []);

  return (
    <PresenceContext.Provider value={{ online, myStatus, setMyStatus }}>
      {children}
    </PresenceContext.Provider>
  );
}
