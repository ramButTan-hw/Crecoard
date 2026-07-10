"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, Minus, Smile, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { EmojiPicker } from "@/components/messaging/EmojiPicker";
import { GifPicker } from "@/components/messaging/GifPicker";
import { useMessaging } from "@/contexts/MessagingContext";
import { useUser } from "@/contexts/UserContext";
import { usePresence } from "@/contexts/PresenceContext";
import { uploadFile } from "@/lib/storage";

// ── Demo seed data (for d1/d2/d3 preview conversations) ──────────────────────

interface DemoMessage {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  gif?: string;
  image?: string;
  fileName?: string;
}

const SEED_MESSAGES: Record<string, DemoMessage[]> = {
  d1: [
    { id: "1", author: "alex_dev", avatar: "A", content: "Hey! Can you share that workout block template?", timestamp: "11:20 AM" },
    { id: "2", author: "You", avatar: "Y", content: "Sure! Made it public — check the community boards", timestamp: "11:22 AM" },
    { id: "3", author: "alex_dev", avatar: "A", content: "Perfect, thanks! Love the timer items inside the block", timestamp: "11:25 AM" },
  ],
  d2: [
    { id: "4", author: "sarah.m", avatar: "S", content: "Hey, do you know how to link variables across blocks?", timestamp: "Yesterday 4:10 PM" },
    { id: "5", author: "You", avatar: "Y", content: "Not yet, that's a future feature — for now keep them in the same block", timestamp: "Yesterday 4:13 PM" },
  ],
  d3: [],
};

