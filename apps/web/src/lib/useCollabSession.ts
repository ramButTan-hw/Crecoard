"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  type BoardOp,
  type CollabPresence,
  type CursorState,
  type SelfIdentity,
  getSelfIdentity,
  updateSelfIdentity,
  joinRoom,
  leaveRoom,
  subscribeToPresence,
  broadcastCursor,
  subscribeToCursors,
  broadcastBoardOp,
  subscribeToBoardOps,
} from "./collaboration";
import { applyBoardOp } from "./boardOps";

// ─── Context type ─────────────────────────────────────────────────────────────

export interface CollabSession {
  members: CollabPresence[];
  cursors: CursorState[];
  self: SelfIdentity;
  isConnected: boolean;
  onCursorMove: (x: number, y: number) => void;
  updateDisplayName: (name: string) => void;
  broadcastOp: (op: Omit<BoardOp, "senderId">) => void;
}

const FALLBACK: CollabSession = {
  members: [],
  cursors: [],
  self: { userId: "local", displayName: "You", color: "#d59ee8" },
  isConnected: false,
  onCursorMove: () => {},
  updateDisplayName: () => {},
  broadcastOp: () => {},
};

export const CollabContext = createContext<CollabSession>(FALLBACK);

export function useCollab(): CollabSession {
  return useContext(CollabContext);
}

// ─── Setup hook (call once in AppShell) ───────────────────────────────────────

export function useCollabSessionSetup(boardId: string, enabled: boolean): CollabSession {
  const [members, setMembers] = useState<CollabPresence[]>([]);
  const [cursors, setCursors] = useState<CursorState[]>([]);
  const [self, setSelf] = useState<SelfIdentity>(FALLBACK.self);
  const [isConnected, setIsConnected] = useState(false);
  // Store the RealtimeChannel object — not the name string — to avoid duplicate subscriptions.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelf(getSelfIdentity());
  }, []);

  useEffect(() => {
    if (!enabled || !boardId) {
      setMembers([]);
      setCursors([]);
      setIsConnected(false);
      return;
    }

    let mounted = true;
    let unsubPresence: (() => void) | null = null;
    let unsubCursors: (() => void) | null = null;
    let unsubBoardOps: (() => void) | null = null;

    joinRoom(boardId).then(({ channel }) => {
      if (!mounted) { void leaveRoom(channel); return; }
      channelRef.current = channel;
      setIsConnected(true);
      unsubPresence = subscribeToPresence(channel, setMembers);
      unsubCursors = subscribeToCursors(channel, setCursors);
      unsubBoardOps = subscribeToBoardOps(channel, (op) => {
        if (op.senderId === getSelfIdentity().userId) return;
        applyBoardOp(op);
      });
    }).catch(() => {
      // Supabase not configured or connection failed — collab stays disabled
    });

    return () => {
      mounted = false;
      unsubPresence?.();
      unsubCursors?.();
      unsubBoardOps?.();
      if (channelRef.current) void leaveRoom(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
      setMembers([]);
      setCursors([]);
    };
  }, [enabled, boardId]);

  const onCursorMove = useCallback((x: number, y: number) => {
    if (!channelRef.current || !enabled) return;
    if (throttleRef.current) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      if (channelRef.current) broadcastCursor(channelRef.current, { ...self, x, y });
    }, 50);
  }, [enabled, self]);

  const updateDisplayName = useCallback((name: string) => {
    updateSelfIdentity({ displayName: name });
    setSelf(s => ({ ...s, displayName: name }));
  }, []);

  const broadcastOp = useCallback((op: Omit<BoardOp, "senderId">) => {
    if (!channelRef.current || !enabled) return;
    void broadcastBoardOp(channelRef.current, { ...op, senderId: getSelfIdentity().userId } as BoardOp);
  }, [enabled]);

  return { members, cursors, self, isConnected, onCursorMove, updateDisplayName, broadcastOp };
}
