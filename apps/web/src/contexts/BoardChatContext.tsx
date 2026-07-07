"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";
import { useBoardStore } from "@/store/boardStore";
import { useNotifications } from "@/contexts/NotificationContext";
import { playPing } from "@/lib/sound";
import type { ChatMessage } from "@/store/boardStore";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

const PAGE_SIZE = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single reaction row: one user reacting to one message with one emoji. */
export interface ChatReaction {
  userId: string;
  emoji: string;
}

interface BoardChatContextValue {
  editMessage: (id: string, key: string, content: string) => Promise<void>;
  deleteMessage: (id: string, key: string) => Promise<void>;
  notifPrefs: Record<string, "all" | "mentions" | "mute">;
  setNotifPref: (chatKey: string, level: "all" | "mentions" | "mute") => void;
  /** Messages indexed by itemId. */
  messagesByItem: Record<string, ChatMessage[]>;
  /** Raw reactions indexed by message id (grouping/counts derived in the UI). */
  reactionsByMessage: Record<string, ChatReaction[]>;
  /**
   * Load messages for a chat item and subscribe to Realtime inserts.
   * Returns an unsubscribe function — call it when the ChatBlock unmounts.
   */
  loadAndSubscribe: (itemId: string, boardId: string, channel: string) => () => void;
  /** Fetch a page of older messages before `beforeIso`; returns how many loaded. */
  loadOlder: (boardId: string, channel: string, beforeIso: string) => Promise<number>;
  /** Send a message (optimistic + Supabase insert). */
  sendMessage: (
    itemId: string,
    boardId: string,
    channel: string,
    authorId: string,
    authorName: string,
    authorAvatar: string,
    content: string,
    opts?: { gifUrl?: string; imageUrl?: string; fileName?: string; replyTo?: { id: string; author: string; text: string } }
  ) => Promise<void>;
  /** Add or remove the current user's reaction to a message (optimistic). */
  toggleReaction: (messageId: string, boardId: string, emoji: string, userId: string) => Promise<void>;
  /** Pin or unpin a message within its (board, channel) (optimistic). */
  togglePin: (messageId: string, boardId: string, channel: string, pinned: boolean) => Promise<void>;
}

const BoardChatContext = createContext<BoardChatContextValue>({
  editMessage: async () => {},
  deleteMessage: async () => {},
  notifPrefs: {},
  setNotifPref: () => {},
  messagesByItem: {},
  reactionsByMessage: {},
  loadAndSubscribe: () => () => {},
  loadOlder: async () => 0,
  sendMessage: async () => {},
  toggleReaction: async () => {},
  togglePin: async () => {},
});

export function useBoardChat(): BoardChatContextValue {
  return useContext(BoardChatContext);
}

// ─── Convenience hook used by ChatBlock ───────────────────────────────────────

/** Stable key for a conversation: a (board, channel) stream, not a single item. */
export function chatKeyFor(boardId: string, channelName?: string) {
  return `${boardId}::${channelName ?? "general"}`;
}

