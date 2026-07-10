"use client";

import { useState, useMemo } from "react";
import { MessageCircle, UserPlus, Search, Users, X, Check, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewableUser } from "./UserProfileModal";
import { useFriends } from "@/contexts/FriendsContext";
import { useMessaging } from "@/contexts/MessagingContext";
import { useUser } from "@/contexts/UserContext";
import { usePresence } from "@/contexts/PresenceContext";
import type { PendingRequest } from "@/contexts/FriendsContext";

type Tab = "online" | "all" | "pending";

// ── Unified display type for both real and demo friends ───────────────────────

interface DisplayFriend {
  id: string;
  userId?: string;
  username: string;
  avatarChar: string;
  avatarUrl?: string;
  color: string;
  online: boolean;
  status?: string;
  dmId?: string | null;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "online",  label: "Online" },
  { id: "all",     label: "All" },
  { id: "pending", label: "Pending" },
];

// ── Add Friend result messages ─────────────────────────────────────────────────

const ADD_FRIEND_MSG: Record<string, { text: string; ok: boolean }> = {
  ok:             { text: "Friend request sent!", ok: true },
  already_friends: { text: "You're already friends.",  ok: false },
  already_pending: { text: "Request already pending.", ok: false },
  self:           { text: "You can't add yourself.",   ok: false },
  blocked:        { text: "This user isn't accepting friend requests.", ok: false },
  not_found:      { text: "No user found with that name.", ok: false },
  error:          { text: "Something went wrong.",     ok: false },
};

// ─────────────────────────────────────────────────────────────────────────────

