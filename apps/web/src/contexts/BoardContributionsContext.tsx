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

/**
 * A viewer-contributed entry attached to a board item (suggestion box, guestbook,
 * poll, contributable list, …). Lives in board_item_contributions, NOT the board
 * JSONB — mirrors how chat messages live in board_chat_messages.
 */
export interface Contribution {
  id: string;
  boardId: string;
  itemId: string;
  authorId: string;
  authorName: string;
  kind: string;
  content: string;
  approved: boolean;
  pinned: boolean;
  createdAt: string;
}

interface BoardContributionsContextValue {
  /** Contributions indexed by itemId, oldest-first. */
  contributionsByItem: Record<string, Contribution[]>;
  /**
   * Load contributions for an item and subscribe to Realtime changes.
   * Returns an unsubscribe function — call it when the item unmounts.
   */
  loadAndSubscribe: (itemId: string, boardId: string) => () => void;
  /** Add a contribution (optimistic + Supabase insert). `approved: false` for moderated boxes. */
  addContribution: (
    itemId: string,
    boardId: string,
    content: string,
    opts?: { kind?: string; approved?: boolean }
  ) => Promise<void>;
  /** Delete one of your own contributions (optimistic). */
  removeOwn: (id: string, itemId: string) => Promise<void>;
  /** Edit the content of one of your own contributions (optimistic). */
  editOwn: (id: string, itemId: string, content: string) => Promise<void>;
  /** Moderator: delete anyone's contribution via the security-definer RPC (optimistic). */
  moderateRemove: (id: string, itemId: string) => Promise<void>;
  /** Moderator: pin/unpin a contribution via the security-definer RPC (optimistic). */
  togglePin: (id: string, itemId: string, pinned: boolean) => Promise<void>;
  /** Moderator: approve/reject a contribution via the security-definer RPC (optimistic). */
  setApproved: (id: string, itemId: string, approved: boolean) => Promise<void>;
}

const BoardContributionsContext = createContext<BoardContributionsContextValue>({
  contributionsByItem: {},
  loadAndSubscribe: () => () => {},
  addContribution: async () => {},
  removeOwn: async () => {},
  editOwn: async () => {},
  moderateRemove: async () => {},
  togglePin: async () => {},
  setApproved: async () => {},
});

export function useBoardContributions(): BoardContributionsContextValue {
  return useContext(BoardContributionsContext);
}

// ─── Convenience hook used by contributable items ─────────────────────────────

