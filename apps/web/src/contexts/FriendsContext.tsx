"use client";

import {
  createContext, useCallback, useContext, useEffect, useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { canFriendRequest } from "@/lib/privacy";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FriendProfile {
  friendshipId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  avatarChar: string;
  color: string;
}

export interface PendingRequest {
  friendshipId: string;
  userId: string;
  displayName: string;
  avatarChar: string;
  color: string;
  direction: "received" | "sent";
}

export type SendResult =
  | "ok"
  | "already_friends"
  | "already_pending"
  | "self"
  | "blocked"
  | "error";

// ─── Context ──────────────────────────────────────────────────────────────────

interface FriendsContextValue {
  friends: FriendProfile[];
  pendingReceived: PendingRequest[];
  pendingSent: PendingRequest[];
  /** Search profiles by display name (case-insensitive, partial). */
  findUserByName: (q: string) => Promise<{ id: string; displayName: string } | null>;
  /** Send a friend request to a known userId. */
  sendFriendRequestById: (targetUserId: string) => Promise<SendResult>;
  /** Accept an incoming request. */
  acceptRequest: (friendshipId: string) => Promise<void>;
  /** Decline an incoming request or unfriend (works for both). */
  declineOrRemove: (friendshipId: string) => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue>({
  friends: [],
  pendingReceived: [],
  pendingSent: [],
  findUserByName: async () => null,
  sendFriendRequestById: async () => "error",
  acceptRequest: async () => {},
  declineOrRemove: async () => {},
});

export function useFriends(): FriendsContextValue {
  return useContext(FriendsContext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function initials(name: string): string {
  return (name.split(" ").map((p) => p[0]).join("").toUpperCase() || "?").slice(0, 2);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [pendingReceived, setPendingReceived] = useState<PendingRequest[]>([]);
  const [pendingSent, setPendingSent] = useState<PendingRequest[]>([]);

  // Load on mount
  useEffect(() => {
    if (!isSupabaseReady()) return;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const userId = user.id;

      const { data: rows } = await supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (!rows?.length || cancelled) return;

      // Collect all friend userIds for profile batch fetch
      const friendIds = [
        ...new Set(
          rows
            .flatMap((r) => [r.requester_id as string, r.addressee_id as string])
            .filter((id) => id !== userId)
        ),
      ];

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, color")
        .in("id", friendIds);

      const profileMap: Record<string, Row> = {};
      for (const p of profileRows ?? []) profileMap[p.id as string] = p;

      const newFriends: FriendProfile[] = [];
      const newReceived: PendingRequest[] = [];
      const newSent: PendingRequest[] = [];

      for (const row of rows) {
        const otherId =
          row.requester_id === userId
            ? (row.addressee_id as string)
            : (row.requester_id as string);
        const p = profileMap[otherId] ?? {};
        const displayName = (p.display_name as string) || "Unknown";
        const avatarChar = initials(displayName);
        const color = (p.color as string) || "#d59ee8";

        const base = {
          friendshipId: row.id as string,
          userId: otherId,
          displayName,
          avatarChar,
          color,
          avatarUrl: (p.avatar_url as string) || undefined,
        };

        if (row.status === "accepted") {
          newFriends.push(base);
        } else if (row.addressee_id === userId) {
          newReceived.push({ ...base, direction: "received" });
        } else {
          newSent.push({ ...base, direction: "sent" });
        }
      }

      if (!cancelled) {
        setFriends(newFriends);
        setPendingReceived(newReceived);
        setPendingSent(newSent);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const findUserByName = useCallback(async (
    q: string
  ): Promise<{ id: string; displayName: string } | null> => {
    if (!isSupabaseReady() || !q.trim()) return null;
    const query = q.trim().replace(/^@/, "");
    if (!query) return null;
    const { data: { user } } = await supabase.auth.getUser();

    // Exact @handle match first (unique), then fall back to a fuzzy display-name match.
    let { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("username", query)
      .neq("id", user?.id ?? "")
      .limit(1)
      .maybeSingle();
    if (!data) {
      ({ data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .ilike("display_name", `%${query}%`)
        .neq("id", user?.id ?? "")
        .limit(1)
        .maybeSingle());
    }
    if (!data) return null;
    return { id: data.id as string, displayName: data.display_name as string };
  }, []);

  const sendFriendRequestById = useCallback(async (
    targetUserId: string
  ): Promise<SendResult> => {
    if (!isSupabaseReady()) return "error";
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "error";
    if (targetUserId === user.id) return "self";

    // Check if friendship already exists
    const existing =
      friends.find((f) => f.userId === targetUserId) ??
      pendingReceived.find((p) => p.userId === targetUserId) ??
      pendingSent.find((p) => p.userId === targetUserId);

    if (existing) {
      const f = friends.find((f) => f.userId === targetUserId);
      if (f) return "already_friends";
      return "already_pending";
    }

    // Respect the target's "allow friend requests" setting (RLS also enforces this)
    if (!(await canFriendRequest(targetUserId))) return "blocked";

    const { data, error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: targetUserId })
      .select()
      .single();

    if (error || !data) {
      // RLS rejects the insert when the addressee disallows requests
      if (error?.code === "42501") return "blocked";
      return "error";
    }

    // Fetch the target's profile for optimistic state
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, color")
      .eq("id", targetUserId)
      .maybeSingle();

    const displayName = (p?.display_name as string) || "Unknown";
    const newPending: PendingRequest = {
      friendshipId: data.id as string,
      userId: targetUserId,
      displayName,
      avatarChar: initials(displayName),
      color: (p?.color as string) || "#d59ee8",
      direction: "sent",
    };
    setPendingSent((prev) => [...prev, newPending]);
    return "ok";
  }, [friends, pendingReceived, pendingSent]);

  const acceptRequest = useCallback(async (friendshipId: string) => {
    if (!isSupabaseReady()) return;
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
    if (error) return;

    const req = pendingReceived.find((p) => p.friendshipId === friendshipId);
    if (!req) return;
    setPendingReceived((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
    setFriends((prev) => [
      ...prev,
      {
        friendshipId: req.friendshipId,
        userId: req.userId,
        displayName: req.displayName,
        avatarChar: req.avatarChar,
        color: req.color,
      },
    ]);
  }, [pendingReceived]);

  const declineOrRemove = useCallback(async (friendshipId: string) => {
    if (!isSupabaseReady()) return;
    await supabase.from("friendships").delete().eq("id", friendshipId);
    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setPendingReceived((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
    setPendingSent((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
  }, []);

  return (
    <FriendsContext.Provider value={{
      friends, pendingReceived, pendingSent,
      findUserByName, sendFriendRequestById, acceptRequest, declineOrRemove,
    }}>
      {children}
    </FriendsContext.Provider>
  );
}
