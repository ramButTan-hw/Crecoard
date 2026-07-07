"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DmMessage {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  gifUrl?: string;
  imageUrl?: string;
  fileName?: string;
  createdAt: string;
}

interface MessagingContextValue {
  /** Get-or-create a DM conversation with another Supabase user. Returns conversationId. */
  openConversation: (otherUserId: string) => Promise<string | null>;
  /** Fetch message history for a conversation (no-op if already loaded). */
  loadMessages: (conversationId: string) => Promise<void>;
  /** Subscribe to Realtime inserts for a conversation. Returns an unsubscribe fn. */
  subscribeToConversation: (conversationId: string) => () => void;
  /** Messages keyed by conversationId. */
  messages: Record<string, DmMessage[]>;
  /** Send a message (optimistic + Supabase insert). */
  sendMessage: (
    conversationId: string,
    content: string,
    options?: { gifUrl?: string; imageUrl?: string; fileName?: string }
  ) => Promise<void>;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

export function useMessaging(): MessagingContextValue {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error("useMessaging must be inside <MessagingProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Record<string, DmMessage[]>>({});
  const channels = useRef<Record<string, RealtimeChannel>>({});
  const loaded = useRef<Set<string>>(new Set());
  const { identity } = useUser();

  // Clean up all Realtime channels on unmount
  useEffect(() => {
    const chans = channels.current;
    return () => {
      Object.values(chans).forEach((ch) => void supabase.removeChannel(ch));
    };
  }, []);

  // ── Get or create a DM conversation ──────────────────────────────────────

  const openConversation = useCallback(async (otherUserId: string): Promise<string | null> => {
    if (!isSupabaseReady()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    if (user.id === otherUserId) return null;

    // Canonical ordering: smaller UUID first
    const [userA, userB] = user.id < otherUserId
      ? [user.id, otherUserId]
      : [otherUserId, user.id];

    const { data: existing } = await supabase
      .from("dm_conversations")
      .select("id")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .maybeSingle();

    if (existing) return existing.id as string;

    const { data: created, error } = await supabase
      .from("dm_conversations")
      .insert({ user_a: userA, user_b: userB })
      .select("id")
      .single();

    if (error || !created) { console.error("[Messaging] openConversation failed:", error); return null; }
    return created.id as string;
  }, []);

  // ── Load message history ──────────────────────────────────────────────────

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!isSupabaseReady()) return;
    if (loaded.current.has(conversationId)) return;
    loaded.current.add(conversationId);

    const { data, error } = await supabase
      .from("dm_messages")
      .select("id, conversation_id, author_id, content, gif_url, image_url, file_name, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error || !data) { loaded.current.delete(conversationId); return; }

    // Batch-fetch profiles for display names
    const authorIds = [...new Set(data.map((m) => m.author_id as string))];
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", authorIds)
      : { data: [] };

    const nameMap = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));

    const msgs: DmMessage[] = data.map((row) => {
      const name = nameMap.get(row.author_id as string) || "Unknown";
      return {
        id:             row.id as string,
        conversationId: row.conversation_id as string,
        authorId:       row.author_id as string,
        authorName:     name,
        authorAvatar:   name[0]?.toUpperCase() ?? "?",
        content:        (row.content as string) || "",
        gifUrl:         row.gif_url as string | undefined,
        imageUrl:       row.image_url as string | undefined,
        fileName:       row.file_name as string | undefined,
        createdAt:      row.created_at as string,
      };
    });

    setMessages((prev) => ({ ...prev, [conversationId]: msgs }));
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────

  const subscribeToConversation = useCallback((conversationId: string): () => void => {
    if (!isSupabaseReady() || channels.current[conversationId]) return () => {};

    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const authorId = row.author_id as string;

          // Fetch author display name
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", authorId)
            .maybeSingle();

          const name = (profile?.display_name as string) || "Unknown";
          const msg: DmMessage = {
            id:             row.id as string,
            conversationId: row.conversation_id as string,
            authorId,
            authorName:     name,
            authorAvatar:   name[0]?.toUpperCase() ?? "?",
            content:        (row.content as string) || "",
            gifUrl:         row.gif_url as string | undefined,
            imageUrl:       row.image_url as string | undefined,
            fileName:       row.file_name as string | undefined,
            createdAt:      row.created_at as string,
          };

          setMessages((prev) => {
            const existing = prev[conversationId] ?? [];
            // Deduplicate: optimistic updates may already contain this id
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [conversationId]: [...existing, msg] };
          });
        }
      )
      .subscribe();

    channels.current[conversationId] = channel;

    return () => {
      void supabase.removeChannel(channel);
      delete channels.current[conversationId];
    };
  }, []);

  // ── Send a message ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (
    conversationId: string,
    content: string,
    options?: { gifUrl?: string; imageUrl?: string; fileName?: string }
  ) => {
    if (!isSupabaseReady()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Optimistic update
    const optimisticId = `opt-${crypto.randomUUID()}`;
    const displayName = identity.displayName || "You";
    const optimistic: DmMessage = {
      id:             optimisticId,
      conversationId,
      authorId:       user.id,
      authorName:     displayName,
      authorAvatar:   displayName[0]?.toUpperCase() ?? "Y",
      content,
      gifUrl:         options?.gifUrl,
      imageUrl:       options?.imageUrl,
      fileName:       options?.fileName,
      createdAt:      new Date().toISOString(),
    };

    setMessages((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] ?? []), optimistic],
    }));

    const { data, error } = await supabase
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        author_id:       user.id,
        content,
        gif_url:         options?.gifUrl ?? null,
        image_url:       options?.imageUrl ?? null,
        file_name:       options?.fileName ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      // Roll back
      setMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).filter((m) => m.id !== optimisticId),
      }));
      console.error("[Messaging] sendMessage failed:", error);
      return;
    }

    // Replace optimistic id with real id (Realtime dedup handles the INSERT broadcast)
    setMessages((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).map((m) =>
        m.id === optimisticId ? { ...m, id: data.id as string } : m
      ),
    }));
  }, [identity]);

  return (
    <MessagingContext.Provider value={{ openConversation, loadMessages, subscribeToConversation, messages, sendMessage }}>
      {children}
    </MessagingContext.Provider>
  );
}
