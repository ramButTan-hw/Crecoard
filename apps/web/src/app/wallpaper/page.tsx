"use client";

/**
 * Cast mode — a board "casted" over the desktop: fullscreen, chrome-less,
 * pinned to the bottom of the z-order by the Electron main process
 * (wallpaper-ish), but fully INTERACTIVE.
 *
 * Use-only contract:
 *  - Items respond to real input: check boxes, type text, chat, pet the pet.
 *  - Structure is locked: the board id is registered in readonlyBoardIds, so
 *    layout editing (move/resize/add/delete blocks) is disabled — that stays
 *    in the real app. No app chrome renders here.
 *  - Writes sync through BoardSyncProvider (Supabase) for signed-in users;
 *    localStorage persistence stays disabled so this partial window never
 *    clobbers the main app's local cache. Guest interactions are session-only.
 *  - Escape exits the cast.
 */

import { useEffect, useState } from "react";
import { Pin, Minus, X } from "lucide-react";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import { ExpandedBlock } from "@/components/board/ExpandedBlock";
import { useBoardStore, type Board } from "@/store/boardStore";
import { UserProvider } from "@/contexts/UserContext";
import { ServersProvider } from "@/contexts/ServersContext";
import { supabase } from "@/lib/supabase";

function loadCachedBoards(): { boards: Board[]; activeBoardId: string } | null {
  try {
    const uid = localStorage.getItem("plancraft-last-user-id");
    const keys = uid ? [`plancraft-boards-v1-${uid}`, "plancraft-boards-v1"] : ["plancraft-boards-v1"];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { boards: Board[]; activeBoardId: string };
      if (Array.isArray(parsed.boards) && parsed.boards.length > 0) return parsed;
    }
  } catch {}
  return null;
}

/** Persist cast-window interactions (checked boxes, typed text) for signed-in users. */
async function saveCastBoard(board: Board) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("placeholder")) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // guests: interactions are session-only
    await supabase
      .from("boards")
      .update({ data: board, updated_at: new Date().toISOString() })
      .eq("id", board.id);
  } catch {}
}

/** Cache miss (common for signed-in users) → fetch by id over the shared session. RLS scopes access. */
async function fetchBoardFromSupabase(boardId: string): Promise<Board | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("placeholder")) return null;
    const { data } = await supabase.from("boards").select("data").eq("id", boardId).maybeSingle();
    const board = (data?.data ?? null) as Board | null;
    return board && Array.isArray(board.boxes) ? board : null;
  } catch {
    return null;
  }
}

/** Frame the whole board: zoom/pan so all content fits the viewport. */
function fitBoard(board: Board) {
  const rects = [
    ...board.boxes.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
    ...(board.boardItems ?? []).map((i) => ({ x: i.boardX, y: i.boardY, w: i.boardW, h: i.boardH })),
  ];
  if (rects.length === 0) return;
  const minX = Math.min(...rects.map((r) => r.x)) - 80;
  const minY = Math.min(...rects.map((r) => r.y)) - 80;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + 80;
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + 80;
  const zoom = Math.max(0.3, Math.min(1.4, Math.min(window.innerWidth / (maxX - minX), window.innerHeight / (maxY - minY))));
  const panX = (window.innerWidth - (maxX - minX) * zoom) / 2 - minX * zoom;
  const panY = (window.innerHeight - (maxY - minY) * zoom) / 2 - minY * zoom;
  useBoardStore.setState({ zoom, panOffset: { x: panX, y: panY } } as never);
}

/** Dev diagnosis: the URL itself is the payload — the dev server logs every request. */
function beacon(info: Record<string, string | number>) {
  try {
    if (window.location.protocol === "file:") return;
    const qs = Object.entries(info).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    void fetch(`/__wallpaper-status?${qs}`);
  } catch {}
}

