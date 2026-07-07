"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { useBoardStore } from "@/store/boardStore";
import type { Board } from "@/store/boardStore";
import type { ServerBackup } from "@/types/server";
import {
  DEFAULT_THEME_VARS, DEFAULT_APP_BG, applyThemeVars, applyAppFont,
} from "@/lib/appThemes";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

// ─── Context type ─────────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface BoardSyncContextValue {
  loadServerBoard: (boardId: string, serverId: string) => Promise<void>;
  saveServerBoard: (boardId: string, serverId: string) => Promise<void>;
  /** Overwrite the working draft with the latest published (live) snapshot. */
  revertDraftToLive: (boardId: string, serverId: string) => Promise<{ success: boolean; error?: string }>;
  /** Loads the latest published snapshot into serverBoards[boardId + ":live"]. Returns true if a publish exists. */
  loadLiveBoard: (boardId: string, serverId: string) => Promise<boolean>;
  /** Snapshots the current draft board and inserts it into server_publishes. */
  publishServerBoard: (boardId: string, serverId: string, userId: string, publisherName: string, message?: string) => Promise<{ success: boolean; error?: string }>;
  /** Fetches the raw board snapshot for a specific publish ID. */
  fetchPublishSnapshot: (publishId: string) => Promise<Record<string, unknown> | null>;
  /** Re-publishes an old snapshot as a new live version (creates a rollback commit). */
  rollbackToPublish: (boardId: string, serverId: string, publishId: string, userId: string, publisherName: string, originalAt: string) => Promise<{ success: boolean; error?: string }>;
  /** Fetches all backup slots (1-3) for a server. */
  fetchServerBackups: (serverId: string) => Promise<{ backups: ServerBackup[]; error: string | null }>;
  /** Upserts a backup slot with the current draft board snapshot. */
  createBackup: (boardId: string, serverId: string, slot: number, label: string, userId: string, creatorName: string) => Promise<{ success: boolean; error?: string }>;
  /** Restores a backup snapshot into the draft board (does NOT publish). */
  restoreFromBackup: (boardId: string, serverId: string, backupId: string) => Promise<{ success: boolean; error?: string }>;
  /** Deletes a backup slot by its row ID. */
  deleteBackup: (backupId: string) => Promise<{ success: boolean; error?: string }>;
  saveStatus: SaveStatus;
  saveError: string | null;
}

const BoardSyncContext = createContext<BoardSyncContextValue | null>(null);

