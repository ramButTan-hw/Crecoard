"use client";

import { useState } from "react";
import { X, MessageCircle, UserPlus, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileBlock } from "@/lib/collaboration";
import { useFriends } from "@/contexts/FriendsContext";
import { useUser } from "@/contexts/UserContext";

export interface ViewableUser {
  displayName: string;
  avatarChar: string;
  avatarUrl?: string;
  bannerUrl?: string;
  color: string;
  online: boolean;
  status?: string;
  statusEmoji?: string;
  pronouns?: string;
  dmId?: string;
  /** Supabase UUID — present for real users; absent for demo/guest users */
  userId?: string;
  profileBlocks?: ProfileBlock[];
  profileBoardBg?: string;
  profileBoardBgImage?: string;
}

const FONT_FAMILY_CSS: Record<string, string> = {
  sans:  "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  mono:  "'Courier New', Consolas, monospace",
  hand:  "cursive",
};
const LINE_HEIGHT_MAP: Record<string, number> = { tight: 1.2, normal: 1.5, relaxed: 1.85 };
const LETTER_SPACING_MAP: Record<string, string> = { normal: "0em", wide: "0.06em", wider: "0.14em" };

export function UserProfileModal({
  user, onClose, onDm,
}: {
  user: ViewableUser;
  onClose: () => void;
  onDm?: () => void;
}) {
  const { identity } = useUser();
  const { friends, pendingReceived, pendingSent, sendFriendRequestById } = useFriends();
  const [addStatus, setAddStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  const canAddFriend =
    Boolean(user.userId) &&
    user.userId !== identity.userId &&
    !identity.userId?.startsWith("guest-");

  const isFriend = canAddFriend && friends.some((f) => f.userId === user.userId);
  const isPending =
    canAddFriend &&
    [...pendingReceived, ...pendingSent].some((p) => p.userId === user.userId);

  const handleAddFriend = async () => {
    if (!user.userId) return;
    setAddStatus("loading");
    const result = await sendFriendRequestById(user.userId);
    setAddStatus(result === "ok" ? "sent" : "error");
  };

  const bannerGradient = `linear-gradient(135deg, ${user.color}88 0%, ${user.color}22 100%)`;

  return (
    <>
      <div className="fixed inset-0 z-[1010] bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[1011] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)]"
        style={{ background: "var(--surface-raised)", width: "min(90vw, 1100px)", height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div
          className="relative flex-shrink-0"
          style={{
            height: "min(300px, 25vh)",
            background: user.bannerUrl ? undefined : bannerGradient,
            backgroundImage: user.bannerUrl ? `url(${user.bannerUrl})` : undefined,
            backgroundSize: user.bannerUrl ? "cover" : undefined,
            backgroundPosition: user.bannerUrl ? "center" : undefined,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/75 transition-colors z-10"
          >
            <X size={14} />
          </button>

          {/* Avatar */}
          <div className="absolute left-7 z-10" style={{ bottom: -54 }}>
            <div
              className="relative flex items-center justify-center rounded-full border-[5px] text-white font-bold text-4xl select-none"
              style={{ width: 108, height: 108, background: user.color, borderColor: "var(--surface-raised)" }}
            >
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                : user.avatarChar}
              {/* Online dot */}
              <span
                className={cn(
                  "absolute bottom-1 right-1 h-5 w-5 rounded-full border-[3px] border-[var(--surface-raised)]",
                  user.online ? "bg-green-500" : "bg-[var(--text-muted)]"
                )}
              />
            </div>
          </div>
        </div>

        {/* Name / status row */}
        <div
          className="flex-shrink-0 flex items-center"
          style={{ paddingLeft: 155, paddingRight: 24, paddingTop: 10, paddingBottom: 16, minHeight: 82 }}
        >
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <p className="font-bold text-[var(--text-primary)] truncate" style={{ fontSize: 22 }}>
              {user.displayName}
            </p>
            {user.pronouns && (
              <p className="text-xs text-[var(--text-muted)]">{user.pronouns}</p>
            )}
            {(user.statusEmoji || user.status) && (
              <p className="text-sm text-[var(--text-secondary)] truncate">
                {user.statusEmoji && <span className="mr-1">{user.statusEmoji}</span>}
                {user.status}
              </p>
            )}
          </div>
          {/* Actions inline with name */}
          <div className="flex gap-2 flex-shrink-0">
            {onDm && (
              <button
                onClick={onDm}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)" }}
              >
                <MessageCircle size={14} /> Message
              </button>
            )}
            {canAddFriend && (
              isFriend ? (
                <button
                  disabled
                  className="flex items-center gap-2 rounded-xl border border-green-500/30 px-4 py-2 text-sm font-medium text-green-400 opacity-80 cursor-default"
                >
                  <UserCheck size={14} /> Friends
                </button>
              ) : isPending || addStatus === "sent" ? (
                <button
                  disabled
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] cursor-default"
                >
                  <UserPlus size={14} /> Pending
                </button>
              ) : (
                <button
                  onClick={() => void handleAddFriend()}
                  disabled={addStatus === "loading"}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                    addStatus === "error"
                      ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
                      : "border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white",
                    addStatus === "loading" && "opacity-60 cursor-wait"
                  )}
                >
                  <UserPlus size={14} />
                  {addStatus === "loading" ? "Sending…" : addStatus === "error" ? "Retry" : "Add Friend"}
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Profile board — grows to fill remaining modal height */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border)] overflow-hidden">
          <div className="px-5 pt-3 pb-2 flex-shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Profile Board</p>
          </div>
          <div className="flex-1 min-h-0 px-5 pb-5 flex flex-col">
            <div
              className="relative flex-1 rounded-xl overflow-hidden border border-[var(--border)]"
              style={{
                background: user.profileBoardBgImage ? undefined : (user.profileBoardBg ?? "#111216"),
                backgroundImage: user.profileBoardBgImage
                  ? `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px), url(${user.profileBoardBgImage})`
                  : "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
                backgroundSize: user.profileBoardBgImage ? "24px 24px, cover" : "24px 24px",
                backgroundPosition: user.profileBoardBgImage ? "0 0, center" : "0 0",
              }}
            >
              {(!user.profileBlocks || user.profileBlocks.length === 0) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                  <p className="text-sm text-[var(--text-muted)]">No profile board yet</p>
                  <p className="text-xs text-[var(--text-muted)] opacity-50">{user.displayName} hasn&apos;t set one up</p>
                </div>
              )}
              {(user.profileBlocks ?? []).map((block) => (
                <div
                  key={block.id}
                  style={{
                    position: "absolute",
                    left: block.x,
                    top: block.y,
                    width: block.w,
                    height: block.h,
                    background: block.color,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                    pointerEvents: "none",
                  }}
                >
                  {block.bgImage && (
                    <div style={{
                      position: "absolute", inset: 0,
                      backgroundImage: `url(${block.bgImage})`,
                      backgroundSize: "cover", backgroundPosition: "center",
                      opacity: block.bgOpacity ?? 0.5,
                    }} />
                  )}
                  <div style={{ position: "relative", zIndex: 1, padding: "10px 12px", height: "100%", overflow: "hidden" }}>
                    {block.items.map((item) => (
                      <div key={item.id} style={{ marginBottom: 5 }}>
                        {item.type === "text" && (
                          <p style={{
                            fontSize: item.fontSize ?? 12,
                            fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                            fontWeight: item.fontWeight ?? (item.bold ? 700 : 400),
                            fontStyle: item.italic ? "italic" : "normal",
                            textDecoration: [item.underline ? "underline" : "", item.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
                            color: item.color ?? "rgba(255,255,255,0.65)",
                            textAlign: item.align ?? "left",
                            lineHeight: item.lineHeight ? LINE_HEIGHT_MAP[item.lineHeight] : 1.5,
                            letterSpacing: item.letterSpacing ? LETTER_SPACING_MAP[item.letterSpacing] : undefined,
                            whiteSpace: "pre-wrap", margin: 0,
                          }}>
                            {item.content}
                          </p>
                        )}
                        {item.type === "list" && (
                          <>
                            {item.title && (
                              <p style={{
                                fontSize: item.fontSize ?? 12, fontWeight: 600,
                                fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                                color: item.color ?? "rgba(255,255,255,0.8)", marginBottom: 3, marginTop: 0,
                              }}>
                                {item.title}
                              </p>
                            )}
                            {item.entries.map((en) => (
                              <div key={en.id} style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", flexShrink: 0, marginTop: 1 }}>
                                  {en.checked ? "☑" : "•"}
                                </span>
                                <span style={{
                                  fontSize: item.fontSize ?? 12,
                                  fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                                  color: en.checked ? "rgba(255,255,255,0.3)" : (item.color ?? "rgba(255,255,255,0.65)"),
                                  textDecoration: en.checked ? "line-through" : "none",
                                  lineHeight: 1.4,
                                }}>
                                  {en.text}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
