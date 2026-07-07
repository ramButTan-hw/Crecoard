"use client";

import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { X, Hash, Plus, Search, Pin, LocateFixed, ArrowLeft } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import type { BlockItem } from "@/store/boardStore";
import { supabase } from "@/lib/supabase";
import { useNotifications } from "@/contexts/NotificationContext";
import { chatKeyFor, useBoardChat } from "@/contexts/BoardChatContext";
import { ChatBlock } from "@/components/items/ChatBlock";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVisualViewportHeight } from "@/hooks/useVisualViewport";
import { cn } from "@/lib/utils";

/**
 * Slide-out chat panel for a board: lists the board's channels (with unread)
 * and shows the selected channel's conversation — so chat has a home and isn't
 * something you have to hunt for on the canvas.
 */
export function ChatDrawer({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const board = useBoardStore((s) => s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId]);
  const addChatChannel = useBoardStore((s) => s.addChatChannel);
  const { unread } = useNotifications();
  const { togglePin } = useBoardChat();
  const [newName, setNewName] = useState("");
  const [active, setActive] = useState("general");
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; channel: string; author: string; content: string; ts: string }[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState<{ id: string; author: string; content: string; gif?: string; image?: string; ts: string }[]>([]);
  const isMobile = useIsMobile();
  // Mobile only: whether the full-screen conversation view is open (vs the channel list).
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  // Shrink the full-screen panel to the visual viewport so the composer stays above
  // the on-screen keyboard instead of being covered by it.
  const vvHeight = useVisualViewportHeight(isMobile);

  // Search this board's chat history (across channels).
  useEffect(() => {
    if (!searching) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("board_chat_messages")
        .select("id, channel, author_name, content, created_at")
        .eq("board_id", boardId)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      setSearchResults((data ?? []).map((r) => ({
        id: r.id as string,
        channel: (r.channel as string) ?? "general",
        author: r.author_name as string,
        content: r.content as string,
        ts: r.created_at as string,
      })));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searching, boardId]);

  const channels = useMemo(() => {
    const set = new Set<string>(["general", ...(board?.chatChannels ?? [])]);
    board?.boxes?.forEach((box) =>
      box.items?.forEach((it) => { if (it.type === "chat") set.add(it.chatChannelName ?? "general"); })
    );
    board?.boardItems?.forEach((it) => { if (it.type === "chat") set.add(it.chatChannelName ?? "general"); });
    return [...set];
  }, [board]);

  // Map of channel → the on-canvas element id (box id, or board-level item id) of
  // its chat block, so the drawer can show which channels live on the board and
  // jump straight to them. A channel is allowed on the board at most once.
  const channelOnBoard = useMemo(() => {
    const map = new Map<string, string>();
    board?.boxes?.forEach((box) => box.items?.forEach((it) => {
      if (it.type === "chat") { const ch = it.chatChannelName ?? "general"; if (!map.has(ch)) map.set(ch, box.id); }
    }));
    board?.boardItems?.forEach((it) => {
      if (it.type === "chat") { const ch = it.chatChannelName ?? "general"; if (!map.has(ch)) map.set(ch, it.id); }
    });
    return map;
  }, [board]);

  const jumpToChannel = (ch: string) => {
    const id = channelOnBoard.get(ch);
    if (!id) return;
    window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boxId: id } }));
    onClose();
  };

  // Drop a chat block for this channel onto the board, centered in the current
  // viewport, then jump to it — completes the launcher loop for off-board channels.
  const addToBoard = (ch: string) => {
    const id = nanoid();
    const st = useBoardStore.getState();
    const W = 320, H = 360;
    const cx = (window.innerWidth / 2 - st.panOffset.x) / st.zoom;
    const cy = (window.innerHeight / 2 - st.panOffset.y) / st.zoom;
    const snap = (v: number) => Math.round(v / 20) * 20;
    st.addBoardItem(boardId, {
      id,
      type: "chat",
      chatChannelName: ch,
      showInCollapsed: false,
      boardX: Math.max(0, snap(cx - W / 2)),
      boardY: Math.max(0, snap(cy - H / 2)),
      boardW: W,
      boardH: H,
    });
    window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boxId: id } }));
    onClose();
  };

  const activeChannel = channels.includes(active) ? active : channels[0] ?? "general";
  const syntheticItem = { id: `drawer-${activeChannel}`, type: "chat", showInCollapsed: false, chatChannelName: activeChannel } as BlockItem;

  // Load this channel's pinned messages whenever the Pins panel is open.
  useEffect(() => {
    if (!showPins) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("board_chat_messages")
        .select("id, author_name, content, gif_url, image_url, pinned_at")
        .eq("board_id", boardId)
        .eq("channel", activeChannel)
        .eq("pinned", true)
        .order("pinned_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setPins((data ?? []).map((r) => ({
        id: r.id as string,
        author: r.author_name as string,
        content: r.content as string,
        gif: (r.gif_url as string | null) ?? undefined,
        image: (r.image_url as string | null) ?? undefined,
        ts: r.pinned_at as string,
      })));
    })();
    return () => { cancelled = true; };
  }, [showPins, activeChannel, boardId]);

  const unpin = (id: string) => {
    void togglePin(id, boardId, activeChannel, false);
    setPins((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    addChatChannel(boardId, name);
    const clean = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (clean) setActive(clean);
    setNewName("");
  };

  return (
    <div
      className="fixed right-0 top-0 z-[1100] flex h-full w-full flex-col border-l border-[var(--border)] shadow-2xl pt-safe md:w-[380px]"
      style={{ background: "var(--surface-raised)", ...(isMobile && vvHeight ? { height: vvHeight } : {}) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        {isMobile && mobileChatOpen ? (
          <button onClick={() => setMobileChatOpen(false)} className="-ml-1 flex items-center gap-1 text-sm font-semibold text-[var(--text-primary)]">
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <span className="text-sm font-semibold text-[var(--text-primary)]">{isMobile ? "Chat" : "Channels"}</span>
        )}
        <div className="flex items-center gap-0.5">
          <button onClick={() => { setShowPins((v) => !v); setSearching(false); }} title="Pinned messages" className={cn("rounded p-1 transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]", showPins ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
            <Pin size={15} />
          </button>
          <button onClick={() => { setSearching((v) => !v); setSearchQuery(""); setShowPins(false); }} className={cn("rounded p-1 transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]", searching ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
            <Search size={15} />
          </button>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {searching ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--border)] p-2">
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="w-full rounded-lg bg-[var(--surface-overlay)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {searchResults.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--text-muted)]">{searchQuery.trim().length < 2 ? "Type to search this board's messages." : "No matches."}</p>
            ) : searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSearching(false);
                  if (isMobile) { setActive(r.channel); setMobileChatOpen(true); }
                  else if (channelOnBoard.has(r.channel)) jumpToChannel(r.channel);
                  else addToBoard(r.channel);
                }}
                className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-overlay)]"
              >
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <Hash size={10} />{r.channel} · {r.author} · {new Date(r.ts).toLocaleDateString()}
                </span>
                <span className="truncate text-sm text-[var(--text-secondary)]">{r.content || "(attachment)"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : showPins ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
            <Pin size={12} className="text-[var(--accent)]" />
            <span>Pinned in</span>
            <Hash size={11} />
            <span className="font-semibold text-[var(--text-primary)]">{activeChannel}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {pins.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--text-muted)]">No pinned messages in this channel yet.</p>
            ) : pins.map((p) => (
              <div key={p.id} className="group flex items-start gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--surface-overlay)]">
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                    {p.author} · {new Date(p.ts).toLocaleDateString()}
                  </span>
                  <span className="block truncate text-sm text-[var(--text-secondary)]">
                    {p.content || (p.gif ? "(GIF)" : p.image ? "(image)" : "(attachment)")}
                  </span>
                </div>
                <button
                  onClick={() => unpin(p.id)}
                  title="Unpin"
                  className="mt-0.5 hidden shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] group-hover:block"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (isMobile && mobileChatOpen) ? (
        /* Mobile: full-screen conversation (ChatBlock has its own #channel header) */
        <div className="min-h-0 flex-1">
          <ChatBlock key={activeChannel} item={syntheticItem} boardId={boardId} boxId="" expanded />
        </div>
      ) : (
      <>
      {/* Channel directory — launcher on desktop (jump / add to board), full-screen
          chat destination on mobile (tap to open). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Channels{!isMobile && <span className="ml-1 normal-case text-[var(--text-muted)]">· click to open on the board</span>}
        </p>
        {channels.map((ch) => {
          const count = unread[chatKeyFor(boardId, ch)] ?? 0;
          const onBoard = channelOnBoard.has(ch);
          const onRowClick = () => {
            if (isMobile) { setActive(ch); setMobileChatOpen(true); }
            else if (onBoard) jumpToChannel(ch);
            else addToBoard(ch);
          };
          return (
            <div
              key={ch}
              className="group/ch flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
            >
              <button
                onClick={onRowClick}
                title={isMobile ? "Open chat" : onBoard ? "Jump to this chat on the board" : "Add this chat to the board"}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Hash size={13} className={cn("shrink-0", onBoard ? "text-[var(--accent)]" : "text-[var(--text-muted)]")} />
                <span className={cn("flex-1 truncate", !onBoard && !isMobile && "text-[var(--text-muted)]")}>{ch}</span>
                {!onBoard && <span className="shrink-0 rounded bg-[var(--surface-overlay)] px-1 text-[8px] uppercase tracking-wide text-[var(--text-muted)]">off board</span>}
              </button>
              {count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
              {/* On mobile the row opens chat, so surface jump/add as explicit quick
                  actions. On desktop the row already jumps/adds — show a hover hint. */}
              {isMobile ? (
                <button
                  onClick={() => (onBoard ? jumpToChannel(ch) : addToBoard(ch))}
                  title={onBoard ? "Jump to this chat on the board" : "Add this chat to the board"}
                  className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  {onBoard ? <LocateFixed size={15} /> : <Plus size={15} />}
                </button>
              ) : (
                <span className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/ch:opacity-100">
                  {onBoard ? <LocateFixed size={13} /> : <Plus size={13} />}
                </span>
              )}
            </div>
          );
        })}
        <div className="mt-1 flex items-center gap-1.5 px-2">
          <Plus size={13} className="shrink-0 text-[var(--text-muted)]" />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="New channel…"
            className="flex-1 bg-transparent py-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>
      </>
      )}
    </div>
  );
}
