"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useBoardStore, type BlockItem } from "@/store/boardStore";

const POLL_MS = 30_000;

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

/**
 * Polls Supabase for unconsumed webhook_items for the given board and adds
 * them to the local board store as embed-card BoardLevelItems.
 *
 * Pass boardId = null to skip (e.g. when no board is active).
 */
export function useWebhookItems(boardId: string | null) {
  const addWebhookItems = useBoardStore((s) => s.addWebhookItems);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!boardId || !isConfigured()) return;

    async function poll() {
      const { data, error } = await supabase
        .from("webhook_items")
        .select("id, item_data")
        .eq("board_id", boardId)
        .is("consumed_at", null)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error || !data || data.length === 0) return;

      const items = data.map((row) => row.item_data as Omit<BlockItem, "id" | "zIndex"> & {
        showInCollapsed: boolean;
      });

      addWebhookItems(boardId!, items as Parameters<typeof addWebhookItems>[1]);

      // Mark as consumed
      const ids = data.map((r) => r.id);
      await supabase
        .from("webhook_items")
        .update({ consumed_at: new Date().toISOString() })
        .in("id", ids);
    }

    poll(); // run immediately on mount
    pollingRef.current = setInterval(poll, POLL_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [boardId, addWebhookItems]);
}