export default function WallpaperPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [detail, setDetail] = useState("");
  const [boardName, setBoardName] = useState("");
  // Brief splash so the window isn't a blank flash while the board mounts.
  const [splash, setSplash] = useState(true);
  const [onTop, setOnTop] = useState(false);
  // Enlarging a block sets expandedBoxId; the ExpandedBlock overlay lives in
  // AppShell in the main app, so the pop-out must mount its own.
  const expandedBoxId = useBoardStore((s) => s.expandedBoxId);

  useEffect(() => {
    // Data-layer kill switch: this window must never write the user's boards back.
    useBoardStore.setState({ persistBoards: () => {} } as never);

    const requested = new URLSearchParams(window.location.search).get("board");
    let cancelled = false;

    (async () => {
      const cached = loadCachedBoards();
      const cacheBoard: Board | null =
        cached?.boards.find((b) => b.id === requested && !b.deletedAt) ?? null;
      // The local cache can be stale (the app loads fresh from Supabase but only
      // re-persists locally on changes) — fetch both and keep whichever is NEWER.
      const remoteBoard = requested ? await fetchBoardFromSupabase(requested) : null;

      let board: Board | null;
      let source: string;
      if (cacheBoard && remoteBoard) {
        const newer = (remoteBoard.updatedAt ?? 0) >= (cacheBoard.updatedAt ?? 0) ? remoteBoard : cacheBoard;
        board = newer;
        source = newer === remoteBoard ? "supabase(newer)" : "cache(newer)";
      } else if (remoteBoard) {
        board = remoteBoard; source = "supabase";
      } else if (cacheBoard) {
        board = cacheBoard; source = "cache";
      } else {
        board =
          cached?.boards.find((b) => b.id === cached.activeBoardId && !b.deletedAt) ??
          cached?.boards.find((b) => !b.deletedAt) ??
          null;
        source = "cache-fallback";
      }
      if (cancelled) return;

      if (!board) {
        const d = `requested: ${requested ?? "none"} · local cache: ${cached ? `${cached.boards.length} board(s)` : "empty"} · remote fetch: no access or not found`;
        setDetail(d);
        setStatus("empty");
        beacon({ s: "empty", req: requested ?? "none", cache: cached?.boards.length ?? 0, d });
        return;
      }

      const boxCount = board.boxes.length;
      const canvasCount = board.boardItems?.length ?? 0;
      // Fully functional pop-out: clear any read-only lock so blocks expand,
      // resize, and edit exactly like the main app.
      useBoardStore.setState({ boards: [board], activeBoardId: board.id, readonlyBoardIds: [] });
      fitBoard(board);
      setBoardName(board.name || "Untitled");
      setStatus("ready");
      beacon({ s: "ready", n: board.name || "Untitled", src: source, boxes: boxCount, canvasItems: canvasCount });
      setTimeout(() => setSplash(false), 1500);
    })();

    // Escape closes the pop-out
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void window.electron?.clearWallpaper?.();
    };
    // Re-fit the board whenever the pop-out window is resized
    const onResize = () => {
      const b = useBoardStore.getState().boards[0];
      if (b) fitBoard(b);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Debounced save of interactions — targeted at this one board, no provider
  // merges that could replace the seeded board with a stale copy.
  useEffect(() => {
    if (status !== "ready") return;
    const boardId = useBoardStore.getState().activeBoardId;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useBoardStore.subscribe((s, prev) => {
      const next = s.boards.find((b) => b.id === boardId);
      const before = prev.boards.find((b) => b.id === boardId);
      if (!next || next === before) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void saveCastBoard(next); }, 2500);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [status]);

  if (status !== "ready") {
    // Deliberately loud — this renders on a desktop, not in a tab; tiny gray
    // text is indistinguishable from a black wallpaper.
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3" style={{ background: "#0d0e11" }}>
        <p style={{ color: "#d59ee8", fontSize: 28, fontWeight: 600 }}>
          {status === "loading" ? "Loading board…" : "Crecoard: no board to display"}
        </p>
        {status === "empty" && (
          <p style={{ color: "#8b8d99", fontSize: 15, maxWidth: 640, textAlign: "center" }}>{detail}</p>
        )}
      </div>
    );
  }

  const dragRegion = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
  const barBtn: React.CSSProperties = {
    ...noDrag, width: 26, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6, color: "#c9cad3", fontSize: 13, cursor: "pointer", background: "transparent", border: "none",
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.55))",
  };

  return (
    <UserProvider>
      <ServersProvider>
        {/* Pop-out: a slim draggable titlebar (the window is borderless) over the
            interactive board. `flex` on the board row is load-bearing — BoardCanvas's
            root is flex-1 and collapses to zero height without a flex parent. */}
        <div className="relative h-screen w-screen overflow-hidden">
          {/* Interactive board fills the whole window — the titlebar floats over it. */}
          <div className="absolute inset-0 flex overflow-hidden">
            <BoardCanvas />
            {/* Enlarged-block overlay (rendered by AppShell in the main app) */}
            {expandedBoxId && <ExpandedBlock boxId={expandedBoxId} />}
          </div>

          {/* Glass titlebar — frosted + fading into the board for an immersive pop-out.
              Auto-hides to a peek strip; full bar on hover. */}
          <div
            className="group/titlebar"
            style={{ ...dragRegion, position: "absolute", top: 0, left: 0, right: 0, zIndex: 50, height: 34,
              display: "flex", alignItems: "center", gap: 8, padding: "0 8px",
              background: "linear-gradient(to bottom, rgba(13,14,17,0.5), rgba(13,14,17,0.08))",
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              opacity: 0.35, transition: "opacity 0.2s", userSelect: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
          >
            <div style={{ flex: 1 }} />
            <button style={{ ...barBtn, color: onTop ? "#e0b8f0" : "#c9cad3" }} title={onTop ? "Unpin from top" : "Keep on top"}
              onClick={async () => { const v = await window.electron?.popoutToggleTop?.(); setOnTop(!!v); }}>
              <Pin size={13} fill={onTop ? "currentColor" : "none"} />
            </button>
            <button style={barBtn} title="Minimize" onClick={() => void window.electron?.popoutMinimize?.()}>
              <Minus size={14} />
            </button>
            <button style={{ ...barBtn }} title="Close (Esc)"
              onMouseEnter={(e) => (e.currentTarget.style.color = "#eb5757")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#c9cad3")}
              onClick={() => void window.electron?.clearWallpaper?.()}>
              <X size={14} />
            </button>
          </div>

          {splash && (
            <div
              style={{
                position: "absolute", inset: 0, zIndex: 60, pointerEvents: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "opacity 0.6s", background: "rgba(13,14,17,0.4)",
              }}
            >
              <p style={{ color: "#d59ee8", fontSize: 40, fontWeight: 700 }}>{boardName}</p>
            </div>
          )}
        </div>
      </ServersProvider>
    </UserProvider>
  );
}
