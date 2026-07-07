"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Send, Smile, ImageIcon, X, Pin, Search, Plus, Bell, BellOff, AtSign, Check, Pencil, Trash2, Reply, MoreHorizontal } from "lucide-react";
import type { BlockItem, Board, ChatMessage } from "@/store/boardStore";
import { useBoardStore } from "@/store/boardStore";
import { useServers } from "@/contexts/ServersContext";
import { useBoardChatItem, useBoardChat } from "@/contexts/BoardChatContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useUser } from "@/contexts/UserContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { uploadFile, uploadDataUrl } from "@/lib/storage";
import { useCanEditBoard, useServerBoard } from "@/contexts/ServerBoardContext";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "@/components/messaging/EmojiPicker";
import { GifPicker } from "@/components/messaging/GifPicker";

function formatDateDivider(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** Short plaintext snippet of a message, for reply previews. Strips mention/box tags. */
function replySnippet(m: ChatMessage): string {
  const raw = (m.content ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (raw) return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
  if (m.gif) return "GIF";
  if (m.image) return "Photo";
  return "message";
}

const MENTION_TOKEN = /<@([0-9a-fA-F-]{36})>/g;

/** Extract user ids referenced by <@id> mention tokens in a message. */
function mentionIds(content: string): string[] {
  return [...content.matchAll(MENTION_TOKEN)].map((m) => m[1]!);
}

// Render @mentions. Id tokens (<@uuid>) resolve to the user's *current* name;
// plain @text is highlighted too. The current user's own mention is emphasized.
function renderMessageContent(
  content: string,
  myUserId: string,
  myName: string,
  resolve: (id: string) => string | undefined,
  resolveBox: (boardId: string | undefined, id: string) => string | undefined,
  mentionColor: string = "var(--accent)",
  inverted = false, // rendering on an accent-colored bubble — accent text would vanish
): React.ReactNode {
  const parts = content.split(/(<@[0-9a-fA-F-]{36}>|<box:[A-Za-z0-9_|\-]+>|@[A-Za-z0-9_.\-]+|https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--accent)] underline hover:opacity-80">
          {part}
        </a>
      );
    }
    const boxTok = part.match(/^<box:([A-Za-z0-9_\-]+)(?:\|([A-Za-z0-9_\-]+))?>$/);
    if (boxTok) {
      const boxBoardId = boxTok[2] ? boxTok[1]! : undefined;
      const id = boxTok[2] ?? boxTok[1]!;
      return (
        <button
          key={i}
          onClick={() => window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boardId: boxBoardId, boxId: id } }))}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-[var(--accent)]/15 px-1.5 align-baseline font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/25"
        >
          ▦ {resolveBox(boxBoardId, id) ?? "board item"}
        </button>
      );
    }
    let name: string | null = null;
    let isMe = false;
    const token = part.match(/^<@([0-9a-fA-F-]{36})>$/);
    if (token) {
      const id = token[1]!;
      name = resolve(id) ?? "user";
      isMe = id === myUserId;
    } else if (part.startsWith("@") && part.length > 1) {
      name = part.slice(1);
      isMe = !!myName && name.toLowerCase() === myName.toLowerCase();
    }
    if (name !== null) {
      const style: React.CSSProperties = inverted
        ? { background: isMe ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)", color: "#fff" }
        : isMe
          ? { background: `color-mix(in srgb, ${mentionColor} 25%, transparent)`, color: mentionColor }
          : { color: mentionColor };
      return (
        <span key={i} className={isMe ? "rounded px-0.5 font-semibold" : "rounded px-0.5 font-medium"} style={style}>
          @{name}
        </span>
      );
    }
    return part;
  });
}

// A readable label for a board-level item (which has no title of its own).
function itemLabel(it: BlockItem): string {
  if (it.type === "text" && it.text) return it.text.replace(/\s+/g, " ").trim().slice(0, 24) || "Text";
  if (it.type === "chat") return `#${it.chatChannelName ?? "general"} chat`;
  if (it.type === "list" && it.listTitle) return it.listTitle;
  return it.type.charAt(0).toUpperCase() + it.type.slice(1);
}

/** Group a message's raw reactions into { emoji, count, mine } for display. */
function groupReactions(
  rx: { userId: string; emoji: string }[] | undefined,
  myId: string,
): { emoji: string; count: number; mine: boolean }[] {
  if (!rx || rx.length === 0) return [];
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rx) {
    const g = map.get(r.emoji) ?? { count: 0, mine: false };
    g.count++;
    if (r.userId === myId) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.entries()].map(([emoji, g]) => ({ emoji, count: g.count, mine: g.mine }));
}

