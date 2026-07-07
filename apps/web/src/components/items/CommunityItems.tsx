"use client";

import { useState } from "react";
import { Lightbulb, PenLine, Vote, ArrowBigUp, Check, Trash2, Pin, Plus, X as XIcon } from "lucide-react";
import { nanoid } from "nanoid";
import type { BlockItem, PollOption } from "@/store/boardStore";
import { useUser } from "@/contexts/UserContext";
import { useItemContributions } from "@/contexts/BoardContributionsContext";
import { useCanEditBoard } from "@/contexts/ServerBoardContext";
import { FontPicker } from "@/components/ui/FontPicker";
import { cn } from "@/lib/utils";

type Upd = (p: Partial<BlockItem>) => void;

interface RendererProps {
  item: BlockItem;
  upd: Upd;
  boardId: string;
  collapsed?: boolean;
  isFinished?: boolean;
  canContribute?: boolean;
}

// ─── Shared appearance ──────────────────────────────────────────────────────

/** Resolves the community appearance fields into an accent + container style. */
export function communityStyle(item: BlockItem, defaultAccent = "var(--accent)") {
  const accent = item.communityAccent || defaultAccent;
  const bordered = (item.communityBorderWidth ?? 0) > 0;
  const boxed = !!item.communityBgColor || bordered;
  const container: React.CSSProperties = {
    background: item.communityBgColor || undefined,
    color: item.communityTextColor || undefined,
    fontFamily: item.communityFontFamily || undefined,
    fontSize: item.communityFontSize ? `${item.communityFontSize}px` : undefined,
    border: bordered ? `${item.communityBorderWidth}px solid ${item.communityBorderColor || "var(--border)"}` : undefined,
    borderRadius: item.communityBorderRadius ?? undefined,
    padding: boxed ? 10 : undefined,
  };
  return { accent, container };
}

/** Small pending / author line shared by suggestion + guestbook entries. */
function Attribution({ name, pending }: { name: string; pending?: boolean }) {
  return (
    <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
      {name || "Anonymous"}{pending && <span className="italic"> · pending</span>}
    </span>
  );
}

/** Stops canvas drag / board shortcuts from stealing pointer + key events. */
const swallow = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

// ─── Suggestion box ─────────────────────────────────────────────────────────