export function useItemContributions(itemId: string, boardId: string) {
  const ctx = useBoardContributions();

  useEffect(() => {
    const unsub = ctx.loadAndSubscribe(itemId, boardId);
    return unsub;
    // ctx functions are stable useCallbacks — not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, boardId]);

  const contributions = ctx.contributionsByItem[itemId] ?? [];

  const add = useCallback(
    (content: string, opts?: { kind?: string; approved?: boolean }) => ctx.addContribution(itemId, boardId, content, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId, boardId]
  );

  const removeOwn = useCallback(
    (id: string) => ctx.removeOwn(id, itemId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId]
  );

  const editOwn = useCallback(
    (id: string, content: string) => ctx.editOwn(id, itemId, content),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId]
  );

  const moderateRemove = useCallback(
    (id: string) => ctx.moderateRemove(id, itemId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId]
  );

  const togglePin = useCallback(
    (id: string, pinned: boolean) => ctx.togglePin(id, itemId, pinned),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId]
  );

  const setApproved = useCallback(
    (id: string, approved: boolean) => ctx.setApproved(id, itemId, approved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId]
  );

  return { contributions, add, removeOwn, editOwn, moderateRemove, togglePin, setApproved };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToContribution(row: Record<string, unknown>): Contribution {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    itemId: row.item_id as string,
    authorId: row.author_id as string,
    authorName: row.author_name as string,
    kind: (row.kind as string) ?? "entry",
    content: (row.content as string) ?? "",
    approved: Boolean(row.approved),
    pinned: Boolean(row.pinned),
    createdAt: row.created_at as string,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BoardContributionsProvider({ children }: { children: React.ReactNode }) {
  const { identity } = useUser();
  const [contributionsByItem, setContributionsByItem] = useState<Record<string, Contribution[]>>({});
  const channels = useRef<Record<string, RealtimeChannel>>({});
  const loaded = useRef<Set<string>>(new Set());
  // Reference count: how many subscribers per itemId, so multiple views of the
  // same item share one subscription and one stream.
  const refCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    const chans = channels.current;
    return () => {
      Object.values(chans).forEach((ch) => void supabase.removeChannel(ch));
    };
  }, []);

  const loadAndSubscribe = useCallback((itemId: string, boardId: string): () => void => {
    if (!isSupabaseReady()) return () => {};

    refCounts.current[itemId] = (refCounts.current[itemId] ?? 0) + 1;

    if (!channels.current[itemId]) {
      const ch = supabase
        .channel(`board-contrib:${itemId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "board_item_contributions",
            filter: `item_id=eq.${itemId}`,
          },
          (payload) => {
            const c = rowToContribution(payload.new as Record<string, unknown>);
            setContributionsByItem((prev) => {
              const existing = prev[itemId] ?? [];
              if (existing.some((x) => x.id === c.id)) return prev;
              const optIdx = existing.findIndex(
                (x) => x.id.startsWith("opt-") && x.authorId === c.authorId && x.content === c.content
              );
              if (optIdx >= 0) {
                const updated = [...existing];
                updated[optIdx] = c;
                return { ...prev, [itemId]: updated };
              }
              return { ...prev, [itemId]: [...existing, c] };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "board_item_contributions",
            filter: `item_id=eq.${itemId}`,
          },
          (payload) => {
            const c = rowToContribution(payload.new as Record<string, unknown>);
            setContributionsByItem((prev) => {
              const existing = prev[itemId];
              if (!existing) return prev;
              return { ...prev, [itemId]: existing.map((x) => (x.id === c.id ? c : x)) };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "board_item_contributions",
            filter: `item_id=eq.${itemId}`,
          },
          (payload) => {
            const id = (payload.old as Record<string, unknown>).id as string;
            setContributionsByItem((prev) => {
              const existing = prev[itemId];
              if (!existing) return prev;
              return { ...prev, [itemId]: existing.filter((x) => x.id !== id) };
            });
          }
        )
        .subscribe();

      channels.current[itemId] = ch;
    }

    if (!loaded.current.has(itemId)) {
      loaded.current.add(itemId);
      void supabase
        .from("board_item_contributions")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data) {
            setContributionsByItem((prev) => ({
              ...prev,
              [itemId]: data.map(rowToContribution as (r: unknown) => Contribution),
            }));
          }
        });
    }

    return () => {
      refCounts.current[itemId] = (refCounts.current[itemId] ?? 1) - 1;
      if (refCounts.current[itemId] <= 0) {
        delete refCounts.current[itemId];
        const ch = channels.current[itemId];
        if (ch) {
          void supabase.removeChannel(ch);
          delete channels.current[itemId];
          loaded.current.delete(itemId); // allow fresh load on next mount
        }
      }
    };
  }, []);

  const addContribution = useCallback(async (
    itemId: string,
    boardId: string,
    content: string,
    opts: { kind?: string; approved?: boolean } = {},
  ): Promise<void> => {
    // The live snapshot renders under "<uuid>:live" — board_id is a uuid column,
    // so strip the suffix or every contribution from the live board fails to insert.
    const dbBoardId = boardId.replace(/:live$/, "");
    const kind = opts.kind ?? "entry";
    const approved = opts.approved ?? true;
    const optimisticId = `opt-${crypto.randomUUID()}`;
    const optimistic: Contribution = {
      id: optimisticId,
      boardId: dbBoardId,
      itemId,
      authorId: identity.userId,
      authorName: identity.displayName,
      kind,
      content,
      approved,
      pinned: false,
      createdAt: new Date().toISOString(),
    };

    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), optimistic],
    }));

    if (!isSupabaseReady()) return; // guest mode — keep optimistic only

    const { data, error } = await supabase
      .from("board_item_contributions")
      .insert({
        board_id: dbBoardId,
        item_id: itemId,
        author_id: identity.userId,
        author_name: identity.displayName,
        kind,
        content,
        approved,
      })
      .select()
      .single();

    if (error || !data) {
      setContributionsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] ?? []).filter((x) => x.id !== optimisticId),
      }));
      return;
    }

    const real = rowToContribution(data as Record<string, unknown>);
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((x) => (x.id === optimisticId ? real : x)),
    }));
  }, [identity.userId, identity.displayName]);

  const removeOwn = useCallback(async (id: string, itemId: string): Promise<void> => {
    if (id.startsWith("opt-")) {
      setContributionsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] ?? []).filter((x) => x.id !== id),
      }));
      return;
    }

    const prevList = contributionsByItem[itemId] ?? [];
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((x) => x.id !== id),
    }));

    if (!isSupabaseReady()) return;

    const { error } = await supabase.from("board_item_contributions").delete().eq("id", id);
    if (error) setContributionsByItem((prev) => ({ ...prev, [itemId]: prevList })); // rollback
  }, [contributionsByItem]);

  const editOwn = useCallback(async (id: string, itemId: string, content: string): Promise<void> => {
    const prevList = contributionsByItem[itemId] ?? [];
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((x) => (x.id === id ? { ...x, content } : x)),
    }));

    if (id.startsWith("opt-") || !isSupabaseReady()) return;

    const { error } = await supabase.from("board_item_contributions").update({ content }).eq("id", id);
    if (error) setContributionsByItem((prev) => ({ ...prev, [itemId]: prevList })); // rollback
  }, [contributionsByItem]);

  const moderateRemove = useCallback(async (id: string, itemId: string): Promise<void> => {
    if (id.startsWith("opt-")) {
      setContributionsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] ?? []).filter((x) => x.id !== id),
      }));
      return;
    }

    const prevList = contributionsByItem[itemId] ?? [];
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((x) => x.id !== id),
    }));

    if (!isSupabaseReady()) return;

    const { error } = await supabase.rpc("delete_contribution", { p_id: id });
    if (error) setContributionsByItem((prev) => ({ ...prev, [itemId]: prevList })); // rollback
  }, [contributionsByItem]);

  const togglePin = useCallback(async (id: string, itemId: string, pinned: boolean): Promise<void> => {
    if (id.startsWith("opt-")) return;
    const prevList = contributionsByItem[itemId] ?? [];
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((x) => (x.id === id ? { ...x, pinned } : x)),
    }));

    if (!isSupabaseReady()) return;

    const { error } = await supabase.rpc("set_contribution_pinned", { p_id: id, p_pinned: pinned });
    if (error) setContributionsByItem((prev) => ({ ...prev, [itemId]: prevList })); // rollback
  }, [contributionsByItem]);

  const setApproved = useCallback(async (id: string, itemId: string, approved: boolean): Promise<void> => {
    if (id.startsWith("opt-")) return;
    const prevList = contributionsByItem[itemId] ?? [];
    setContributionsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((x) => (x.id === id ? { ...x, approved } : x)),
    }));

    if (!isSupabaseReady()) return;

    const { error } = await supabase.rpc("set_contribution_approved", { p_id: id, p_approved: approved });
    if (error) setContributionsByItem((prev) => ({ ...prev, [itemId]: prevList })); // rollback
  }, [contributionsByItem]);

  return (
    <BoardContributionsContext.Provider
      value={{ contributionsByItem, loadAndSubscribe, addContribution, removeOwn, editOwn, moderateRemove, togglePin, setApproved }}
    >
      {children}
    </BoardContributionsContext.Provider>
  );
}