export function useBoardChatItem(itemId: string, boardId: string, channelName?: string) {
  const ctx = useBoardChat();
  const channel = channelName ?? "general";
  const chatKey = chatKeyFor(boardId, channel);

  useEffect(() => {
    const unsub = ctx.loadAndSubscribe(itemId, boardId, channel);
    return unsub;
  // ctx functions are stable useCallbacks — not in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKey]);

  const messages = ctx.messagesByItem[chatKey] ?? [];
  /** True until the first page for this channel has arrived (undefined = not fetched yet). */
  const loading = ctx.messagesByItem[chatKey] === undefined;
  const notifPref = ctx.notifPrefs[chatKey] ?? "all";
  const editOwnMessage = useCallback(
    (id: string, content: string) => ctx.editMessage(id, chatKey, content),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );
  const deleteOwnMessage = useCallback(
    (id: string) => ctx.deleteMessage(id, chatKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );
  const setNotifPrefForKey = useCallback(
    (level: "all" | "mentions" | "mute") => ctx.setNotifPref(chatKey, level),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );

  const send = useCallback(
    (
      authorId: string,
      authorName: string,
      authorAvatar: string,
      content: string,
      opts?: { gifUrl?: string; imageUrl?: string; fileName?: string; replyTo?: { id: string; author: string; text: string } }
    ) => ctx.sendMessage(itemId, boardId, channel, authorId, authorName, authorAvatar, content, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );

  const loadOlder = useCallback(
    (beforeIso: string) => ctx.loadOlder(boardId, channel, beforeIso),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string, userId: string) =>
      ctx.toggleReaction(messageId, boardId, emoji, userId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );

  const togglePin = useCallback(
    (messageId: string, pinned: boolean) => ctx.togglePin(messageId, boardId, channel, pinned),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatKey]
  );

  return { messages, loading, send, chatKey, loadOlder, reactions: ctx.reactionsByMessage, toggleReaction, togglePin, notifPref, setNotifPref: setNotifPrefForKey, editOwnMessage, deleteOwnMessage };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    authorId: row.author_id as string,
    authorName: row.author_name as string,
    authorAvatar: row.author_avatar as string,
    content: row.content as string,
    timestamp: row.created_at as string,
    gif: (row.gif_url as string | null) ?? undefined,
    image: (row.image_url as string | null) ?? undefined,
    fileName: (row.file_name as string | null) ?? undefined,
    pinned: Boolean(row.pinned),
    pinnedAt: (row.pinned_at as string | null) ?? undefined,
    pinnedBy: (row.pinned_by as string | null) ?? undefined,
    editedAt: (row.edited_at as string | null) ?? undefined,
    replyToId: (row.reply_to_id as string | null) ?? undefined,
    replyToAuthor: (row.reply_to_author as string | null) ?? undefined,
    replyToText: (row.reply_to_text as string | null) ?? undefined,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BoardChatProvider({ children }: { children: React.ReactNode }) {
  const { identity } = useUser();
  const { push: pushNotification, isActive } = useNotifications();
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);

  // Per-channel notification preferences: 'all' (default) | 'mentions' | 'mute'.
  // Gates toasts, pings and unread on the client; /api/push/chat reads the same
  // table server-side so web push honors them too.
  const [notifPrefs, setNotifPrefs] = useState<Record<string, "all" | "mentions" | "mute">>({});
  const notifPrefsRef = useRef(notifPrefs);
  useEffect(() => { notifPrefsRef.current = notifPrefs; }, [notifPrefs]);
  useEffect(() => {
    if (!identity.userId) return;
    let cancelled = false;
    void supabase
      .from("chat_notification_prefs")
      .select("chat_key, level")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNotifPrefs(Object.fromEntries(data.map((r) => [r.chat_key as string, r.level as "all" | "mentions" | "mute"])));
      });
    return () => { cancelled = true; };
  }, [identity.userId]);

  const setNotifPref = useCallback((chatKey: string, level: "all" | "mentions" | "mute") => {
    setNotifPrefs((prev) => {
      const next = { ...prev };
      if (level === "all") delete next[chatKey];
      else next[chatKey] = level;
      return next;
    });
    const me = identityRef.current.userId;
    if (!me) return;
    if (level === "all") {
      void supabase.from("chat_notification_prefs").delete().eq("user_id", me).eq("chat_key", chatKey);
    } else {
      void supabase.from("chat_notification_prefs").upsert(
        { user_id: me, chat_key: chatKey, level, updated_at: new Date().toISOString() },
        { onConflict: "user_id,chat_key" }
      );
    }
  }, []);

  /** True when a notification for this key/mention state should fire.
      Resolution: channel pref → server-wide pref (`server::<id>`) → 'all'. */
  const notifAllowed = useCallback((chatKey: string, isMention: boolean) => {
    let level = notifPrefsRef.current[chatKey];
    if (!level) {
      const boardId = chatKey.split("::")[0];
      const st = useBoardStore.getState();
      const serverId = (st.serverBoards[boardId] ?? st.boards.find((b) => b.id === boardId))?.serverId;
      if (serverId) level = notifPrefsRef.current[`server::${serverId}`];
    }
    level ??= "all";
    if (level === "mute") return false;
    if (level === "mentions") return isMention;
    return true;
  }, []);
  const [messagesByItem, setMessagesByItem] = useState<Record<string, ChatMessage[]>>({});
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, ChatReaction[]>>({});
  // Mirror of reactionsByMessage so toggleReaction can read current state without
  // a stale closure (it needs to know whether the reaction already exists).
  const reactionsRef = useRef<Record<string, ChatReaction[]>>({});
  useEffect(() => { reactionsRef.current = reactionsByMessage; }, [reactionsByMessage]);
  const channels = useRef<Record<string, RealtimeChannel>>({});
  const loaded = useRef<Set<string>>(new Set());
  // Reference count: how many ChatBlock instances are subscribed to each itemId
  const refCounts = useRef<Record<string, number>>({});
  // Store channel name per itemId so the Realtime handler can include it in the toast
  const channelNames = useRef<Record<string, string>>({});

  useEffect(() => {
    const chans = channels.current;
    return () => {
      Object.values(chans).forEach((ch) => void supabase.removeChannel(ch));
    };
  }, []);

  // Fetch all reactions for a set of message ids and merge them in, replacing any
  // previously-known reactions for those messages (so a reload reflects deletions).
  const loadReactionsFor = useCallback(async (ids: string[]): Promise<void> => {
    const real = ids.filter((id) => !id.startsWith("opt-"));
    if (!real.length || !isSupabaseReady()) return;
    const { data } = await supabase
      .from("board_chat_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", real);
    if (!data) return;
    setReactionsByMessage((prev) => {
      const next = { ...prev };
      for (const id of real) next[id] = [];
      for (const r of data) {
        const mid = r.message_id as string;
        (next[mid] ??= []).push({ userId: r.user_id as string, emoji: r.emoji as string });
      }
      return next;
    });
  }, []);

  // ── Global message watcher ──────────────────────────────────────────────────
  // The per-item subscriptions above only exist while a chat item is MOUNTED,
  // so they can never notify about messages on other boards — which is the
  // whole point of notifications. This one channel watches inserts across all
  // boards the user belongs to (personal + server drafts) and raises the same
  // toast/unread/ping; keys with a live per-item subscription are skipped so
  // nothing double-fires.
  const watchedBoardsKey = useBoardStore((s) =>
    [...s.boards.map((b) => b.id), ...Object.keys(s.serverBoards).filter((k) => !k.endsWith(":live"))].sort().join(",")
  );
  useEffect(() => {
    if (!watchedBoardsKey || !identityRef.current.userId) return;
    const ids = watchedBoardsKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    const ch = supabase
      .channel("board-chat-watch")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "board_chat_messages",
          filter: `board_id=in.(${ids.join(",")})`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const boardId = row.board_id as string;
          const channel = ((row.channel as string) ?? "general");
          const key = chatKeyFor(boardId, channel);
          if (channels.current[key]) return; // a mounted chat item already handles this key
          const msg = rowToMessage(row);
          const me = identityRef.current;
          if (msg.authorId === me.userId) return;
          const isMention = Boolean(
            msg.content && (
              msg.content.includes(`<@${me.userId}>`) ||
              (me.displayName && msg.content.toLowerCase().includes(`@${me.displayName.toLowerCase()}`))
            )
          );
          if (!notifAllowed(key, isMention)) return;
          playPing(isMention ? "mention" : "message");
          pushNotification({
            itemId: key,
            channelName: channel,
            authorName: msg.authorName,
            authorAvatar: msg.authorAvatar,
            content: msg.content ?? "",
            isMention,
          });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // pushNotification is a stable useCallback from the provider above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBoardsKey]);

  const loadAndSubscribe = useCallback((itemId: string, boardId: string, channel: string): () => void => {
    if (!isSupabaseReady()) return () => {};

    const key = chatKeyFor(boardId, channel);
    channelNames.current[key] = channel;

    // Reference-count subscribers per (board, channel) so boxes pinned to the
    // same channel share one subscription and one message stream.
    refCounts.current[key] = (refCounts.current[key] ?? 0) + 1;

    if (!channels.current[key]) {
      const ch = supabase
        .channel(`board-chat:${key}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "board_chat_messages",
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            // postgres_changes only filters one column — match the channel here.
            if (((row.channel as string) ?? "general") !== channel) return;
            const msg = rowToMessage(row);

            if (msg.authorId !== identity.userId) {
              const isMention = Boolean(
                msg.content && (
                  msg.content.includes(`<@${identity.userId}>`) ||
                  (identity.displayName && msg.content.toLowerCase().includes(`@${identity.displayName.toLowerCase()}`))
                )
              );
              if (notifAllowed(key, isMention)) {
                playPing(isMention ? "mention" : "message");
                pushNotification({
                  itemId: key,
                  channelName: channel,
                  authorName:   msg.authorName,
                  authorAvatar: msg.authorAvatar,
                  content:      msg.content ?? "",
                  isMention,
                });
              }
            }

            setMessagesByItem((prev) => {
              const existing = prev[key] ?? [];
              if (existing.some((m) => m.id === msg.id)) return prev;
              const optIdx = existing.findIndex(
                (m) => m.id.startsWith("opt-") && m.authorId === msg.authorId
              );
              if (optIdx >= 0) {
                const updated = [...existing];
                updated[optIdx] = msg;
                return { ...prev, [key]: updated };
              }
              return { ...prev, [key]: [...existing, msg] };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "board_chat_messages",
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (((row.channel as string) ?? "general") !== channel) return;
            const id = row.id as string;
            setMessagesByItem((prev) => {
              const existing = prev[key];
              if (!existing) return prev;
              let changed = false;
              const updated = existing.map((m) => {
                if (m.id !== id) return m;
                changed = true;
                return {
                  ...m,
                  content: (row.content as string | null) ?? m.content,
                  editedAt: (row.edited_at as string | null) ?? m.editedAt,
                  pinned: Boolean(row.pinned),
                  pinnedAt: (row.pinned_at as string | null) ?? undefined,
                  pinnedBy: (row.pinned_by as string | null) ?? undefined,
                };
              });
              return changed ? { ...prev, [key]: updated } : prev;
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "board_chat_messages",
          },
          (payload) => {
            const id = (payload.old as Record<string, unknown>)?.id as string | undefined;
            if (!id) return;
            setMessagesByItem((prev) => {
              const existing = prev[key];
              if (!existing?.some((m) => m.id === id)) return prev;
              return { ...prev, [key]: existing.filter((m) => m.id !== id) };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "board_chat_reactions",
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const r = payload.new as Record<string, unknown>;
            const mid = r.message_id as string;
            const entry = { userId: r.user_id as string, emoji: r.emoji as string };
            setReactionsByMessage((prev) => {
              const list = prev[mid] ?? [];
              if (list.some((x) => x.userId === entry.userId && x.emoji === entry.emoji)) return prev;
              return { ...prev, [mid]: [...list, entry] };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "board_chat_reactions",
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const r = payload.old as Record<string, unknown>;
            const mid = r.message_id as string;
            setReactionsByMessage((prev) => {
              const list = prev[mid];
              if (!list) return prev;
              return { ...prev, [mid]: list.filter((x) => !(x.userId === r.user_id && x.emoji === r.emoji)) };
            });
          }
        )
        .subscribe();

      channels.current[key] = ch;
    }

    if (!loaded.current.has(key)) {
      loaded.current.add(key);
      // Load the most recent page, then reverse to oldest-first for display.
      void supabase
        .from("board_chat_messages")
        .select("*")
        .eq("board_id", boardId)
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .then(({ data }) => {
          if (data) {
            const ordered = [...data].reverse();
            setMessagesByItem((prev) => ({
              ...prev,
              [key]: ordered.map(rowToMessage as (r: unknown) => ChatMessage),
            }));
            void loadReactionsFor(ordered.map((r) => (r as { id: string }).id));
          }
        });
    }

    return () => {
      refCounts.current[key] = (refCounts.current[key] ?? 1) - 1;
      if (refCounts.current[key] <= 0) {
        delete refCounts.current[key];
        const ch = channels.current[key];
        if (ch) {
          void supabase.removeChannel(ch);
          delete channels.current[key];
          loaded.current.delete(key); // allow fresh load on next mount
        }
      }
    };
  }, []);

  const editMessage = useCallback(async (id: string, key: string, content: string) => {
    const editedAt = new Date().toISOString();
    setMessagesByItem((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: existing.map((m) => (m.id === id ? { ...m, content, editedAt } : m)) };
    });
    await supabase.from("board_chat_messages").update({ content, edited_at: editedAt }).eq("id", id);
  }, []);

  const deleteMessage = useCallback(async (id: string, key: string) => {
    setMessagesByItem((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: existing.filter((m) => m.id !== id) };
    });
    await supabase.from("board_chat_messages").delete().eq("id", id);
  }, []);

  const loadOlder = useCallback(async (boardId: string, channel: string, beforeIso: string): Promise<number> => {
    if (!isSupabaseReady()) return 0;
    const key = chatKeyFor(boardId, channel);
    const { data } = await supabase
      .from("board_chat_messages")
      .select("*")
      .eq("board_id", boardId)
      .eq("channel", channel)
      .lt("created_at", beforeIso)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!data || data.length === 0) return 0;
    const older = [...data].reverse().map(rowToMessage as (r: unknown) => ChatMessage);
    setMessagesByItem((prev) => {
      const existing = prev[key] ?? [];
      const ids = new Set(existing.map((m) => m.id));
      return { ...prev, [key]: [...older.filter((m) => !ids.has(m.id)), ...existing] };
    });
    void loadReactionsFor(older.map((m) => m.id));
    return data.length;
  }, [loadReactionsFor]);

  const sendMessage = useCallback(async (
    itemId: string,
    boardId: string,
    channel: string,
    authorId: string,
    authorName: string,
    authorAvatar: string,
    content: string,
    opts: { gifUrl?: string; imageUrl?: string; fileName?: string; replyTo?: { id: string; author: string; text: string } } = {}
  ) => {
    const key = chatKeyFor(boardId, channel);
    const optimisticId = `opt-${crypto.randomUUID()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      authorId,
      authorName,
      authorAvatar,
      content,
      timestamp: new Date().toISOString(),
      gif: opts.gifUrl,
      image: opts.imageUrl,
      fileName: opts.fileName,
      replyToId: opts.replyTo?.id,
      replyToAuthor: opts.replyTo?.author,
      replyToText: opts.replyTo?.text,
    };

    setMessagesByItem((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), optimistic],
    }));

    if (!isSupabaseReady()) return; // guest mode — keep optimistic only

    const { data, error } = await supabase
      .from("board_chat_messages")
      .insert({
        item_id: itemId,
        board_id: boardId,
        channel,
        author_id: authorId,
        author_name: authorName,
        author_avatar: authorAvatar,
        content,
        gif_url: opts.gifUrl ?? null,
        image_url: opts.imageUrl ?? null,
        file_name: opts.fileName ?? null,
        reply_to_id: opts.replyTo?.id ?? null,
        reply_to_author: opts.replyTo?.author ?? null,
        reply_to_text: opts.replyTo?.text ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      setMessagesByItem((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((m) => m.id !== optimisticId),
      }));
      return;
    }

    const real = rowToMessage(data as Record<string, unknown>);
    setMessagesByItem((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((m) => (m.id === optimisticId ? real : m)),
    }));
  }, []);

  const toggleReaction = useCallback(async (
    messageId: string,
    boardId: string,
    emoji: string,
    userId: string,
  ): Promise<void> => {
    // Optimistic-only messages aren't persisted yet, so there's nothing to react to.
    if (messageId.startsWith("opt-")) return;
    const has = (reactionsRef.current[messageId] ?? []).some((x) => x.userId === userId && x.emoji === emoji);

    // Optimistic toggle.
    setReactionsByMessage((prev) => {
      const list = prev[messageId] ?? [];
      return {
        ...prev,
        [messageId]: has
          ? list.filter((x) => !(x.userId === userId && x.emoji === emoji))
          : [...list, { userId, emoji }],
      };
    });

    if (!isSupabaseReady()) return;

    const { error } = has
      ? await supabase.from("board_chat_reactions").delete()
          .eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji)
      : await supabase.from("board_chat_reactions")
          .insert({ message_id: messageId, board_id: boardId, user_id: userId, emoji });

    // Roll back on failure.
    if (error) {
      setReactionsByMessage((prev) => {
        const list = prev[messageId] ?? [];
        return {
          ...prev,
          [messageId]: has
            ? [...list, { userId, emoji }]
            : list.filter((x) => !(x.userId === userId && x.emoji === emoji)),
        };
      });
    }
  }, []);

  const togglePin = useCallback(async (
    messageId: string,
    boardId: string,
    channel: string,
    pinned: boolean,
  ): Promise<void> => {
    if (messageId.startsWith("opt-")) return;
    const key = chatKeyFor(boardId, channel);

    const apply = (want: boolean) => setMessagesByItem((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: existing.map((m) =>
          m.id === messageId
            ? { ...m, pinned: want, pinnedAt: want ? new Date().toISOString() : undefined }
            : m
        ),
      };
    });

    apply(pinned); // optimistic
    if (!isSupabaseReady()) return;

    const { error } = await supabase.rpc("set_chat_message_pinned", {
      p_message_id: messageId,
      p_pinned: pinned,
    });
    if (error) apply(!pinned); // rollback
  }, []);

  return (
    <BoardChatContext.Provider value={{ editMessage, deleteMessage, notifPrefs, setNotifPref, messagesByItem, reactionsByMessage, loadAndSubscribe, loadOlder, sendMessage, toggleReaction, togglePin }}>
      {children}
    </BoardChatContext.Provider>
  );
}