interface ChatBlockProps {
  item: BlockItem;
  boardId: string;
  boxId: string;
  /** When true we're inside the full-screen ExpandedBlock view */
  expanded?: boolean;
}

export function ChatBlock({ item, boardId, expanded = false }: ChatBlockProps) {
  const { identity } = useUser();
  const profiles = useProfiles();
  const channelName = item.chatChannelName ?? "general";
  // Chat is one continuous stream per board. The server "live" view uses a
  // boardId of `<id>:live`, so strip it — draft and live share the same channel.
  const chatBoardId = boardId.replace(/:live$/, "");
  // Server roster (if this board belongs to a server) — lets you @mention any
  // member, not just people who've already chatted.
  const serverId = useBoardStore((s) => (s.serverBoards[chatBoardId] ?? s.boards.find((b) => b.id === chatBoardId))?.serverId);
  const { serverMembers } = useServers();
  const roster = serverId ? (serverMembers[serverId] ?? []) : [];
  const { messages, loading: chatLoading, send, chatKey, loadOlder, reactions, toggleReaction, togglePin, notifPref, setNotifPref, editOwnMessage, deleteOwnMessage } = useBoardChatItem(item.id, chatBoardId, channelName);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);

  // Scroll to (and briefly highlight) the message a reply points at.
  const jumpToMessage = (id?: string) => {
    if (!id) return;
    const el = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background-color 0.2s";
    el.style.backgroundColor = "color-mix(in srgb, var(--accent) 22%, transparent)";
    setTimeout(() => { el.style.backgroundColor = ""; }, 900);
  };
  const serverPref = useBoardChat().notifPrefs[`server::${serverId}`];

  // One-time heal: legacy chat backgrounds were stored as inline data URLs — a
  // single wallpaper could fill the whole localStorage quota ("Storage is full")
  // and bloat every publish. Editors upload it to storage and swap in the URL.
  const canEditBoardForHeal = useCanEditBoard();
  // Moderation: server owners/admins can delete anyone's message
  // (enforced server-side by the board_chat_delete_moderator RLS policy).
  const { viewerRole } = useServerBoard();
  const canModerate = !!serverId && (viewerRole === "owner" || viewerRole === "admin");
  useEffect(() => {
    const img = item.chatBgImage;
    if (!img?.startsWith("data:") || !canEditBoardForHeal || boardId.endsWith(":live")) return;
    let cancelled = false;
    void uploadDataUrl(img, identity.userId, "wallpapers", "chat-bg.png").then((url) => {
      if (cancelled || !url) return;
      const s = useBoardStore.getState();
      const board = s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId];
      if (!board) return;
      if (board.boardItems?.some((i) => i.id === item.id)) {
        s.updateBoardItem(boardId, item.id, { chatBgImage: url });
      } else {
        const box = board.boxes.find((bx) => bx.items.some((i) => i.id === item.id));
        if (box) s.updateItem(boardId, box.id, item.id, { chatBgImage: url });
      }
      s.persistBoards();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.chatBgImage, canEditBoardForHeal, boardId, item.id]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Which message currently has its reaction emoji-picker open.
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  // In-chat search (filters the loaded messages in this channel).
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  // Attachments ("+") popover — groups GIF + image upload so the input bar stays
  // compact when the chat box is scaled down narrow.
  const [showAttach, setShowAttach] = useState(false);

  const handleLoadOlder = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const count = await loadOlder(messages[0]!.timestamp);
    if (count < 100) setAllLoaded(true);
    setLoadingOlder(false);
  };
  const { unread, registerActive, unregisterActive, markRead } = useNotifications();
  const unreadCount = unread[chatKey] ?? 0;

  // Keep everyone's current profile (name + avatar) cached, so messages reflect
  // live profile changes instead of the snapshot taken when each was sent.
  useEffect(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.authorId && m.authorName !== "System") ids.add(m.authorId);
      for (const id of mentionIds(m.content)) ids.add(id);
    }
    for (const m of roster) if (m.userId) ids.add(m.userId);
    if (ids.size) profiles.ensure([...ids]);
  }, [messages, roster, profiles]);

  // Register this channel as "active" (visible) — suppresses toasts while open
  useEffect(() => {
    registerActive(chatKey);
    return () => unregisterActive(chatKey);
  }, [chatKey, registerActive, unregisterActive]);

  // Mark read whenever expanded view opens
  useEffect(() => {
    if (expanded) markRead(chatKey);
  }, [expanded, chatKey, markRead]);

  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; dataUrl: string; name: string } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── @mention autocomplete ─────────────────────────────────────────────────
  // Selected mentions are encoded as <@id> on send so they reference a specific
  // user (display names aren't unique).
  const pendingMentions = useRef<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStart = useRef(0);

  const mentionCandidates = useMemo(() => {
    const map = new Map<string, { id: string; name: string; handle?: string; avatar?: string }>();
    const add = (id: string, fallbackName: string, fallbackAvatar?: string) => {
      if (!id || id === identity.userId || map.has(id)) return;
      const p = profiles.get(id);
      map.set(id, { id, name: p?.displayName ?? fallbackName, handle: p?.username, avatar: p?.avatarUrl ?? fallbackAvatar });
    };
    for (const m of roster) add(m.userId, m.username, m.avatar?.startsWith("http") ? m.avatar : undefined);
    for (const m of messages) {
      if (m.authorName !== "System") add(m.authorId, m.authorName, m.authorAvatar?.startsWith("http") ? m.authorAvatar : undefined);
    }
    const q = (mentionQuery ?? "").toLowerCase();
    return [...map.values()].filter((c) => c.name.toLowerCase().includes(q) || (c.handle?.toLowerCase().includes(q) ?? false)).slice(0, 6);
  }, [roster, messages, profiles, mentionQuery, identity.userId]);

  // Map of @handle (lowercased) → user id, for resolving typed mentions on send.
  const handleToId = useMemo(() => {
    const map = new Map<string, string>();
    const addId = (id: string) => { const u = profiles.get(id)?.username; if (u) map.set(u.toLowerCase(), id); };
    for (const m of roster) addId(m.userId);
    for (const m of messages) addId(m.authorId);
    return map;
  }, [roster, messages, profiles]);

  // ── #box links ────────────────────────────────────────────────────────────
  // Boxes are read non-reactively (getState) so a chat panel doesn't re-render
  // on every canvas edit.
  const pendingBoxes = useRef<{ id: string; title: string; boardId: string }[]>([]);
  const [boxQuery, setBoxQuery] = useState<string | null>(null);
  const boxStart = useRef(0);
  const fromBoard = (b: Board, prefix: string) => [
    ...(b.boxes ?? []).map((x) => ({ id: x.id, title: prefix + (x.title || "Untitled"), boardId: b.id })),
    ...(b.boardItems ?? []).map((it) => ({ id: it.id, title: prefix + itemLabel(it), boardId: b.id })),
  ];
  const boardBoxes = (): { id: string; title: string; boardId: string }[] => {
    const st = useBoardStore.getState();
    const cur = st.serverBoards[chatBoardId] ?? st.boards.find((bd) => bd.id === chatBoardId);
    const out = cur ? fromBoard(cur, "") : [];
    // Cross-board: in personal context, also offer items from your other boards.
    if (!serverId) {
      for (const b of st.boards) {
        if (b.id === chatBoardId || b.deletedAt) continue;
        out.push(...fromBoard(b, `${b.name}: `));
      }
    }
    return out;
  };
  const resolveBoxTitle = (boxBoardId: string | undefined, id: string): string | undefined => {
    const st = useBoardStore.getState();
    const b = (boxBoardId ? (st.serverBoards[boxBoardId] ?? st.boards.find((x) => x.id === boxBoardId)) : undefined)
      ?? st.serverBoards[chatBoardId] ?? st.boards.find((x) => x.id === chatBoardId);
    if (!b) return undefined;
    const box = (b.boxes ?? []).find((x) => x.id === id);
    if (box) return box.title || "Untitled";
    const it = (b.boardItems ?? []).find((x) => x.id === id);
    return it ? itemLabel(it) : undefined;
  };
  const boxCandidates = useMemo(() => {
    if (boxQuery === null) return [];
    const q = boxQuery.toLowerCase();
    return boardBoxes().filter((b) => b.title.toLowerCase().includes(q)).slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxQuery, chatBoardId]);

  const onInputChange = (value: string, cursor: number) => {
    setInput(value);
    const upto = value.slice(0, cursor);
    const at = upto.match(/(?:^|\s)@([A-Za-z0-9_.\-]*)$/);
    if (at) { setMentionQuery(at[1] ?? ""); mentionStart.current = cursor - (at[1]?.length ?? 0) - 1; setBoxQuery(null); return; }
    const hash = upto.match(/(?:^|\s)#([A-Za-z0-9_\-]*)$/);
    if (hash) { setBoxQuery(hash[1] ?? ""); boxStart.current = cursor - (hash[1]?.length ?? 0) - 1; setMentionQuery(null); return; }
    setMentionQuery(null);
    setBoxQuery(null);
  };

  const pickBox = (b: { id: string; title: string; boardId: string }) => {
    const before = input.slice(0, boxStart.current);
    const after = input.slice(boxStart.current).replace(/^#[A-Za-z0-9_\-]*/, "");
    setInput(`${before}#${b.title} ${after}`);
    if (!pendingBoxes.current.some((p) => p.id === b.id)) pendingBoxes.current.push(b);
    setBoxQuery(null);
  };

  const encodeBoxes = (text: string): string => {
    let out = text;
    for (const bx of pendingBoxes.current) out = out.replace(`#${bx.title}`, `<box:${bx.boardId}|${bx.id}>`);
    return out;
  };

  const pickMention = (c: { id: string; name: string; handle?: string }) => {
    const handle = c.handle ?? c.name;
    const before = input.slice(0, mentionStart.current);
    const after = input.slice(mentionStart.current).replace(/^@[A-Za-z0-9_.\-]*/, "");
    setInput(`${before}@${handle} ${after}`);
    if (!pendingMentions.current.some((p) => p.id === c.id)) pendingMentions.current.push({ id: c.id, name: handle });
    setMentionQuery(null);
  };

  // Encode mentions to <@id> tokens before sending: picker selections first,
  // then any typed @handle that matches a known user — without touching tokens.
  const encodeMentions = (text: string): string => {
    let out = text;
    for (const men of pendingMentions.current) out = out.replace(`@${men.name}`, `<@${men.id}>`);
    out = out.replace(/<@[0-9a-fA-F-]{36}>|@([A-Za-z0-9_]+)/g, (full, h) => {
      if (full.startsWith("<@")) return full;
      const id = handleToId.get((h as string).toLowerCase());
      return id ? `<@${id}>` : full;
    });
    return out;
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Prefer the user's profile picture; fall back to their initial. Stored on the
  // message so other viewers see it too (the renderer shows an <img> for URLs).
  const authorAvatar = identity.avatarUrl || (identity.displayName.charAt(0).toUpperCase() || "?");

  // ── Appearance customization ──────────────────────────────────────────────
  const accent = item.chatAccentColor || "var(--accent)";
  const msgColor = item.chatTextColor || "var(--text-secondary)";
  const bubbles = item.chatBubbles ?? false;
  const hideHeader = item.chatHideHeader ?? false;
  const rootStyle: React.CSSProperties = {
    minHeight: 0,
    fontFamily: item.chatFontFamily || undefined,
    background: item.chatBgColor || undefined,
  };
  const bgLayer = item.chatBgImage ? (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${item.chatBgImage})`,
          backgroundSize: item.chatBgSize ?? "cover",
          backgroundPosition: item.chatBgPosition ?? "center",
          backgroundRepeat: "no-repeat",
          opacity: item.chatBgOpacity ?? 1,
        }}
      />
      {/* Legibility scrim — background images must never make messages unreadable */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "linear-gradient(rgba(10, 11, 15, 0.38), rgba(10, 11, 15, 0.6))" }}
      />
    </>
  ) : null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    let imageUrl: string | undefined = pendingImage?.dataUrl;
    if (pendingImage) {
      const uploaded = await uploadFile(pendingImage.file, identity.userId, "chat", pendingImage.name);
      if (uploaded) imageUrl = uploaded;
    }
    void send(
      identity.userId,
      identity.displayName,
      authorAvatar,
      encodeBoxes(encodeMentions(text)),
      {
        ...(pendingImage ? { imageUrl, fileName: pendingImage.name } : {}),
        ...(replyingTo ? { replyTo: { id: replyingTo.id, author: replyingTo.authorName, text: replySnippet(replyingTo) } } : {}),
      }
    );
    setInput("");
    setReplyingTo(null);
    setPendingImage(null);
    setMentionQuery(null);
    setBoxQuery(null);
    pendingMentions.current = [];
    pendingBoxes.current = [];
  };

  const sendGif = (gifUrl: string) => {
    void send(identity.userId, identity.displayName, authorAvatar, "", {
      gifUrl,
      ...(replyingTo ? { replyTo: { id: replyingTo.id, author: replyingTo.authorName, text: replySnippet(replyingTo) } } : {}),
    });
    setShowGif(false);
    setReplyingTo(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) =>
      setPendingImage({ file, dataUrl: ev.target!.result as string, name: file.name });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Collapsed preview ────────────────────────────────────────────────────────
  if (!expanded) {
    const latest = messages[messages.length - 1];
    return (
      <div className="relative flex h-full flex-col" style={rootStyle}>
        {bgLayer}
        <div className="relative z-10 flex flex-shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">#</span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">{channelName}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: accent }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <span className="text-[10px] text-[var(--text-muted)]">{messages.length} msg</span>
          </div>
        </div>
        <div className="relative z-10 flex flex-1 items-start gap-1.5 overflow-hidden px-2 py-1.5">
          {latest ? (
            <>
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white" style={{ background: accent }}>
                {(profiles.get(latest.authorId)?.avatarUrl ?? latest.authorAvatar)?.startsWith("http")
                  ? <img src={profiles.get(latest.authorId)?.avatarUrl ?? latest.authorAvatar} alt="" className="h-full w-full object-cover" />
                  : (profiles.get(latest.authorId)?.avatarUrl ?? latest.authorAvatar)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-[var(--text-primary)]">{profiles.get(latest.authorId)?.displayName ?? latest.authorName} </span>
                {latest.gif ? (
                  <span className="text-[11px] italic text-[var(--text-muted)]">sent a GIF</span>
                ) : latest.image ? (
                  <span className="text-[11px] italic text-[var(--text-muted)]">sent an image</span>
                ) : (
                  <span className="truncate text-[11px] text-[var(--text-secondary)]">{latest.content}</span>
                )}
              </div>
            </>
          ) : (
            <span className="text-[11px] italic text-[var(--text-muted)]">No messages yet</span>
          )}
        </div>
      </div>
    );
  }

  // ── Expanded view ────────────────────────────────────────────────────────────
  const searchTerm = chatSearch.trim().toLowerCase();
  const displayed = searchTerm
    ? messages.filter((m) => m.authorName !== "System" && (m.content ?? "").toLowerCase().includes(searchTerm))
    : messages;

  return (
    <div className="relative flex h-full flex-col" style={rootStyle}>
      {bgLayer}
      {/* Channel header — data-item-drag: grabbing it moves the item on the board canvas */}
      {!hideHeader && (
        <div data-item-drag className="relative z-10 flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold leading-none text-white"
            style={{ background: accent }}
          >
            #
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{channelName}</span>
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: accent }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="text-[11px] text-[var(--text-muted)]">{messages.length}</span>
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setNotifMenuOpen((v) => !v)}
              title={notifPref === "all" ? "Notifications: all messages" : notifPref === "mentions" ? "Notifications: mentions only" : "Notifications: muted"}
              className={cn(
                "rounded p-1 transition-colors hover:bg-[var(--surface-overlay)]",
                notifPref === "all" ? "text-[var(--text-muted)] hover:text-[var(--text-primary)]" : notifPref === "mentions" ? "text-[var(--accent)]" : "text-[var(--text-muted)] opacity-60"
              )}
            >
              {notifPref === "mute" ? <BellOff size={14} /> : notifPref === "mentions" ? <AtSign size={14} /> : <Bell size={14} />}
            </button>
            {notifMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--border)] py-1 shadow-2xl" style={{ background: "var(--surface-raised)" }}>
                  {([
                    { v: "all", label: "All messages", icon: <Bell size={13} /> },
                    { v: "mentions", label: "Mentions only", icon: <AtSign size={13} /> },
                    { v: "mute", label: "Muted", icon: <BellOff size={13} /> },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => { setNotifPref(opt.v); setNotifMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                    >
                      <span className="text-[var(--text-muted)]">{opt.icon}</span>
                      <span className="flex-1">{opt.label}</span>
                      {notifPref === opt.v && <Check size={12} className="text-[var(--accent)]" />}
                    </button>
                  ))}
                  <p className="border-t border-[var(--border)] px-3 pb-1 pt-1.5 text-[10px] text-[var(--text-muted)]">
                    Applies to toasts and push, on all your devices.
                    {serverId && serverPref && serverPref !== "all" && ` Server default: ${serverPref === "mute" ? "muted" : "mentions only"}.`}
                  </p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setSearchOpen((v) => { if (v) setChatSearch(""); return !v; })}
            title="Search this channel"
            className={cn(
              "flex-shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]",
              searchOpen ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
            )}
          >
            <Search size={14} />
          </button>
        </div>
      )}

      {/* In-chat search bar */}
      {!hideHeader && searchOpen && (
        <div className="relative z-10 flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search messages…"
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {searchTerm && <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">{displayed.length} found</span>}
        </div>
      )}

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        data-nodrag
        className="relative z-10 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
        style={{ minHeight: 0, scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
      >
        {chatLoading && !searchTerm ? (
          <div className="flex flex-1 flex-col justify-end gap-3 py-2" aria-busy="true">
            {[62, 40, 76].map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="cr-skeleton h-7 w-7 shrink-0 rounded-full" style={{ animationDelay: `${i * 130}ms` }} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                  <div className="cr-skeleton h-2.5 w-24 rounded" style={{ animationDelay: `${i * 130}ms` }} />
                  <div className="cr-skeleton h-2.5 rounded" style={{ width: `${w}%`, animationDelay: `${i * 130}ms` }} />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="text-lg font-bold text-[var(--text-muted)]">{searchTerm ? <Search size={20} /> : "#"}</span>
            <p className="text-xs font-semibold text-[var(--text-primary)]">{searchTerm ? "No matches" : `#${channelName}`}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {searchTerm ? `No messages matching “${chatSearch.trim()}”.` : `This is the beginning of #${channelName}.`}
            </p>
          </div>
        ) : (
          <>
            {!searchTerm && messages.length >= 50 && !allLoaded && (
              <button
                onClick={handleLoadOlder}
                disabled={loadingOlder}
                className="mx-auto mb-1 rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </button>
            )}
            {displayed.map((msg, i) => {
            const prev = displayed[i - 1];
            const showDate = !prev || new Date(prev.timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
            const isSystem = msg.authorName === "System";
            const consecutive = !searchTerm && !!prev && !showDate && !isSystem && !msg.replyToId && prev.authorId === msg.authorId && prev.authorName !== "System";
            const isYou = msg.authorId === identity.userId;
            const liveAvatar = profiles.get(msg.authorId)?.avatarUrl ?? msg.authorAvatar;
            const liveName = profiles.get(msg.authorId)?.displayName ?? msg.authorName;
            const dateDivider = showDate ? (
              <div className="my-2 flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{formatDateDivider(msg.timestamp)}</span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
            ) : null;

            if (isSystem) {
              return (
                <Fragment key={msg.id}>
                  {dateDivider}
                  <div className="my-1.5 flex items-center justify-center px-3 text-center">
                    <span className="text-[11px] text-[var(--text-muted)]">📣 {msg.content}</span>
                  </div>
                </Fragment>
              );
            }

            return (
              <Fragment key={msg.id}>
                {dateDivider}
                <div
                  data-msg-id={msg.id}
                  className={cn(
                    "group relative flex items-start gap-2 rounded px-1 py-0.5 transition-colors hover:bg-[var(--surface-overlay)]/40",
                    consecutive ? "mt-0" : "mt-2.5"
                  )}
                >
                {/* Message actions — Reply + React inline, everything else in a ⋯ menu */}
                <div className="absolute right-1 -top-3 z-10 hidden items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-0.5 shadow-sm group-hover:flex">
                  {!msg.id.startsWith("opt-") && (
                    <button
                      onClick={() => { setReplyingTo(msg); setMoreFor(null); }}
                      title="Reply"
                      className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                    >
                      <Reply size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => setReactingTo((cur) => (cur === msg.id ? null : msg.id))}
                    title="Add reaction"
                    className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                  >
                    <Smile size={12} />
                  </button>
                  {!msg.id.startsWith("opt-") && (
                    <div className="relative">
                      <button
                        onClick={() => setMoreFor((cur) => (cur === msg.id ? null : msg.id))}
                        title="More"
                        className={cn("rounded p-1 transition-colors hover:text-[var(--accent)]", moreFor === msg.id ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}
                      >
                        <MoreHorizontal size={12} />
                      </button>
                      {moreFor === msg.id && (
                        <>
                          <div className="fixed inset-0 z-[200]" onClick={() => { setMoreFor(null); setConfirmDeleteId(null); }} />
                          <div className="absolute right-0 top-full z-[201] mt-1 w-36 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-2xl">
                            <button
                              onClick={() => { void togglePin(msg.id, !msg.pinned); setMoreFor(null); }}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                            >
                              <Pin size={12} /> {msg.pinned ? "Unpin" : "Pin"}
                            </button>
                            {isYou && msg.content && (
                              <button
                                onClick={() => { setEditingId(msg.id); setEditDraft(msg.content ?? ""); setConfirmDeleteId(null); setMoreFor(null); }}
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                            )}
                            {(isYou || canModerate) && (
                              <button
                                onClick={() => {
                                  if (confirmDeleteId === msg.id) { void deleteOwnMessage(msg.id); setConfirmDeleteId(null); setMoreFor(null); }
                                  else setConfirmDeleteId(msg.id);
                                }}
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
                              >
                                <Trash2 size={12} /> {confirmDeleteId === msg.id ? "Click to confirm" : (isYou ? "Delete" : "Delete (mod)")}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {reactingTo === msg.id && (
                  <>
                    <div className="fixed inset-0 z-[200]" onClick={() => setReactingTo(null)} />
                    <div className="absolute right-1 top-7 z-[201]">
                      <EmojiPicker
                        onSelect={(emoji) => {
                          void toggleReaction(msg.id, emoji, identity.userId);
                          setReactingTo(null);
                        }}
                      />
                    </div>
                  </>
                )}
                {!consecutive ? (
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
                    style={{ background: isYou ? "#16a34a" : accent }}
                  >
                    {liveAvatar?.startsWith("http")
                      ? <img src={liveAvatar} alt="" className="h-full w-full object-cover" />
                      : liveAvatar}
                  </div>
                ) : (
                  <div className="w-7 flex-shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  {msg.pinned && (
                    <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]">
                      <Pin size={9} /> Pinned
                    </div>
                  )}
                  {!consecutive && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{liveName}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  {msg.replyToId && (
                    <button
                      onClick={() => jumpToMessage(msg.replyToId)}
                      title="Jump to replied message"
                      className="mb-0.5 flex max-w-full items-center gap-1 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                    >
                      <Reply size={11} className="shrink-0 opacity-70" />
                      <span className="shrink-0 font-medium text-[var(--text-secondary)]">{msg.replyToAuthor ?? "message"}</span>
                      <span className="truncate opacity-80">{msg.replyToText}</span>
                    </button>
                  )}
                  {editingId === msg.id ? (
                    <div className="mt-0.5 flex flex-col gap-1">
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editDraft.trim()) {
                            void editOwnMessage(msg.id, editDraft.trim());
                            setEditingId(null);
                          } else if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded border border-[var(--accent)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
                      />
                      <p className="text-[10px] text-[var(--text-muted)]">enter to save · esc to cancel</p>
                    </div>
                  ) : msg.content && (
                    <p
                      className={cn("break-words leading-relaxed text-sm", bubbles && "mt-0.5 inline-block rounded-2xl px-3 py-1.5")}
                      style={{
                        color: bubbles && isYou ? "#fff" : msgColor,
                        fontFamily: item.chatFontFamily || undefined,
                        fontSize: item.chatFontSize ? `${item.chatFontSize}px` : undefined,
                        background: bubbles ? (isYou ? accent : "var(--surface-overlay)") : undefined,
                      }}
                    >
                      {renderMessageContent(msg.content, identity.userId, identity.displayName, (id) => profiles.get(id)?.displayName, resolveBoxTitle, item.chatMentionColor || "var(--accent)", bubbles && isYou)}
                      {msg.editedAt && <span className="ml-1.5 align-baseline text-[10px] opacity-60">(edited)</span>}
                    </p>
                  )}
                  {msg.gif && (
                    <img
                      src={msg.gif}
                      alt="gif"
                      className="mt-1 max-h-[200px] rounded-xl object-cover"
                    />
                  )}
                  {msg.image && (
                    <img
                      src={msg.image}
                      alt={msg.fileName ?? "image"}
                      className="mt-1 max-h-[200px] rounded-xl object-cover"
                    />
                  )}
                  {(() => {
                    const groups = groupReactions(reactions[msg.id], identity.userId);
                    if (groups.length === 0) return null;
                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {groups.map((g) => (
                          <button
                            key={g.emoji}
                            onClick={() => void toggleReaction(msg.id, g.emoji, identity.userId)}
                            title={g.mine ? "Remove your reaction" : "React"}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors",
                              g.mine
                                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                                : "border-[var(--border)] bg-[var(--surface-overlay)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                            )}
                          >
                            <span>{g.emoji}</span>
                            <span className="font-semibold">{g.count}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              </Fragment>
            );
          })}
          </>
        )}
      </div>

      {/* Input area */}
      <div className="relative z-10 flex-shrink-0 border-t border-[var(--border)] px-2 py-2">
        {showEmoji && (
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setShowEmoji(false)} />
            <div className="absolute bottom-full left-2 z-[201] mb-1">
              <EmojiPicker
                onSelect={(emoji) => {
                  setInput((v) => v + emoji);
                  setShowEmoji(false);
                }}
              />
            </div>
          </>
        )}

        {showGif && (
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setShowGif(false)} />
            <div className="absolute bottom-full left-2 z-[201] mb-1">
              <GifPicker onSelect={sendGif} onClose={() => setShowGif(false)} />
            </div>
          </>
        )}

        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 z-[201] mb-1 overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl" style={{ background: "var(--surface-raised)" }}>
            {mentionCandidates.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); pickMention(c); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                  {c.avatar ? <img src={c.avatar} alt="" className="h-full w-full object-cover" /> : c.name[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[var(--text-primary)]">{c.handle ? `@${c.handle}` : c.name}</span>
                  {c.handle && <span className="ml-1.5 text-[var(--text-muted)]">{c.name}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {boxQuery !== null && boxCandidates.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 z-[201] mb-1 overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl" style={{ background: "var(--surface-raised)" }}>
            {boxCandidates.map((b) => (
              <button
                key={b.id}
                onMouseDown={(e) => { e.preventDefault(); pickBox(b); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
              >
                <span className="text-[var(--text-muted)]">▦</span>
                <span className="truncate">{b.title}</span>
              </button>
            ))}
          </div>
        )}

        {pendingImage && (
          <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] p-2">
            <img
              src={pendingImage.dataUrl}
              alt="preview"
              className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">
              {pendingImage.name}
            </span>
            <button
              onClick={() => setPendingImage(null)}
              className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {replyingTo && (
          <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-1.5">
            <Reply size={12} className="flex-shrink-0 text-[var(--accent)]" />
            <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">
              Replying to <span className="font-semibold text-[var(--text-secondary)]">{replyingTo.authorName}</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)] opacity-70">{replySnippet(replyingTo)}</span>
            <button onClick={() => setReplyingTo(null)} title="Cancel reply" className="flex-shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-overlay)] py-1 pl-1.5 pr-1 transition-colors focus-within:border-[var(--accent)]/60">
          {/* Attachments — GIF + image grouped so the bar stays compact when narrow */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowAttach((v) => !v); setShowEmoji(false); setShowGif(false); }}
              title="Add GIF or image"
              className={cn(
                "rounded-full p-1.5 transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]",
                showAttach ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              )}
            >
              <Plus size={15} />
            </button>
            {showAttach && (
              <>
                <div className="fixed inset-0 z-[200]" onClick={() => setShowAttach(false)} />
                <div
                  className="absolute bottom-full left-0 z-[201] mb-2 w-36 overflow-hidden rounded-xl border border-[var(--border)] py-1 shadow-2xl"
                  style={{ background: "var(--surface-raised)" }}
                >
                  <button
                    onClick={() => { setShowAttach(false); setShowGif(true); setShowEmoji(false); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                  >
                    <span className="flex h-4 w-7 items-center justify-center rounded border border-[var(--border)] text-[10px] font-bold">GIF</span>
                    Send a GIF
                  </button>
                  <button
                    onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                  >
                    <ImageIcon size={14} /> Upload image
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Emoji */}
          <button
            onClick={() => { setShowEmoji((v) => !v); setShowGif(false); setShowAttach(false); }}
            title="Emoji"
            className={cn(
              "flex-shrink-0 rounded-full p-1.5 transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]",
              showEmoji ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
            )}
          >
            <Smile size={15} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <input
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder={`Message #${channelName}…`}
            value={input}
            onChange={(e) => onInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onBlur={() => setTimeout(() => { setMentionQuery(null); setBoxQuery(null); }, 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />

          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() && !pendingImage}
            title="Send"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
            style={{ background: accent }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