export function useBoardSync(): BoardSyncContextValue {
  const ctx = useContext(BoardSyncContext);
  if (!ctx) throw new Error("useBoardSync must be inside <BoardSyncProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 2500;
const THEME_DEBOUNCE_MS = 1500;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function BoardSyncProvider({ children }: { children: React.ReactNode }) {
  const pendingPersonal = useRef<Map<string, Board>>(new Map());
  const pendingHardDeletes = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  // Prevents the board subscriber from writing boards that Supabase just loaded.
  const skipNextChange = useRef(false);
  // Prevents the theme subscriber from writing theme that Supabase just loaded.
  const skipNextThemeChange = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── On mount: load boards + theme from Supabase ───────────────────────────
  // Supabase is authoritative for logged-in users. On board load failure we fall
  // back to localStorage so the user doesn't lose their work.

  useEffect(() => {
    if (!isSupabaseReady() || initialized.current) return;
    initialized.current = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Guest ("Continue without account") — there is no Supabase row to load,
        // so restore boards from the local cache. Without this, the boot default
        // stays in memory and would be persisted over the guest's saved boards.
        // skipNextChange: guest boards must never queue for a Supabase write.
        skipNextChange.current = true;
        useBoardStore.getState().hydrateBoards();
        skipNextChange.current = false;
        return;
      }

      // Scope all localStorage board caching to this account before any persist
      // fires, so two accounts on one browser never share the unscoped key.
      useBoardStore.getState().setCurrentUserId(user.id);

      // ── Boards ────────────────────────────────────────────────────────────
      const { data: boardData, error: boardError } = await supabase
        .from("boards")
        .select("id, data")
        .eq("user_id", user.id);

      const supabaseBoards: Board[] = (boardData ?? []).map((row) => ({
        ...(row.data as Record<string, unknown>),
        id: row.id as string,
      } as Board));

      if (boardError) {
        // Supabase unreachable (table missing, network error, etc.) — fall back to
        // localStorage so the user doesn't lose their work.
        console.error("[BoardSync] failed to load boards:", boardError.message);
        skipNextChange.current = true;
        useBoardStore.getState().hydrateBoards(user.id);
        skipNextChange.current = false;
      } else if (supabaseBoards.length === 0) {
        // Table exists but no boards saved yet — migrate whatever's in localStorage
        // to Supabase so the user's existing work isn't discarded.
        skipNextChange.current = true;
        useBoardStore.getState().hydrateBoards(user.id);
        skipNextChange.current = false;
        const localBoards = useBoardStore.getState().boards;
        for (const board of localBoards) pendingPersonal.current.set(board.id, board);
        if (pendingPersonal.current.size > 0) {
          setSaveStatus("saving");
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => flushRef.current(), 0);
        }
      } else {
        // Supabase has boards — it is the authoritative source.
        // Hard-delete any board that has been in the trash for > 30 days.
        const now = Date.now();
        const expired = supabaseBoards.filter((b) => b.deletedAt && now - b.deletedAt > THIRTY_DAYS_MS);
        for (const b of expired) {
          await supabase.from("boards").delete().eq("id", b.id).eq("user_id", user.id);
        }
        const expiredIds = new Set(expired.map((b) => b.id));
        const liveBoards = supabaseBoards.filter((b) => !expiredIds.has(b.id));

        skipNextChange.current = true;
        useBoardStore.setState((s) => {
          const safeActiveId =
            liveBoards.find((b) => b.id === s.activeBoardId && !b.deletedAt)?.id ??
            liveBoards.find((b) => !b.deletedAt)?.id ??
            "";
          // boardsHydrated unlocks persistBoards — real boards are loaded now.
          return { boards: liveBoards, activeBoardId: safeActiveId, boardsHydrated: true };
        });
        skipNextChange.current = false;
      }

      // ── Shared boards (collaborator access) ───────────────────────────────
      // Boards shared with this user via a link are owned by someone else, so the
      // user_id query above never returns them. Fetch them separately and tag their
      // IDs so the save path updates them by data only (never reassigns ownership).
      const { data: collabRows } = await supabase
        .from("board_collaborators")
        .select("board_id, can_edit")
        .eq("user_id", user.id);
      const sharedIds = (collabRows ?? []).map((r) => r.board_id as string);
      const readonlyIds = (collabRows ?? []).filter((r) => !r.can_edit).map((r) => r.board_id as string);
      if (sharedIds.length > 0) {
        const { data: sharedData } = await supabase
          .from("boards")
          .select("id, data")
          .in("id", sharedIds);
        const sharedBoards: Board[] = (sharedData ?? []).map((row) => ({
          ...(row.data as Record<string, unknown>),
          id: row.id as string,
        } as Board));
        const loadedIds = sharedBoards.map((b) => b.id);
        skipNextChange.current = true;
        useBoardStore.setState((s) => ({
          boards: [...s.boards.filter((b) => !loadedIds.includes(b.id)), ...sharedBoards],
          sharedBoardIds: loadedIds,
          readonlyBoardIds: readonlyIds.filter((id) => loadedIds.includes(id)),
        }));
        skipNextChange.current = false;
      }

      // Open a board the user just redeemed from a share link.
      if (typeof window !== "undefined") {
        const openId = sessionStorage.getItem("crecoard-open-board");
        if (openId) {
          sessionStorage.removeItem("crecoard-open-board");
          if (useBoardStore.getState().boards.some((b) => b.id === openId)) {
            useBoardStore.setState({ activeBoardId: openId });
          }
        }
      }

      // ── Theme (from profiles table) ───────────────────────────────────────
      // Supabase profile is the authoritative source — overwrites localStorage cache.
      const { data: profile } = await supabase
        .from("profiles")
        .select("theme_vars, app_font, app_bg")
        .eq("id", user.id)
        .single();

      const supabaseVars = profile?.theme_vars as Record<string, string> | null;
      const supabaseFont = profile?.app_font as string | null;
      const supabaseBg = profile?.app_bg as Record<string, unknown> | null;

      if (supabaseVars || supabaseFont || supabaseBg) {
        const vars = { ...DEFAULT_THEME_VARS, ...(supabaseVars ?? {}) };
        const font = supabaseFont ?? "Inter";
        const bg = { ...DEFAULT_APP_BG, ...(supabaseBg ?? {}) };

        applyThemeVars(vars);
        applyAppFont(font);

        skipNextThemeChange.current = true;
        useBoardStore.setState((s) => ({ ...s, themeVars: vars, appFont: font, appBg: bg }));
        skipNextThemeChange.current = false;
      }
    })();
  }, []);

  // ── Flush pending personal board writes to Supabase ───────────────────────

  const flushPersonalBoards = useCallback(async () => {
    if (!pendingPersonal.current.size && !pendingHardDeletes.current.size) { setSaveStatus("idle"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaveStatus("idle"); return; }

    const sharedIds = useBoardStore.getState().sharedBoardIds;
    const readonlyIds = useBoardStore.getState().readonlyBoardIds;

    // Hard deletes first (owner-only; never delete a board shared *with* us).
    for (const id of Array.from(pendingHardDeletes.current)) {
      if (sharedIds.includes(id)) { pendingHardDeletes.current.delete(id); continue; }
      const { error } = await supabase.from("boards").delete().eq("id", id).eq("user_id", user.id);
      if (!error) pendingHardDeletes.current.delete(id);
    }

    if (!pendingPersonal.current.size) {
      setSaveStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
      return;
    }

    const toFlush = Array.from(pendingPersonal.current.values());
    // View-only boards can't be written — drop them so they don't error or pile up.
    for (const b of toFlush) if (readonlyIds.includes(b.id)) pendingPersonal.current.delete(b.id);
    const writable = toFlush.filter((b) => !readonlyIds.includes(b.id));
    // Owned boards upsert with user_id; shared boards update data only so the
    // owner's user_id is preserved (and the ownership-guard trigger isn't tripped).
    const ownedRows = writable
      .filter((b) => !sharedIds.includes(b.id))
      .map((board) => { const { id, ...rest } = board; return { id, user_id: user.id, data: rest }; });
    const sharedToFlush = writable.filter((b) => sharedIds.includes(b.id));

    let failedMsg: string | null = null;

    if (ownedRows.length > 0) {
      const { error } = await supabase.from("boards").upsert(ownedRows, { onConflict: "id" });
      if (error) failedMsg = error.message ?? "Unknown error";
    }
    for (const board of sharedToFlush) {
      const { id, ...rest } = board;
      const { error } = await supabase.from("boards").update({ data: rest }).eq("id", id);
      if (error) failedMsg = error.message ?? "Unknown error";
    }

    if (failedMsg) {
      console.error("[BoardSync] board save failed:", failedMsg);
      setSaveError(failedMsg);
      setSaveStatus("error");
      debounceTimer.current = setTimeout(() => flushRef.current(), 8000);
    } else {
      for (const board of toFlush) pendingPersonal.current.delete(board.id);
      setSaveError(null);
      setSaveStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  const flushRef = useRef(flushPersonalBoards);
  useEffect(() => { flushRef.current = flushPersonalBoards; }, [flushPersonalBoards]);

  // ── Subscribe to board changes and queue writes ───────────────────────────
  // New boards write immediately (0 ms); edits debounce (DEBOUNCE_MS).
  // Cleanup does NOT cancel the timer — pending writes must survive StrictMode unmount.

  useEffect(() => {
    if (!isSupabaseReady()) return;

    const unsub = useBoardStore.subscribe((state, prev) => {
      if (state.boards === prev.boards) return;
      if (skipNextChange.current) return;

      const prevById = new Map(prev.boards.map((b) => [b.id, b]));
      const currIds = new Set(state.boards.map((b) => b.id));

      // Boards removed entirely from the array → hard delete in Supabase
      for (const [id] of prevById) {
        if (!currIds.has(id)) pendingHardDeletes.current.add(id);
      }

      let hasNew = false;
      for (const board of state.boards) {
        if (board !== prevById.get(board.id)) {
          pendingPersonal.current.set(board.id, board);
          if (!prevById.has(board.id)) hasNew = true;
        }
      }

      setSaveStatus("saving");
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(
        () => flushRef.current(),
        hasNew ? 0 : DEBOUNCE_MS,
      );
    });

    const handleUnload = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (pendingPersonal.current.size > 0) void flushRef.current();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      unsub();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  // ── Subscribe to theme changes and save to Supabase profiles ─────────────
  // Debounced so rapid theme picker interactions don't spam Supabase.

  useEffect(() => {
    if (!isSupabaseReady()) return;

    const unsub = useBoardStore.subscribe((state, prev) => {
      if (
        state.themeVars === prev.themeVars &&
        state.appFont === prev.appFont &&
        state.appBg === prev.appBg
      ) return;
      if (skipNextThemeChange.current) return;

      if (themeDebounceTimer.current) clearTimeout(themeDebounceTimer.current);
      themeDebounceTimer.current = setTimeout(() => {
        void (async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const s = useBoardStore.getState();
          await supabase.from("profiles").upsert({
            id: user.id,
            theme_vars: s.themeVars,
            app_font: s.appFont,
            app_bg: s.appBg,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });
        })();
      }, THEME_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (themeDebounceTimer.current) clearTimeout(themeDebounceTimer.current);
    };
  }, []);

  // ── Server board operations ───────────────────────────────────────────────

  const loadServerBoard = useCallback(async (boardId: string, serverId: string) => {
    if (!isSupabaseReady()) return;

    const existing = useBoardStore.getState().serverBoards[boardId];
    if ((existing?.boxes?.length ?? 0) > 0 || (existing?.boardItems?.length ?? 0) > 0) return;

    const { data, error } = await supabase
      .from("boards")
      .select("id, data")
      .eq("id", boardId)
      .eq("server_id", serverId)
      .maybeSingle();

    if (error) { console.error("[BoardSync] loadServerBoard failed:", error); return; }

    if (data) {
      const board: Board = {
        ...(data.data as Record<string, unknown>),
        id: data.id as string,
      } as Board;
      // Use setState directly — injectServerBoards has a no-overwrite guard that
      // discards boxes for boards that already exist (e.g. after stub injection).
      useBoardStore.setState((s) => ({
        serverBoards: { ...s.serverBoards, [board.id]: board },
      }));
    }
  }, []);

  const saveServerBoard = useCallback(async (boardId: string, serverId: string) => {
    if (!isSupabaseReady()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const board = useBoardStore.getState().serverBoards[boardId];
    if (!board) return;

    const { id, ...rest } = board;
    const { error } = await supabase
      .from("boards")
      .upsert({ id, server_id: serverId, data: rest }, { onConflict: "id" });
    if (error) console.error("[BoardSync] saveServerBoard failed:", error);
  }, []);

  // Replace the working draft with a copy of the latest published (live) version,
  // so editors can discard draft changes and start over from what's live.
  const revertDraftToLive = useCallback(async (boardId: string, serverId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };
    const { data, error } = await supabase
      .from("server_publishes")
      .select("snapshot")
      .eq("server_id", serverId)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No published live version to revert to yet." };

    const snapshot = data.snapshot as Record<string, unknown>;
    useBoardStore.setState((s) => ({
      serverBoards: {
        ...s.serverBoards,
        [boardId]: {
          ...snapshot,
          id: boardId,
          boxes: ((snapshot.boxes ?? []) as Record<string, unknown>[]).map((b) => ({ ...b })),
          boardItems: ((snapshot.boardItems ?? []) as Record<string, unknown>[]).map((i) => ({ ...i })),
        } as unknown as Board,
      },
    }));
    await saveServerBoard(boardId, serverId);
    return { success: true };
  }, [saveServerBoard]);

  const loadLiveBoard = useCallback(async (boardId: string, serverId: string): Promise<boolean> => {
    if (!isSupabaseReady()) return false;

    const { data, error } = await supabase
      .from("server_publishes")
      .select("snapshot")
      .eq("server_id", serverId)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const isMissing =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache") ||
        error.code === "42P01";
      if (!isMissing) console.error("[BoardSync] loadLiveBoard failed:", error.message);
      return false;
    }
    if (!data) return false;

    const snapshot = data.snapshot as Record<string, unknown>;
    const liveBoardId = boardId + ":live";
    const liveBoard: Board = { ...snapshot, id: liveBoardId } as Board;
    // Always overwrite the live slot so re-entering always shows the latest publish
    useBoardStore.setState((s) => ({
      serverBoards: { ...s.serverBoards, [liveBoardId]: liveBoard },
    }));
    return true;
  }, []);

  const publishServerBoard = useCallback(async (
    boardId: string,
    serverId: string,
    userId: string,
    publisherName: string,
    message?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };

    const draftBoard = useBoardStore.getState().serverBoards[boardId];
    if (!draftBoard) return { success: false, error: "Draft board not found" };

    const { id: _id, ...snapshot } = draftBoard;

    const { error } = await supabase.from("server_publishes").insert({
      server_id: serverId,
      snapshot,
      message: message || null,
      published_by: userId || null,
      publisher_name: publisherName,
    });

    if (error) {
      const isMissing =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache") ||
        error.code === "42P01";
      if (!isMissing) console.error("[BoardSync] publishServerBoard failed:", error.message);
      return { success: false, error: isMissing ? "migration_missing" : error.message };
    }

    // Update the in-memory live slot immediately so viewers see the new snapshot
    const liveBoardId = boardId + ":live";
    const liveBoard: Board = { ...draftBoard, id: liveBoardId };
    useBoardStore.setState((s) => ({
      serverBoards: { ...s.serverBoards, [liveBoardId]: liveBoard },
    }));

    // Post an activity message into the board's #general channel. author_id must
    // be the caller (RLS), but author_name="System" renders it as an event line.
    if (userId) {
      void supabase.from("board_chat_messages").insert({
        item_id: "system",
        board_id: boardId,
        channel: "general",
        author_id: userId,
        author_name: "System",
        author_avatar: "📣",
        content: `${publisherName} published a new version${message ? `: ${message}` : ""}`,
      });
    }
    return { success: true };
  }, []);

  const fetchPublishSnapshot = useCallback(async (publishId: string): Promise<Record<string, unknown> | null> => {
    if (!isSupabaseReady()) return null;
    const { data, error } = await supabase
      .from("server_publishes")
      .select("snapshot")
      .eq("id", publishId)
      .single();
    if (error || !data) return null;
    return data.snapshot as Record<string, unknown>;
  }, []);

  const rollbackToPublish = useCallback(async (
    boardId: string,
    serverId: string,
    publishId: string,
    userId: string,
    publisherName: string,
    originalAt: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };

    const { data: snapData, error: snapError } = await supabase
      .from("server_publishes")
      .select("snapshot")
      .eq("id", publishId)
      .single();

    if (snapError || !snapData) {
      return { success: false, error: snapError?.message ?? "Snapshot not found" };
    }

    const snapshot = snapData.snapshot as Record<string, unknown>;
    const dateStr = new Date(originalAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const { error: insertError } = await supabase.from("server_publishes").insert({
      server_id: serverId,
      snapshot,
      message: `Rolled back to ${dateStr}`,
      published_by: userId || null,
      publisher_name: publisherName,
    });

    if (insertError) {
      const isMissing =
        insertError.message.includes("schema cache") ||
        insertError.message.includes("does not exist") ||
        insertError.code === "42P01";
      return { success: false, error: isMissing ? "migration_missing" : insertError.message };
    }

    // Update the in-memory live slot immediately
    const liveBoardId = boardId + ":live";
    const liveBoard: Board = { ...snapshot, id: liveBoardId } as Board;
    useBoardStore.setState((s) => ({
      serverBoards: { ...s.serverBoards, [liveBoardId]: liveBoard },
    }));
    return { success: true };
  }, []);

  const fetchServerBackups = useCallback(async (serverId: string): Promise<{ backups: ServerBackup[]; error: string | null }> => {
    if (!isSupabaseReady()) return { backups: [], error: null };
    const { data, error } = await supabase
      .from("server_backups")
      .select("id, slot, label, creator_name, created_at")
      .eq("server_id", serverId)
      .order("slot", { ascending: true });
    if (error) {
      const isMissing =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache") ||
        error.code === "42P01";
      return { backups: [], error: isMissing ? "migration_missing" : error.message };
    }
    return {
      backups: (data ?? []).map((row) => ({
        id: row.id as string,
        slot: row.slot as 1 | 2 | 3,
        label: row.label as string | null,
        creatorName: row.creator_name as string,
        createdAt: row.created_at as string,
      })),
      error: null,
    };
  }, []);

  const createBackup = useCallback(async (
    boardId: string,
    serverId: string,
    slot: number,
    label: string,
    userId: string,
    creatorName: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };
    const draftBoard = useBoardStore.getState().serverBoards[boardId];
    if (!draftBoard) return { success: false, error: "Board not found" };
    const { id: _id, ...snapshot } = draftBoard;
    const { error } = await supabase
      .from("server_backups")
      .upsert({
        server_id: serverId,
        slot,
        label: label.trim() || null,
        snapshot,
        created_by: userId || null,
        creator_name: creatorName,
        created_at: new Date().toISOString(),
      }, { onConflict: "server_id,slot" });
    if (error) {
      const isMissing =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache") ||
        error.code === "42P01";
      return { success: false, error: isMissing ? "migration_missing" : error.message };
    }
    return { success: true };
  }, []);

  const restoreFromBackup = useCallback(async (
    boardId: string,
    _serverId: string,
    backupId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };
    const { data, error } = await supabase
      .from("server_backups")
      .select("snapshot")
      .eq("id", backupId)
      .single();
    if (error || !data) return { success: false, error: error?.message ?? "Backup not found" };
    const snapshot = data.snapshot as Record<string, unknown>;
    useBoardStore.setState((s) => ({
      serverBoards: {
        ...s.serverBoards,
        [boardId]: {
          ...snapshot,
          id: boardId,
          boxes: ((snapshot.boxes ?? []) as Record<string, unknown>[]).map((b) => ({ ...b })),
          boardItems: ((snapshot.boardItems ?? []) as Record<string, unknown>[]).map((i) => ({ ...i })),
        } as unknown as Board,
      },
    }));
    return { success: true };
  }, []);

  const deleteBackup = useCallback(async (backupId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseReady()) return { success: false, error: "Supabase not configured" };
    const { error } = await supabase.from("server_backups").delete().eq("id", backupId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  return (
    <BoardSyncContext.Provider value={{ loadServerBoard, saveServerBoard, revertDraftToLive, loadLiveBoard, publishServerBoard, fetchPublishSnapshot, rollbackToPublish, fetchServerBackups, createBackup, restoreFromBackup, deleteBackup, saveStatus, saveError }}>
      {children}
    </BoardSyncContext.Provider>
  );
}