export function SuggestionItem({ item, boardId, collapsed, canContribute }: RendererProps) {
  const { identity } = useUser();
  const canModerate = useCanEditBoard();
  const { contributions, add, removeOwn, moderateRemove, togglePin, setApproved } = useItemContributions(item.id, boardId);
  const [draft, setDraft] = useState("");
  const { accent, container } = communityStyle(item);

  const requireApproval = !!item.requireContributionApproval;
  const allowUpvotes = item.suggestionAllowUpvotes !== false; // default on
  const me = identity.userId;

  const suggestions = contributions.filter((c) => c.kind === "suggestion");
  const upvotes = contributions.filter((c) => c.kind === "upvote");
  const votesFor = (sid: string) => upvotes.filter((u) => u.content === sid);
  const myUpvote = (sid: string) => votesFor(sid).find((u) => u.authorId === me);

  const visible = suggestions
    .filter((c) => c.approved || canModerate || c.authorId === me)
    .slice()
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (allowUpvotes ? votesFor(b.id).length - votesFor(a.id).length : 0) ||
      a.createdAt.localeCompare(b.createdAt)
    );

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    void add(text, { kind: "suggestion", approved: !requireApproval });
    setDraft("");
  };

  const toggleUpvote = (sid: string) => {
    const mine = myUpvote(sid);
    if (mine) void removeOwn(mine.id);
    else void add(sid, { kind: "upvote" });
  };

  return (
    <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden text-sm" style={container}>
      <div data-item-drag className="flex items-center gap-1.5 shrink-0 text-[var(--text-secondary)]">
        <Lightbulb size={14} style={{ color: accent }} />
        <span className="font-semibold truncate">{item.suggestionTitle || "Suggestions"}</span>
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">{suggestions.length}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
        {visible.length === 0 && (
          <p className="text-[11px] italic text-[var(--text-muted)] px-0.5">No suggestions yet.</p>
        )}
        {visible.map((c) => {
          const isOwn = c.authorId === me;
          const count = votesFor(c.id).length;
          const upvoted = !!myUpvote(c.id);
          return (
            <div key={c.id} className={cn("group/s flex items-start gap-2 rounded-md border border-[var(--border)] px-2 py-1.5", !c.approved && "opacity-60")}>
              {allowUpvotes && !collapsed && (
                <button
                  {...swallow}
                  onClick={() => canContribute && toggleUpvote(c.id)}
                  disabled={!canContribute}
                  title={canContribute ? (upvoted ? "Remove upvote" : "Upvote") : "Upvoting disabled"}
                  style={upvoted ? { color: accent } : undefined}
                  className={cn("flex flex-col items-center rounded px-1 py-0.5 leading-none transition-colors",
                    upvoted ? "" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    !canContribute && "opacity-50 cursor-default")}
                >
                  <ArrowBigUp size={14} fill={upvoted ? "currentColor" : "none"} />
                  <span className="text-[11px] tabular-nums">{count}</span>
                </button>
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words leading-snug">{c.content}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  {c.pinned && <Pin size={9} style={{ color: accent }} />}
                  <Attribution name={c.authorName} pending={!c.approved} />
                </div>
              </div>
              {!collapsed && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {canModerate && !c.approved && (
                    <button {...swallow} onClick={() => void setApproved(c.id, true)} title="Approve" className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-colors hover:text-green-400 group-hover/s:opacity-100"><Check size={12} /></button>
                  )}
                  {canModerate && (
                    <button {...swallow} onClick={() => void togglePin(c.id, !c.pinned)} title={c.pinned ? "Unpin" : "Pin"} style={c.pinned ? { color: accent } : undefined} className={cn("rounded p-0.5 transition-colors", c.pinned ? "" : "text-[var(--text-muted)] opacity-0 hover:text-[var(--text-primary)] group-hover/s:opacity-100")}><Pin size={12} /></button>
                  )}
                  {(isOwn || canModerate) && (
                    <button {...swallow} onClick={() => void (isOwn ? removeOwn(c.id) : moderateRemove(c.id))} title="Remove" className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-colors hover:text-red-400 group-hover/s:opacity-100"><Trash2 size={12} /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canContribute && !collapsed && (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--border)] pt-1.5">
          <input
            {...swallow}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={item.suggestionPrompt || "Suggest something…"}
            className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          <button {...swallow} onClick={submit} style={{ background: accent }} className="rounded px-2 py-1 text-xs text-white transition-opacity hover:opacity-90">Suggest</button>
        </div>
      )}
    </div>
  );
}

// ─── Guestbook ──────────────────────────────────────────────────────────────

export function GuestbookItem({ item, boardId, collapsed, canContribute }: RendererProps) {
  const { identity } = useUser();
  const canModerate = useCanEditBoard();
  const { contributions, add, removeOwn, moderateRemove, setApproved } = useItemContributions(item.id, boardId);
  const [draft, setDraft] = useState("");
  const { accent, container } = communityStyle(item);

  const requireApproval = !!item.requireContributionApproval;
  const me = identity.userId;

  const entries = contributions
    .filter((c) => c.kind === "guestbook" && (c.approved || canModerate || c.authorId === me))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    void add(text, { kind: "guestbook", approved: !requireApproval });
    setDraft("");
  };

  return (
    <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden text-sm" style={container}>
      <div data-item-drag className="flex items-center gap-1.5 shrink-0 text-[var(--text-secondary)]">
        <PenLine size={14} style={{ color: accent }} />
        <span className="font-semibold truncate">{item.guestbookTitle || "Guestbook"}</span>
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">{entries.length}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
        {entries.length === 0 && (
          <p className="text-[11px] italic text-[var(--text-muted)] px-0.5">Be the first to sign.</p>
        )}
        {entries.map((c) => {
          const isOwn = c.authorId === me;
          return (
            <div key={c.id} className={cn("group/g rounded-md border border-[var(--border)] px-2 py-1.5", !c.approved && "opacity-60")}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 break-words leading-snug">{c.content}</p>
                {!collapsed && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {canModerate && !c.approved && (
                      <button {...swallow} onClick={() => void setApproved(c.id, true)} title="Approve" className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-colors hover:text-green-400 group-hover/g:opacity-100"><Check size={12} /></button>
                    )}
                    {(isOwn || canModerate) && (
                      <button {...swallow} onClick={() => void (isOwn ? removeOwn(c.id) : moderateRemove(c.id))} title="Remove" className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-colors hover:text-red-400 group-hover/g:opacity-100"><Trash2 size={12} /></button>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-0.5">
                <span className="text-[11px] text-[var(--text-muted)]">— <span className="font-medium">{c.authorName || "Anonymous"}</span>{!c.approved && <span className="italic"> · pending</span>}</span>
              </div>
            </div>
          );
        })}
      </div>

      {canContribute && !collapsed && (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--border)] pt-1.5">
          <input
            {...swallow}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={item.guestbookPrompt || "Leave a message…"}
            className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          <button {...swallow} onClick={submit} style={{ background: accent }} className="rounded px-2 py-1 text-xs text-white transition-opacity hover:opacity-90">Sign</button>
        </div>
      )}
    </div>
  );
}

// ─── Poll ───────────────────────────────────────────────────────────────────

export function PollItem({ item, boardId, collapsed, isFinished, canContribute }: RendererProps) {
  const { identity } = useUser();
  const canModerate = useCanEditBoard();
  const { contributions, add, editOwn, removeOwn } = useItemContributions(item.id, boardId);
  const { accent, container } = communityStyle(item);

  const options = item.pollOptions ?? [];
  const me = identity.userId;
  const votes = contributions.filter((c) => c.kind === "vote");
  const myVote = votes.find((v) => v.authorId === me);
  const total = votes.length;
  const countFor = (oid: string) => votes.filter((v) => v.content === oid).length;

  const showResults =
    (item.pollShowResults ?? "afterVote") === "always" || !!myVote || canModerate || collapsed || isFinished;

  const castVote = (oid: string) => {
    if (!canContribute) return;
    if (myVote) {
      if (myVote.content === oid) void removeOwn(myVote.id); // click current choice → un-vote
      else void editOwn(myVote.id, oid);
    } else {
      void add(oid, { kind: "vote" });
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden text-sm" style={container}>
      <div data-item-drag className="flex items-center gap-1.5 shrink-0 text-[var(--text-secondary)]">
        <Vote size={14} style={{ color: accent }} />
        <span className="font-semibold truncate">{item.pollQuestion || "Poll"}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
        {options.length === 0 && (
          <p className="text-[11px] italic text-[var(--text-muted)] px-0.5">No options yet.</p>
        )}
        {options.map((o) => {
          const count = countFor(o.id);
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = myVote?.content === o.id;
          return (
            <button
              key={o.id}
              {...swallow}
              onClick={() => castVote(o.id)}
              disabled={!canContribute}
              style={mine ? { borderColor: accent } : undefined}
              className={cn("relative w-full overflow-hidden rounded-md border px-2.5 py-1.5 text-left transition-colors",
                mine ? "" : "border-[var(--border)]",
                canContribute ? "cursor-pointer hover:border-[var(--text-muted)]" : "cursor-default")}
            >
              {showResults && (
                <span aria-hidden className="absolute inset-y-0 left-0 z-0 transition-[width] duration-300"
                  style={{ width: `${pct}%`, background: mine ? accent : "var(--border)", opacity: mine ? 0.28 : 0.5 }} />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {mine && <Check size={12} className="shrink-0" style={{ color: accent }} />}
                <span className="min-w-0 flex-1 truncate">{o.label || "Untitled"}</span>
                {showResults && <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{pct}% · {count}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="shrink-0 text-[11px] text-[var(--text-muted)]">
        {total} vote{total === 1 ? "" : "s"}
        {myVote && !collapsed && canContribute && <span> · tap your choice to remove it</span>}
        {!canContribute && !collapsed && <span> · voting disabled</span>}
      </div>
    </div>
  );
}

// ─── Style panels ───────────────────────────────────────────────────────────

const INPUT_CLS = "w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-colors";
const LABEL_CLS = "mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";

function ApprovalToggle({ item, upd }: { item: BlockItem; upd: Upd }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!item.requireContributionApproval} onChange={(e) => upd({ requireContributionApproval: e.target.checked })} className="accent-[var(--accent)]" />
      <span className="text-[var(--text-secondary)]">Require approval before showing</span>
    </label>
  );
}

function ColorRow({ label, value, fallback, onChange, onClear }: {
  label: string; value?: string; fallback: string; onChange: (v: string) => void; onClear?: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 transition-colors hover:border-[var(--text-muted)]">
      <span className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded border border-white/15" style={{ backgroundColor: value || fallback }}>
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      <span className="flex-1 text-[var(--text-secondary)]">{label}</span>
      {value && onClear && (
        <button onClick={(e) => { e.preventDefault(); onClear(); }} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Reset</button>
      )}
    </label>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-[var(--text-muted)]">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
      <span className="w-6 text-right tabular-nums text-[var(--text-muted)]">{value}</span>
    </label>
  );
}

/** Shared appearance controls for community items (suggestion/guestbook/poll/twitch). */
export function CommunityAppearanceSection({ item, upd }: { item: BlockItem; upd: Upd }) {
  return (
    <div>
      <p className={LABEL_CLS}>Appearance</p>
      <div className="flex flex-col gap-2">
        <ColorRow label="Accent" value={item.communityAccent} fallback="#6c63ff" onChange={(v) => upd({ communityAccent: v })} onClear={() => upd({ communityAccent: undefined })} />
        <ColorRow label="Background" value={item.communityBgColor} fallback="#17181d" onChange={(v) => upd({ communityBgColor: v })} onClear={() => upd({ communityBgColor: undefined })} />
        <ColorRow label="Text" value={item.communityTextColor} fallback="#e7e7ea" onChange={(v) => upd({ communityTextColor: v })} onClear={() => upd({ communityTextColor: undefined })} />
        <FontPicker compact value={item.communityFontFamily ?? "Inter"} onChange={(f) => upd({ communityFontFamily: f || undefined })} />
        <Slider label="Size" min={11} max={22} value={item.communityFontSize ?? 14} onChange={(v) => upd({ communityFontSize: v })} />
        <ColorRow label="Border" value={item.communityBorderColor} fallback="#2a2b31" onChange={(v) => upd({ communityBorderColor: v })} onClear={() => upd({ communityBorderColor: undefined })} />
        <Slider label="Width" min={0} max={4} value={item.communityBorderWidth ?? 0} onChange={(v) => upd({ communityBorderWidth: v })} />
        <Slider label="Radius" min={0} max={24} value={item.communityBorderRadius ?? 0} onChange={(v) => upd({ communityBorderRadius: v })} />
      </div>
    </div>
  );
}

export function SuggestionStylePanel({ item, upd }: { item: BlockItem; upd: Upd }) {
  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div>
        <p className={LABEL_CLS}>Title</p>
        <input className={INPUT_CLS} placeholder="Suggestions" value={item.suggestionTitle ?? ""} onChange={(e) => upd({ suggestionTitle: e.target.value || undefined })} />
      </div>
      <div>
        <p className={LABEL_CLS}>Input placeholder</p>
        <input className={INPUT_CLS} placeholder="Suggest something…" value={item.suggestionPrompt ?? ""} onChange={(e) => upd({ suggestionPrompt: e.target.value || undefined })} />
      </div>
      <div>
        <p className={LABEL_CLS}>Behaviour</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.suggestionAllowUpvotes !== false} onChange={(e) => upd({ suggestionAllowUpvotes: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Allow upvotes (rank by popularity)</span>
          </label>
          <ApprovalToggle item={item} upd={upd} />
        </div>
      </div>
      <CommunityAppearanceSection item={item} upd={upd} />
    </div>
  );
}

export function GuestbookStylePanel({ item, upd }: { item: BlockItem; upd: Upd }) {
  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div>
        <p className={LABEL_CLS}>Title</p>
        <input className={INPUT_CLS} placeholder="Guestbook" value={item.guestbookTitle ?? ""} onChange={(e) => upd({ guestbookTitle: e.target.value || undefined })} />
      </div>
      <div>
        <p className={LABEL_CLS}>Input placeholder</p>
        <input className={INPUT_CLS} placeholder="Leave a message…" value={item.guestbookPrompt ?? ""} onChange={(e) => upd({ guestbookPrompt: e.target.value || undefined })} />
      </div>
      <div>
        <p className={LABEL_CLS}>Behaviour</p>
        <ApprovalToggle item={item} upd={upd} />
      </div>
      <CommunityAppearanceSection item={item} upd={upd} />
    </div>
  );
}

export function PollStylePanel({ item, upd }: { item: BlockItem; upd: Upd }) {
  const options = item.pollOptions ?? [];
  const setOptions = (next: PollOption[]) => upd({ pollOptions: next });
  const resultsMode = item.pollShowResults ?? "afterVote";

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div>
        <p className={LABEL_CLS}>Question</p>
        <input className={INPUT_CLS} placeholder="What should we play?" value={item.pollQuestion ?? ""} onChange={(e) => upd({ pollQuestion: e.target.value || undefined })} />
      </div>

      <div>
        <p className={LABEL_CLS}>Options</p>
        <div className="flex flex-col gap-1.5">
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-1.5">
              <input
                className={INPUT_CLS}
                placeholder={`Option ${i + 1}`}
                value={o.label}
                onChange={(e) => setOptions(options.map((x) => x.id === o.id ? { ...x, label: e.target.value } : x))}
              />
              <button onClick={() => setOptions(options.filter((x) => x.id !== o.id))} className="rounded border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:text-red-400" title="Remove option"><XIcon size={12} /></button>
            </div>
          ))}
          <button
            onClick={() => setOptions([...options, { id: nanoid(), label: "" }])}
            className="flex items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus size={12} /> Add option
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Editing or removing an option keeps existing votes in the table; removed options just stop being shown.</p>
      </div>

      <div>
        <p className={LABEL_CLS}>Show results</p>
        <div className="flex gap-1">
          {(["afterVote", "always"] as const).map((m) => (
            <button
              key={m}
              onClick={() => upd({ pollShowResults: m })}
              className={cn("flex-1 rounded border px-2 py-1.5 transition-colors",
                resultsMode === m ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]")}
            >
              {m === "afterVote" ? "After voting" : "Always"}
            </button>
          ))}
        </div>
      </div>

      <CommunityAppearanceSection item={item} upd={upd} />
    </div>
  );
}