const AVATAR_COLORS: Record<string, string> = {
  alex_dev: "#d59ee8",
  "sarah.m": "#eb459e",
  jordan: "#57f287",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Unified render shape (both modes produce this) ────────────────────────────

interface RenderMessage {
  id: string;
  isYou: boolean;
  authorName: string;
  authorAvatar: string;
  content: string;
  gif?: string;
  image?: string;
  fileName?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────

const W = 320;
const H = 440;

interface DmPopoutProps {
  dmId: string;
  username: string;
  online: boolean;
  avatarUrl?: string;
  /** Peer's userId — when known, live presence overrides the `online` snapshot */
  peerUserId?: string;
  index: number;
  onClose: () => void;
}

export function DmPopout({ dmId, username, online: onlineSnapshot, avatarUrl, peerUserId, index, onClose }: DmPopoutProps) {
  const messaging = useMessaging();
  const { identity } = useUser();
  const isMobile = useIsMobile();
  const { online: presenceMap } = usePresence();
  // Live presence when we know who the peer is; the open-time snapshot otherwise
  const online = peerUserId ? peerUserId in presenceMap && presenceMap[peerUserId] !== "offline" : onlineSnapshot;

  // dmId is either a demo key ("d1") or a real conversationId (UUID)
  const isReal = UUID_RE.test(dmId);

  // Demo-mode local message state
  const [demoMessages, setDemoMessages] = useState<DemoMessage[]>(SEED_MESSAGES[dmId] ?? []);

  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; dataUrl: string; name: string } | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: window.innerWidth - (16 + index * (W + 16)) - W,
    y: window.innerHeight - 68 - H,
  }));

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOrigin = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarColor = AVATAR_COLORS[username] ?? "#6b7280";

  // Real mode: load history and subscribe to Realtime on mount
  useEffect(() => {
    if (!isReal) return;
    void messaging.loadMessages(dmId);
    const unsub = messaging.subscribeToConversation(dmId);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmId, isReal]);

  // Global drag listeners
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: dragOrigin.current.posX + (e.clientX - dragOrigin.current.mouseX),
        y: dragOrigin.current.posY + (e.clientY - dragOrigin.current.mouseY),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragging.current = true;
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y };
  };

  // Auto-scroll to bottom on new messages
  const realMessages = messaging.messages[dmId] ?? [];
  const totalMessages = isReal ? realMessages.length : demoMessages.length;
  useEffect(() => {
    if (!minimized) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [minimized, totalMessages]);

  // Normalize messages for rendering
  const renderMessages: RenderMessage[] = isReal
    ? realMessages.map((m) => ({
        id:           m.id,
        isYou:        m.authorId === identity.userId,
        authorName:   m.authorName,
        authorAvatar: m.authorAvatar,
        content:      m.content,
        gif:          m.gifUrl,
        image:        m.imageUrl,
        fileName:     m.fileName,
        timestamp:    new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }))
    : demoMessages.map((m) => ({
        id:           m.id,
        isYou:        m.author === "You",
        authorName:   m.author,
        authorAvatar: m.avatar,
        content:      m.content,
        gif:          m.gif,
        image:        m.image,
        fileName:     m.fileName,
        timestamp:    m.timestamp,
      }));

  const send = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;

    let imageUrl: string | undefined = pendingImage?.dataUrl;
    if (pendingImage?.file && isReal) {
      const uploaded = await uploadFile(pendingImage.file, identity.userId, "dm", pendingImage.name);
      if (uploaded) imageUrl = uploaded;
    }

    if (isReal) {
      await messaging.sendMessage(dmId, text, {
        gifUrl:   undefined,
        imageUrl,
        fileName: pendingImage?.name,
      });
    } else {
      setDemoMessages((prev) => [...prev, {
        id: Date.now().toString(),
        author: "You",
        avatar: "Y",
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ...(pendingImage ? { image: imageUrl, fileName: pendingImage.name } : {}),
      }]);
    }

    setInput("");
    setPendingImage(null);
  };

  const sendGif = async (gifUrl: string) => {
    if (isReal) {
      await messaging.sendMessage(dmId, "", { gifUrl });
    } else {
      setDemoMessages((prev) => [...prev, {
        id: Date.now().toString(),
        author: "You",
        avatar: "Y",
        content: "",
        gif: gifUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
    }
    setShowGif(false);
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

  return (
    <div
      className={cn(
        "fixed z-[1005] flex flex-col overflow-hidden border border-[var(--border)] shadow-2xl",
        isMobile ? "inset-x-0 top-0 h-[100dvh] rounded-none pt-safe pb-safe" : "rounded-2xl"
      )}
      style={isMobile
        ? { background: "var(--surface-raised)", userSelect: "none" }
        : {
            left: pos.x,
            top: pos.y,
            width: W,
            height: minimized ? "auto" : H,
            background: "var(--surface-raised)",
            transition: "height 0.15s ease",
            userSelect: "none",
          }}
    >
      {/* Header — drag handle */}
      <div
        className="flex flex-shrink-0 cursor-grab items-center gap-2.5 px-3 py-2.5 active:cursor-grabbing"
        style={{ background: "var(--surface)" }}
        onMouseDown={startDrag}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setMinimized((v) => !v);
        }}
      >
        <div className="relative flex-shrink-0">
          <div
            className="flex h-7 w-7 select-none items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
            style={{ background: avatarColor }}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : username[0]?.toUpperCase()}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2",
              online ? "bg-green-500" : "bg-[var(--text-muted)]"
            )}
            style={{ borderColor: "var(--surface)" }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="select-none truncate text-sm font-semibold text-[var(--text-primary)]">{username}</p>
          <p className="select-none text-[11px] text-[var(--text-muted)]">{online ? "Active now" : "Offline"}</p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
            className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div
            ref={scrollContainerRef}
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3"
            style={{ userSelect: "text", scrollbarWidth: "thin" }}
          >
            {renderMessages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-lg font-bold text-white"
                  style={{ background: avatarColor }}
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : username[0]?.toUpperCase()}
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{username}</p>
                <p className="text-xs text-[var(--text-muted)]">Start a conversation</p>
              </div>
            ) : (
              renderMessages.map((msg, idx) => {
                const isConsecutive = idx > 0 && renderMessages[idx - 1]!.isYou === msg.isYou && renderMessages[idx - 1]!.authorName === msg.authorName;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-end gap-2",
                      isConsecutive ? "mt-0.5" : "mt-3",
                      msg.isYou ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {!isConsecutive ? (
                      <div
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white"
                        style={{ background: msg.isYou ? "#16a34a" : avatarColor }}
                      >
                        {/^(https?:|data:|\/)/.test(msg.authorAvatar ?? "") ? (
                          <img src={msg.authorAvatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          ((msg.authorAvatar || msg.authorName || "?").trim().slice(0, 1) || "?").toUpperCase()
                        )}
                      </div>
                    ) : (
                      <div className="w-6 flex-shrink-0" />
                    )}

                    <div
                      className={cn(
                        "flex max-w-[72%] flex-col gap-0.5",
                        msg.isYou ? "items-end" : "items-start"
                      )}
                    >
                      {!isConsecutive && (
                        <span className="px-1 text-[11px] text-[var(--text-muted)]">
                          {msg.isYou ? "You" : msg.authorName}
                        </span>
                      )}

                      {msg.gif ? (
                        <img src={msg.gif} alt="gif" className="max-h-[160px] rounded-xl object-cover" />
                      ) : msg.image ? (
                        <img src={msg.image} alt={msg.fileName ?? "image"} className="max-h-[160px] rounded-xl object-cover" />
                      ) : null}

                      {msg.content && (
                        <div
                          className={cn(
                            "break-words rounded-2xl px-3 py-1.5 text-sm leading-relaxed",
                            msg.isYou
                              ? "rounded-br-sm bg-[var(--accent)] text-white"
                              : "rounded-bl-sm bg-[var(--surface-overlay)] text-[var(--text-primary)]"
                          )}
                        >
                          {msg.content}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input area */}
          <div
            className="relative flex-shrink-0 border-t border-[var(--border)] px-3 py-2.5"
            style={{ userSelect: "text" }}
          >
            {/* Emoji picker */}
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-[1010]" onClick={() => setShowEmoji(false)} />
                <div className="absolute bottom-full left-3 z-[1011] mb-1">
                  <EmojiPicker
                    onSelect={(emoji) => {
                      setInput((v) => v + emoji);
                      setShowEmoji(false);
                    }}
                  />
                </div>
              </>
            )}

            {/* GIF picker */}
            {showGif && (
              <>
                <div className="fixed inset-0 z-[1010]" onClick={() => setShowGif(false)} />
                <div className="absolute bottom-full left-3 z-[1011] mb-1">
                  <GifPicker onSelect={sendGif} onClose={() => setShowGif(false)} />
                </div>
              </>
            )}

            {/* Pending image preview */}
            {pendingImage && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] p-2">
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
                  className="flex-shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] py-1 pl-1.5 pr-2">
              {/* Emoji */}
              <button
                onClick={() => { setShowEmoji((v) => !v); setShowGif(false); }}
                title="Emoji"
                className="flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]"
              >
                <Smile size={14} />
              </button>

              {/* GIF */}
              <button
                onClick={() => { setShowGif((v) => !v); setShowEmoji(false); }}
                title="GIF"
                className="flex-shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                GIF
              </button>

              {/* Image upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload image"
                className="flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]"
              >
                <ImageIcon size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Separator */}
              <div className="mx-0.5 h-3.5 w-px flex-shrink-0 bg-[var(--border)]" />

              {/* Text input */}
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder={`Message ${username}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />

              {/* Send */}
              <button
                onClick={() => void send()}
                disabled={!input.trim() && !pendingImage}
                className={cn(
                  "flex-shrink-0 rounded-lg p-1 transition-colors",
                  input.trim() || pendingImage
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] opacity-40"
                )}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