export function FriendsView({
  onDmSelect, onClose, onViewProfile,
}: {
  onDmSelect: (id: string, username?: string, online?: boolean, avatarUrl?: string, userId?: string) => void;
  onClose?: () => void;
  onViewProfile?: (u: ViewableUser) => void;
}) {
  const { friends, pendingReceived, pendingSent, findUserByName, sendFriendRequestById, acceptRequest, declineOrRemove } = useFriends();
  const messaging = useMessaging();
  const { identity } = useUser();
  const { online: presenceMap } = usePresence();

  const [tab, setTab] = useState<Tab>("online");
  const [search, setSearch] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [addFriendStatus, setAddFriendStatus] = useState<string | null>(null);
  const [addFriendLoading, setAddFriendLoading] = useState(false);

  const isLoggedIn = Boolean(identity.userId && !identity.userId.startsWith("guest-"));
  const displayFriends: DisplayFriend[] = friends.map((f) => ({
    id: f.friendshipId,
    userId: f.userId,
    username: f.displayName,
    avatarChar: f.avatarChar,
    avatarUrl: f.avatarUrl,
    color: f.color,
    online: !!f.userId && f.userId in presenceMap && presenceMap[f.userId] !== "offline",
    status: undefined,
    dmId: null,
  }));

  const online = displayFriends.filter((f) => f.online);
  const pendingCount = isLoggedIn ? pendingReceived.length + pendingSent.length : 0;
  const counts = { online: online.length, all: displayFriends.length, pending: pendingCount };

  const filtered = useMemo(() => {
    const base = tab === "online" ? online : tab === "all" ? displayFriends : [];
    if (!search.trim()) return base;
    return base.filter((f) => f.username.toLowerCase().includes(search.toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, displayFriends]);

  const handleSendRequest = async () => {
    if (!addFriendInput.trim()) return;
    setAddFriendLoading(true);
    setAddFriendStatus(null);
    const found = await findUserByName(addFriendInput.trim());
    if (!found) { setAddFriendStatus("not_found"); setAddFriendLoading(false); return; }
    const result = await sendFriendRequestById(found.id);
    setAddFriendStatus(result);
    setAddFriendLoading(false);
    if (result === "ok") { setAddFriendInput(""); setTimeout(() => setShowAddFriend(false), 1500); }
  };

  const handleMessage = async (f: DisplayFriend) => {
    if (f.userId) {
      const convId = await messaging.openConversation(f.userId);
      if (convId) onDmSelect(convId, f.username, f.online, f.avatarUrl, f.userId);
    } else if (f.dmId) {
      onDmSelect(f.dmId, f.username, f.online, f.avatarUrl);
    } else {
      onDmSelect(`dm-${f.id}`, f.username, f.online, f.avatarUrl);
    }
  };

  return (
    <div className="flex flex-col" style={{ background: "var(--surface-raised)" }}>

      {/* ── Header: title + tabs + CTA ── */}
      <div className="flex-shrink-0 border-b border-[var(--border)]">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-1">
            <span className="mr-2 text-sm font-semibold text-[var(--text-primary)]">Friends</span>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 pb-2.5 pt-0.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                )}
              >
                {t.label}
                {counts[t.id] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
                    tab === t.id
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "bg-[var(--surface-overlay)] text-[var(--text-muted)]"
                  )}>
                    {counts[t.id]}
                  </span>
                )}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-[var(--accent)]" />
                )}
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => { setShowAddFriend(true); setAddFriendStatus(null); }}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
            >
              <UserPlus size={12} />
              Add Friend
            </button>
            {onClose && (
              <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Search bar / Add Friend form ── */}
      {showAddFriend ? (
        <div className="flex-shrink-0 border-b border-[var(--border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <input
                autoFocus
                value={addFriendInput}
                onChange={(e) => { setAddFriendInput(e.target.value); setAddFriendStatus(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSendRequest(); }}
                placeholder="Add by @username…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 px-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)]"
              />
              {addFriendStatus && (
                <span className={cn(
                  "text-[11px] font-medium",
                  ADD_FRIEND_MSG[addFriendStatus]?.ok ? "text-green-400" : "text-red-400"
                )}>
                  {ADD_FRIEND_MSG[addFriendStatus]?.text ?? "Unknown error."}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleSendRequest()}
              disabled={addFriendLoading || !addFriendInput.trim()}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 whitespace-nowrap disabled:opacity-50"
            >
              {addFriendLoading ? "Sending…" : "Send Request"}
            </button>
            <button
              onClick={() => { setShowAddFriend(false); setAddFriendStatus(null); setAddFriendInput(""); }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className={cn(
          "flex-shrink-0 border-b border-[var(--border)] px-4 py-2.5",
          tab === "pending" && "opacity-50 pointer-events-none"
        )}>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={tab === "pending"}
              placeholder="Search friends…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)]"
            />
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="overflow-y-auto p-4">
        {tab === "pending" ? (
          pendingReceived.length === 0 && pendingSent.length === 0 ? (
            <IconEmptyState
              icon={<UserPlus size={22} className="text-[var(--accent)]" />}
              title="No pending requests"
              subtitle="When someone sends you a friend request, it'll show up here."
              cta="Add friends"
              onCta={() => { setShowAddFriend(true); setAddFriendStatus(null); }}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {pendingReceived.length > 0 && (
                <section>
                  <SectionDivider label="Incoming" count={pendingReceived.length} />
                  <div className="flex flex-col gap-2">
                    {pendingReceived.map((req) => (
                      <PendingCard
                        key={req.friendshipId}
                        request={req}
                        onAccept={() => void acceptRequest(req.friendshipId)}
                        onDecline={() => void declineOrRemove(req.friendshipId)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {pendingSent.length > 0 && (
                <section>
                  <SectionDivider label="Sent" count={pendingSent.length} />
                  <div className="flex flex-col gap-2">
                    {pendingSent.map((req) => (
                      <PendingCard
                        key={req.friendshipId}
                        request={req}
                        onDecline={() => void declineOrRemove(req.friendshipId)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )
        ) : filtered.length === 0 && search ? (
          <IconEmptyState
            icon={<Search size={22} className="text-[var(--accent)]" />}
            title={`No results for "${search}"`}
            subtitle="Try a different name."
          />
        ) : tab === "all" ? (
          <AllFriendsView
            friends={filtered}
            onMessage={handleMessage}
            onViewProfile={onViewProfile}
          />
        ) : filtered.length === 0 ? (
          <IconEmptyState
            icon={<Users size={22} className="text-[var(--accent)]" />}
            title="No friends online right now"
            subtitle="Your online friends will appear here."
            cta="Add friends"
            onCta={() => { setShowAddFriend(true); setAddFriendStatus(null); }}
          />
        ) : (
          <FriendGrid
            friends={filtered}
            onMessage={handleMessage}
            onViewProfile={onViewProfile}
          />
        )}
      </div>
    </div>
  );
}

// ── All tab: online section then offline section ───────────────────────────────

function AllFriendsView({
  friends, onMessage, onViewProfile,
}: {
  friends: DisplayFriend[];
  onMessage: (f: DisplayFriend) => void;
  onViewProfile?: (u: ViewableUser) => void;
}) {
  const online  = friends.filter((f) =>  f.online);
  const offline = friends.filter((f) => !f.online);
  return (
    <div className="flex flex-col gap-6">
      {online.length > 0 && (
        <section>
          <SectionDivider label="Online" count={online.length} />
          <FriendGrid friends={online} onMessage={onMessage} onViewProfile={onViewProfile} />
        </section>
      )}
      {offline.length > 0 && (
        <section className="opacity-75">
          <SectionDivider label="Offline" count={offline.length} />
          <FriendGrid friends={offline} onMessage={onMessage} onViewProfile={onViewProfile} />
        </section>
      )}
    </div>
  );
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label} — {count}
      </span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

function FriendGrid({
  friends, onMessage, onViewProfile,
}: {
  friends: DisplayFriend[];
  onMessage: (f: DisplayFriend) => void;
  onViewProfile?: (u: ViewableUser) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
      {friends.map((f) => (
        <FriendCard
          key={f.id}
          friend={f}
          onMessage={() => onMessage(f)}
          onViewProfile={onViewProfile}
        />
      ))}
    </div>
  );
}

// ── Friend card ───────────────────────────────────────────────────────────────

function FriendCard({
  friend, onMessage, onViewProfile,
}: {
  friend: DisplayFriend;
  onMessage: () => void;
  onViewProfile?: (u: ViewableUser) => void;
}) {
  const handleViewProfile = () => onViewProfile?.({
    displayName: friend.username,
    avatarChar: friend.avatarChar,
    avatarUrl: friend.avatarUrl,
    color: friend.color,
    online: friend.online,
    status: friend.status,
    userId: friend.userId,
    dmId: friend.dmId ?? undefined,
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleViewProfile}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleViewProfile(); } }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-left transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--surface-overlay)]"
    >
      <div
        className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: friend.color }}
      >
        {friend.avatarUrl
          ? <img src={friend.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          : friend.avatarChar}
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)]",
          friend.online ? "bg-green-500" : "bg-[var(--text-muted)]"
        )} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{friend.username}</p>
        {friend.status ? (
          <p className="truncate text-xs text-[var(--accent)] opacity-90">{friend.status}</p>
        ) : (
          <p className="truncate text-xs text-[var(--text-muted)]">{friend.online ? "Online" : "Offline"}</p>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onMessage(); }}
        title="Start DM"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--surface-overlay)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-white"
      >
        <MessageCircle size={14} />
      </button>
    </div>
  );
}

// ── Pending request card ──────────────────────────────────────────────────────

function PendingCard({
  request, onAccept, onDecline,
}: {
  request: PendingRequest;
  onAccept?: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5" style={{ background: "var(--surface)" }}>
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: request.color }}
      >
        {request.avatarChar}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{request.displayName}</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {request.direction === "received" ? "Incoming request" : "Request sent"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onAccept && (
          <button
            onClick={onAccept}
            title="Accept"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
          >
            <Check size={13} />
          </button>
        )}
        <button
          onClick={onDecline}
          title={request.direction === "received" ? "Decline" : "Cancel"}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/20 hover:text-red-400"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Icon empty state ──────────────────────────────────────────────────────────

function IconEmptyState({ icon, title, subtitle, cta, onCta }: {
  icon: React.ReactNode; title: string; subtitle: string; cta?: string; onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/10">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        {subtitle && <p className="max-w-xs text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {cta && (
        <button
          onClick={onCta}
          className="rounded-xl bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
