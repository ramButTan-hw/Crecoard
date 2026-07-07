/**
 * Server-side board JSONB mutation for bot write verbs.
 *
 * Loads the board row, locates the target item (inside any box, or among
 * canvas-level items), applies the mutation, writes the row back.
 * Concurrency model is last-write-wins — same as the client's debounced
 * multi-device sync; bots should write, not fight.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type LooseItem = { id: string; type: string } & Record<string, unknown>;
type LooseBoard = {
  boxes?: { id: string; items?: LooseItem[] }[];
  boardItems?: LooseItem[];
} & Record<string, unknown>;

export type MutateResult =
  | { ok: true; result: unknown }
  | { ok: false; status: number; error: string };

export async function mutateBoardItem(
  db: SupabaseClient,
  opts: {
    boardId: string;
    serverId: string;
    itemId: string;
    expectType: string;
    mutate: (item: LooseItem) => { ok: true; result: unknown } | { ok: false; error: string };
  }
): Promise<MutateResult> {
  const { data: row, error } = await db
    .from("boards")
    .select("id, data")
    .eq("id", opts.boardId)
    .eq("server_id", opts.serverId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "Board not found on this bot's server." };

  const board = (row.data ?? {}) as LooseBoard;
  let item: LooseItem | undefined;
  for (const box of board.boxes ?? []) {
    item = (box.items ?? []).find((i) => i.id === opts.itemId);
    if (item) break;
  }
  if (!item) item = (board.boardItems ?? []).find((i) => i.id === opts.itemId);
  if (!item) return { ok: false, status: 404, error: "Item not found on that board." };
  if (item.type !== opts.expectType) {
    return { ok: false, status: 400, error: `Item is a "${item.type}", expected "${opts.expectType}".` };
  }

  const mutated = opts.mutate(item);
  if (!mutated.ok) return { ok: false, status: 400, error: mutated.error };

  const { error: writeError } = await db
    .from("boards")
    .update({ data: board, updated_at: new Date().toISOString() })
    .eq("id", opts.boardId);
  if (writeError) return { ok: false, status: 500, error: writeError.message };

  return { ok: true, result: mutated.result };
}
