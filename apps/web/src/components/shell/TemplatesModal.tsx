"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Search, Upload, Heart, Download, Sparkles, ChevronDown,
  Trash2, Check, ImagePlus, Layers, Package, Loader2, Image as ImageIcon, Calendar, ArrowRight,
  Star, Flame, Zap, Dumbbell, Brain, Gamepad2, Palette, LayoutGrid, Compass, type LucideIcon,
} from "lucide-react";
import {
  CommunityBoard, FetchOptions, SortOrder, TemplateCategory, TemplateKind,
  TEMPLATE_CATEGORIES, TEMPLATE_KINDS, fetchCommunityBoards, publishCommunityBoard,
  trackBoardUse, likeCommunityBoard, fetchMyLikes, fetchMyUses, deleteCommunityBoard,
  fetchCategoryCounts, fetchMyRatings, rateCommunityBoard,
  PublishBoardInput, TemplateBox,
} from "@/lib/communityTemplates";
import { useBoardStore, useActiveBoard, type BlockItem, type BoardLevelItem } from "@/store/boardStore";
import { useUser } from "@/contexts/UserContext";
import { uploadFile } from "@/lib/storage";
import { WIDGET_PERMISSIONS, collectTemplatePermissions, type WidgetPermission } from "@/lib/widgetApi";
import { installItem } from "@/lib/installedItems";
import { cn } from "@/lib/utils";

// ─── Main modal ───────────────────────────────────────────────────────────────

interface TemplatesModalProps {
  onClose: () => void;
}

const CATEGORY_ICONS: Record<TemplateCategory, LucideIcon> = {
  productivity: Zap,
  fitness: Dumbbell,
  adhd: Brain,
  gaming: Gamepad2,
  creative: Palette,
  other: Sparkles,
};

export function TemplatesModal({ onClose }: TemplatesModalProps) {
  const [view, setView] = useState<"discover" | "mine">("discover");
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");
  const [kindFilter, setKindFilter] = useState<TemplateKind | "all">("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [search, setSearch] = useState("");
  const [boards, setBoards] = useState<CommunityBoard[]>([]);
  const [featured, setFeatured] = useState<CommunityBoard | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [myUses, setMyUses] = useState<Set<string>>(new Set());
  const [myRatings, setMyRatings] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [detail, setDetail] = useState<CommunityBoard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CommunityBoard | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 30;

  const { isLoggedIn, identity } = useUser();
  const createBoardFromTemplate = useBoardStore((s) => s.createBoardFromTemplate);
  const insertTemplateBoxes = useBoardStore((s) => s.insertTemplateBoxes);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const atBoardLimit = useBoardStore((s) => s.boards.filter((b) => !b.serverId && !b.deletedAt).length >= 3);

  const baseOpts = (): FetchOptions => ({
    category: activeCategory,
    kind: kindFilter,
    sort,
    search: search.trim() || undefined,
    authorId: view === "mine" ? identity.userId : undefined,
    pageSize: PAGE_SIZE,
  });

  // Fetch page 1 whenever filters change
  useEffect(() => {
    if (view === "mine" && !isLoggedIn) { setBoards([]); setHasMore(false); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setPage(1);
    fetchCommunityBoards({ ...baseOpts(), page: 1 }).then((data) => {
      if (!cancelled) { setBoards(data); setHasMore(data.length === PAGE_SIZE); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setBoards([]); setHasMore(false); setLoading(false); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, kindFilter, sort, search, refreshTick, view, isLoggedIn, identity.userId]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchCommunityBoards({ ...baseOpts(), page: next });
      setBoards((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(next);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // My liked + used + rated entries (filled hearts / "Downloaded" / stars)
  useEffect(() => {
    if (!isLoggedIn) { setMyLikes(new Set()); setMyUses(new Set()); setMyRatings(new Map()); return; }
    fetchMyLikes().then(setMyLikes).catch(() => {});
    fetchMyUses().then(setMyUses).catch(() => {});
    fetchMyRatings().then(setMyRatings).catch(() => {});
  }, [isLoggedIn]);

  // Featured spotlight (most-downloaded) + per-category counts — refreshed on publish/delete
  useEffect(() => {
    fetchCategoryCounts().then(setCategoryCounts).catch(() => {});
    fetchCommunityBoards({ sort: "most_used", pageSize: 1 })
      .then((d) => setFeatured(d[0] ?? null))
      .catch(() => setFeatured(null));
  }, [refreshTick]);

  const [pendingUse, setPendingUse] = useState<{ board: CommunityBoard; perms: WidgetPermission[] } | null>(null);

  // Widget permissions never apply silently — strip them unless the installer consents.
  const stripPerms = (b: CommunityBoard): CommunityBoard => ({
    ...b,
    boardData: {
      ...b.boardData,
      boxes: b.boardData.boxes.map((box) => ({
        ...box,
        items: box.items.map(({ widgetPermissions: _wp, ...rest }) => rest),
      })),
    },
  });

  const applyUse = (board: CommunityBoard, allowPerms: boolean) => {
    const entry = allowPerms ? board : stripPerms(board);
    void trackBoardUse(entry.id);
    setMyUses((prev) => new Set(prev).add(entry.id));
    if (entry.kind === "board") {
      createBoardFromTemplate(entry);
    } else {
      if (!activeBoardId) return;
      insertTemplateBoxes(activeBoardId, entry.boardData.boxes);
    }
    // Item-kind entries also join the palette's "Installed" library for easy re-adding
    // (stored with exactly the permissions consented to above).
    if (entry.kind === "item") {
      const tItem = entry.boardData.boxes[0]?.items[0];
      if (tItem) installItem({ id: entry.id, name: entry.name, author: entry.author.name, item: tItem });
    }
    setPendingUse(null);
    onClose();
  };

  const handleUse = (board: CommunityBoard) => {
    if (board.kind === "board" && atBoardLimit) return;
    const perms = collectTemplatePermissions(board.boardData.boxes);
    if (perms.length > 0) {
      setPendingUse({ board, perms });
      return;
    }
    applyUse(board, false);
  };

  const handleLike = async (board: CommunityBoard) => {
    if (!isLoggedIn) return;
    const res = await likeCommunityBoard(board.id);
    if (!res) return;
    setMyLikes((prev) => {
      const next = new Set(prev);
      if (res.liked) next.add(board.id); else next.delete(board.id);
      return next;
    });
    setBoards((prev) => prev.map((b) => b.id === board.id ? { ...b, likes: res.likes } : b));
    setDetail((d) => (d && d.id === board.id ? { ...d, likes: res.likes } : d));
  };

  const handleRate = async (board: CommunityBoard, rating: number) => {
    if (!isLoggedIn) return;
    const res = await rateCommunityBoard(board.id, rating);
    if (!res) return;
    setMyRatings((prev) => new Map(prev).set(board.id, rating));
    const patch = (b: CommunityBoard): CommunityBoard =>
      b.id === board.id ? { ...b, ratingAvg: res.avg, ratingCount: res.count } : b;
    setBoards((prev) => prev.map(patch));
    setFeatured((f) => (f ? patch(f) : f));
    setDetail((d) => (d ? patch(d) : d));
  };

  const handleDelete = async (board: CommunityBoard) => {
    const ok = await deleteCommunityBoard(board.id);
    setConfirmDelete(null);
    if (!ok) return;
    setBoards((prev) => prev.filter((b) => b.id !== board.id));
    setDetail((d) => (d && d.id === board.id ? null : d));
    setCategoryCounts((c) => {
      const next = { ...c };
      if (next[board.category] != null) next[board.category] = Math.max(0, next[board.category] - 1);
      if (next.all != null) next.all = Math.max(0, next.all - 1);
      return next;
    });
    if (featured?.id === board.id) {
      fetchCommunityBoards({ sort: "most_used", pageSize: 1 })
        .then((d) => setFeatured(d[0] ?? null))
        .catch(() => setFeatured(null));
    }
  };

  // Featured spotlight only leads the default Discover view (not while filtering/searching).
  const showFeatured =
    view === "discover" && activeCategory === "all" && kindFilter === "all" && !search.trim() && !!featured;
  const gridBoards = showFeatured && featured ? boards.filter((b) => b.id !== featured.id) : boards;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: "min(92vw, 920px)", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent)]/15 shrink-0">
              <Sparkles size={17} className="text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)] leading-tight">Community</h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                Share and discover community creations
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border)] px-2.5 py-1.5 w-52">
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards…"
              className="flex-1 min-w-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Kind filter */}
          <div className="relative">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as TemplateKind | "all")}
              className="appearance-none bg-[var(--surface-overlay)] border border-[var(--border)] rounded-lg px-3 py-1.5 pr-7 text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer hover:border-[var(--accent)]/40 transition-colors"
            >
              <option value="all">All types</option>
              {TEMPLATE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.plural}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              className="appearance-none bg-[var(--surface-overlay)] border border-[var(--border)] rounded-lg px-3 py-1.5 pr-7 text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer hover:border-[var(--accent)]/40 transition-colors"
            >
              <option value="newest">Newest</option>
              <option value="most_used">Most used</option>
              <option value="most_liked">Most liked</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>

          {/* Share button */}
          <button
            onClick={() => setShowPublish(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Upload size={13} />
            Share
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── View switch + category tabs ── */}
        <div className="flex items-center gap-1 px-6 py-2.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 pr-2 mr-1 border-r border-[var(--border)] shrink-0">
            <TabBtn active={view === "discover"} onClick={() => setView("discover")}>Discover</TabBtn>
            <TabBtn active={view === "mine"} onClick={() => setView("mine")}>Your boards</TabBtn>
          </div>
          <TabBtn active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>
            <LayoutGrid size={13} /> All
            {categoryCounts.all != null && <TabCount n={categoryCounts.all} active={activeCategory === "all"} />}
          </TabBtn>
          {TEMPLATE_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            const n = categoryCounts[cat.id];
            return (
              <TabBtn
                key={cat.id}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              >
                <Icon size={13} /> {cat.label}
                {n != null && <TabCount n={n} active={activeCategory === cat.id} />}
              </TabBtn>
            );
          })}
        </div>

        {/* ── Board grid ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === "mine" && !isLoggedIn ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent)]/10 mb-1">
                <Package size={26} className="text-[var(--accent)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Sign in to see your boards</p>
              <p className="text-[12px] text-[var(--text-muted)] max-w-xs">
                Once you publish a board, block, or item, it shows up here so you can manage or remove it.
              </p>
            </div>
          ) : loading ? (
            <SkeletonGrid />
          ) : boards.length === 0 ? (
            view === "mine" ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent)]/10">
                  <Package size={26} className="text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">You haven&apos;t shared anything yet</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">
                    Publish a board, block, or item and it&apos;ll appear here.
                  </p>
                </div>
                <button
                  onClick={() => setShowPublish(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  <Upload size={13} /> Share something
                </button>
              </div>
            ) : (
              <EmptyState
                hasSearch={!!search || activeCategory !== "all" || kindFilter !== "all"}
                onShare={() => setShowPublish(true)}
                onClear={() => { setSearch(""); setActiveCategory("all"); setKindFilter("all"); }}
              />
            )
          ) : (
            <>
              {showFeatured && featured && (
                <FeaturedBanner board={featured} onOpen={setDetail} />
              )}
              {atBoardLimit && (
                <p className="mb-3 text-xs text-[var(--text-muted)] text-center">
                  Board limit reached (3 max) — board templates disabled; blocks and items still work.
                </p>
              )}
              <div className="grid grid-cols-3 gap-5">
                {gridBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    onOpen={setDetail}
                    atLimit={atBoardLimit && board.kind === "board"}
                    liked={myLikes.has(board.id)}
                    used={myUses.has(board.id)}
                    canLike={isLoggedIn}
                    onLike={handleLike}
                    isOwn={isLoggedIn && board.author.id === identity.userId}
                    showDelete={view === "mine"}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center mt-5">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] text-[12px] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? <><Loader2 size={13} className="animate-spin" /> Loading…</> : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Detail / showcase ── */}
      {detail && (
        <BoardDetailModal
          board={detail}
          liked={myLikes.has(detail.id)}
          used={myUses.has(detail.id)}
          canLike={isLoggedIn}
          myRating={myRatings.get(detail.id) ?? 0}
          onRate={handleRate}
          isOwn={isLoggedIn && detail.author.id === identity.userId}
          atLimit={atBoardLimit && detail.kind === "board"}
          onLike={handleLike}
          onUse={(b) => { handleUse(b); }}
          onDelete={setConfirmDelete}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete this share?</h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">
                “{confirmDelete.name}” will be removed from the community for everyone. This can&apos;t be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-[12px] font-medium hover:bg-red-600 transition-colors"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish sub-modal ── */}
      {showPublish && (
        <PublishModal
          onClose={() => setShowPublish(false)}
          onPublished={() => { setShowPublish(false); setRefreshTick((t) => t + 1); }}
        />
      )}

      {/* ── Permission consent (entries containing widgets with plugin API access) ── */}
      {pendingUse && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setPendingUse(null)}
        >
          <div
            className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">This item requests permissions</h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                “{pendingUse.board.name}” contains a widget that wants to use the plugin API.
              </p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {pendingUse.perms.map((id) => {
                const def = WIDGET_PERMISSIONS.find((p) => p.id === id);
                if (!def) return null;
                return (
                  <div key={id} className="flex flex-col">
                    <span className="text-xs font-medium text-[var(--text-primary)]">{def.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{def.description}</span>
                  </div>
                );
              })}
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Widgets always run sandboxed — permissions only unlock the specific abilities listed above,
                and you can revoke them any time in the widget’s Permissions tab.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
              <button
                onClick={() => applyUse(pendingUse.board, false)}
                className="px-4 py-2 rounded-lg text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
              >
                Add without permissions
              </button>
              <button
                onClick={() => applyUse(pendingUse.board, true)}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
              >
                Allow & add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Board card ───────────────────────────────────────────────────────────────

function BoardCard({ board, onOpen, atLimit, liked, used, canLike, onLike, isOwn, showDelete, onDelete }: {
  board: CommunityBoard;
  onOpen: (b: CommunityBoard) => void;
  atLimit?: boolean;
  liked?: boolean;
  used?: boolean;
  canLike?: boolean;
  onLike?: (b: CommunityBoard) => void;
  isOwn?: boolean;
  showDelete?: boolean;
  onDelete?: (b: CommunityBoard) => void;
}) {
  const cat = TEMPLATE_CATEGORIES.find((c) => c.id === board.category);
  const kindLabel = TEMPLATE_KINDS.find((k) => k.id === board.kind)?.label ?? "Board";
  return (
    <div
      onClick={() => onOpen(board)}
      className={cn(
        "group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] overflow-hidden cursor-pointer transition-all duration-200 will-change-transform",
        "hover:-translate-y-1 hover:border-[var(--accent)]/60 hover:shadow-xl hover:shadow-black/30",
        atLimit && "opacity-70"
      )}
    >
      {/* Preview */}
      <div className="h-40 relative overflow-hidden shrink-0 bg-[var(--surface-overlay)]">
        {board.previewUrl ? (
          <img
            src={board.previewUrl}
            alt={board.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--surface-overlay)] to-[var(--surface-raised)]">
            <ImageIcon size={30} className="opacity-20" />
          </div>
        )}
        {/* legibility scrims */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

        {/* View details pill */}
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
          View <ArrowRight size={11} />
        </span>

        {/* top-left: kind + category */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)]/90 text-white shadow-sm">
            {kindLabel}
          </span>
          {cat && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/40 text-white ring-1 ring-white/10 backdrop-blur-md">
              {cat.label}
            </span>
          )}
        </div>

        {/* used badge */}
        {used && (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/90 text-white ring-1 ring-white/20 backdrop-blur-sm shadow-sm">
            <Check size={10} /> Downloaded
          </span>
        )}

        {/* owner delete */}
        {showDelete && isOwn && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(board); }}
            title="Delete"
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/45 text-white ring-1 ring-white/10 hover:bg-red-500 hover:ring-red-400 backdrop-blur-md transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{board.name}</span>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2 min-h-[2.2em]">{board.description}</p>
        </div>

        {/* Author + stats */}
        <div className="flex items-center gap-2 mt-auto pt-2.5 border-t border-[var(--border)]">
          <AuthorAvatar name={board.author.name} avatarUrl={board.author.avatarUrl} />
          <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">{board.author.name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {board.ratingCount > 0 && (
              <span
                title={`${board.ratingAvg.toFixed(1)} from ${board.ratingCount} rating${board.ratingCount === 1 ? "" : "s"}`}
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--surface-overlay)] text-amber-400"
              >
                <Star size={11} fill="currentColor" /> {board.ratingAvg.toFixed(1)}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); if (canLike) onLike?.(board); }}
              title={canLike ? (liked ? "Unlike" : "Like") : "Sign in to like"}
              className={cn(
                "flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-all active:scale-90",
                liked ? "text-red-400 bg-red-500/10" : "text-[var(--text-muted)] bg-[var(--surface-overlay)]",
                canLike ? "hover:text-red-400 cursor-pointer" : "cursor-default"
              )}
            >
              <Heart size={11} fill={liked ? "currentColor" : "none"} /> {board.likes.toLocaleString()}
            </button>
            <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--surface-overlay)] text-[var(--text-muted)]">
              <Download size={11} /> {board.uses.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tags */}
        {board.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {board.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-overlay)] text-[var(--text-muted)]">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail / showcase ────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function InsidePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-[var(--surface-overlay)] text-[var(--text-secondary)]">
      {icon} {label}
    </span>
  );
}

function StarRating({ avg = 0, size = 13, interactive = false, myRating = 0, onRate }: {
  avg?: number;
  size?: number;
  interactive?: boolean;
  myRating?: number;
  onRate?: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const on = interactive ? i <= (hover || myRating) : i <= Math.round(avg);
        return (
          <Star
            key={i}
            size={size}
            fill={on ? "currentColor" : "none"}
            className={cn(
              on ? "text-amber-400" : "text-[var(--text-muted)] opacity-40",
              interactive && "cursor-pointer transition-transform hover:scale-110"
            )}
            onMouseEnter={interactive ? () => setHover(i) : undefined}
            onMouseLeave={interactive ? () => setHover(0) : undefined}
            onClick={interactive ? (e) => { e.stopPropagation(); onRate?.(i); } : undefined}
          />
        );
      })}
    </span>
  );
}

function TabCount({ n, active }: { n: number; active: boolean }) {
  return (
    <span className={cn(
      "text-[10px] font-semibold px-1.5 rounded-full min-w-[16px] text-center leading-[16px]",
      active ? "bg-white/25 text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]"
    )}>
      {n}
    </span>
  );
}

function FeaturedBanner({ board, onOpen }: { board: CommunityBoard; onOpen: (b: CommunityBoard) => void }) {
  return (
    <div
      onClick={() => onOpen(board)}
      className="group relative mb-5 flex rounded-2xl border border-[var(--accent)]/30 bg-[var(--surface-raised)] overflow-hidden cursor-pointer transition-all duration-200 hover:border-[var(--accent)]/60 hover:shadow-xl hover:shadow-black/30"
    >
      {/* cover */}
      <div className="relative w-56 shrink-0 overflow-hidden bg-[var(--surface-overlay)]">
        {board.previewUrl ? (
          <img
            src={board.previewUrl}
            alt={board.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--surface-overlay)] to-[var(--surface-raised)]">
            <ImageIcon size={32} className="opacity-20" />
          </div>
        )}
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-[var(--surface-raised)] pointer-events-none" />
      </div>
      {/* info */}
      <div className="flex flex-col gap-1.5 p-4 flex-1 min-w-0">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent)] uppercase tracking-wide">
          <Flame size={13} /> Featured
        </span>
        <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{board.name}</h3>
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed line-clamp-2">{board.description}</p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <AuthorAvatar name={board.author.name} avatarUrl={board.author.avatarUrl} />
          <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">{board.author.name}</span>
          <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-muted)] shrink-0">
            {board.ratingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400"><Star size={11} fill="currentColor" /> {board.ratingAvg.toFixed(1)}</span>
            )}
            <span className="flex items-center gap-1"><Heart size={11} /> {board.likes.toLocaleString()}</span>
            <span className="flex items-center gap-1"><Download size={11} /> {board.uses.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardDetailModal({
  board, liked, used, canLike, myRating, onRate, isOwn, atLimit, onLike, onUse, onDelete, onClose,
}: {
  board: CommunityBoard;
  liked?: boolean;
  used?: boolean;
  canLike?: boolean;
  myRating?: number;
  onRate?: (b: CommunityBoard, n: number) => void;
  isOwn?: boolean;
  atLimit?: boolean;
  onLike?: (b: CommunityBoard) => void;
  onUse: (b: CommunityBoard) => void;
  onDelete?: (b: CommunityBoard) => void;
  onClose: () => void;
}) {
  const media = [board.previewUrl, ...board.previewImages].filter(Boolean) as string[];
  const [active, setActive] = useState(0);
  const cat = TEMPLATE_CATEGORIES.find((c) => c.id === board.category);
  const kindLabel = TEMPLATE_KINDS.find((k) => k.id === board.kind)?.label ?? "Board";
  const useLabel = board.kind === "board" ? "Use this board" : board.kind === "box" ? "Add this block" : "Add this item";

  const bd = board.boardData;
  const blocks = bd.boxes?.length ?? 0;
  const items = (bd.boxes ?? []).reduce((n, b) => n + (b.items?.length ?? 0), 0);
  const widgets = bd.boardItems?.length ?? 0;
  const hasBg = !!(bd.backgroundImage || bd.backgroundVideo || bd.themeBgImage);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: "min(94vw, 680px)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media */}
        <div className="relative shrink-0 bg-[var(--surface-overlay)]">
          <div className="aspect-video w-full overflow-hidden flex items-center justify-center">
            {media.length > 0 ? (
              <img src={media[active] ?? media[0]} alt={board.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[var(--surface-overlay)] to-[var(--surface-raised)]">
                <ImageIcon size={40} className="opacity-25" />
                <span className="text-[11px] text-[var(--text-muted)]">No preview provided</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
          >
            <X size={16} />
          </button>
          <span className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)]/90 text-white shadow-sm">{kindLabel}</span>
            {cat && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/40 text-white ring-1 ring-white/10 backdrop-blur-md">{cat.label}</span>}
          </span>
        </div>
        {/* gallery strip */}
        {media.length > 1 && (
          <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-[var(--border)] shrink-0">
            {media.map((src, i) => (
              <button
                key={src + i}
                onClick={() => setActive(i)}
                className={cn(
                  "h-12 w-16 rounded-md overflow-hidden shrink-0 border-2 transition-colors",
                  i === active ? "border-[var(--accent)]" : "border-transparent opacity-70 hover:opacity-100"
                )}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">{board.name}</h2>
            <div className="flex items-center gap-2">
              <AuthorAvatar name={board.author.name} avatarUrl={board.author.avatarUrl} />
              <span className="text-[12px] text-[var(--text-secondary)]">{board.author.name}</span>
              <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                <Calendar size={10} /> {timeAgo(board.createdAt)}
              </span>
            </div>
          </div>

          {board.description && (
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{board.description}</p>
          )}

          {/* What's inside */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">What&apos;s inside</span>
            <div className="flex flex-wrap gap-1.5">
              {board.kind === "board" && <InsidePill icon={<Layers size={11} />} label={`${blocks} block${blocks === 1 ? "" : "s"}`} />}
              <InsidePill icon={<Package size={11} />} label={`${items} item${items === 1 ? "" : "s"}`} />
              {widgets > 0 && <InsidePill icon={<Sparkles size={11} />} label={`${widgets} canvas widget${widgets === 1 ? "" : "s"}`} />}
              {hasBg && <InsidePill icon={<ImageIcon size={11} />} label="Custom background" />}
            </div>
          </div>

          {/* Tags */}
          {board.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {board.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-overlay)] text-[var(--text-muted)]">#{t}</span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (canLike) onLike?.(board); }}
              title={canLike ? (liked ? "Unlike" : "Like") : "Sign in to like"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors",
                liked
                  ? "border-red-400/40 bg-red-500/10 text-red-400"
                  : "border-[var(--border)] bg-[var(--surface-overlay)] text-[var(--text-secondary)]",
                canLike ? "hover:border-red-400/50 cursor-pointer" : "cursor-default opacity-70"
              )}
            >
              <Heart size={13} fill={liked ? "currentColor" : "none"} /> {board.likes.toLocaleString()}
            </button>
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--text-muted)]">
              <Download size={13} /> {board.uses.toLocaleString()} download{board.uses === 1 ? "" : "s"}
            </span>
          </div>

          {/* Ratings */}
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)]/40 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <StarRating avg={board.ratingAvg} size={15} />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                {board.ratingCount > 0 ? board.ratingAvg.toFixed(1) : "Not rated yet"}
              </span>
              {board.ratingCount > 0 && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  · {board.ratingCount} rating{board.ratingCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] text-[var(--text-muted)]">
                {canLike ? (myRating ? "Your rating" : "Rate this") : "Sign in to rate"}
              </span>
              <StarRating interactive={!!canLike} myRating={myRating} size={18} onRate={(n) => onRate?.(board, n)} />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0">
          {isOwn && (
            <button
              onClick={() => onDelete?.(board)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="flex-1" />
          {atLimit && (
            <span className="text-[11px] text-[var(--text-muted)] mr-1">Board limit reached (3 max)</span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onUse(board)}
            disabled={atLimit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {used ? <><Check size={14} /> {board.kind === "board" ? "Use again" : "Add again"}</> : <><Download size={14} /> {useLabel}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  hasSearch, onShare, onClear,
}: {
  hasSearch: boolean;
  onShare: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent)]/10 mb-1">
        {hasSearch ? <Search size={26} className="text-[var(--accent)]" /> : <Compass size={26} className="text-[var(--accent)]" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {hasSearch ? "Nothing matches your filters" : "Nothing here yet"}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          {hasSearch
            ? "Try a different search, type, or category."
            : "Be the first — share a board, a block, or a custom item you built."}
        </p>
      </div>
      {hasSearch ? (
        <button
          onClick={onClear}
          className="text-[12px] text-[var(--accent)] hover:opacity-70 transition-opacity"
        >
          Clear filters
        </button>
      ) : (
        <button
          onClick={onShare}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          <Upload size={13} />
          Share your first board
        </button>
      )}
    </div>
  );
}

// ─── Publish modal ────────────────────────────────────────────────────────────

function PublishModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const board = useActiveBoard();
  const { identity, isLoggedIn } = useUser();
  const [kind, setKind] = useState<TemplateKind>("board");
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("productivity");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const MAX_GALLERY = 5;

  const uploadImages = async (files: FileList | null, target: "cover" | "gallery") => {
    if (!files || !isLoggedIn) return;
    setUploading(true);
    try {
      if (target === "cover") {
        const url = await uploadFile(files[0], identity.userId, "community");
        if (url) setCoverUrl(url);
      } else {
        const room = MAX_GALLERY - gallery.length;
        for (const f of Array.from(files).slice(0, room)) {
          const url = await uploadFile(f, identity.userId, "community");
          if (url) setGallery((g) => (g.length < MAX_GALLERY ? [...g, url] : g));
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // Sharable blocks (decks and deck slides excluded — they don't round-trip cleanly)
  const shareableBoxes = (board?.boxes ?? []).filter((b) => !b.deckOwnerId && !b.isDeck);
  // Canvas-level items (widgets/pets placed directly on the board) are publishable too
  const CANVAS_SOURCE = "__canvas__";
  const canvasItems = board?.boardItems ?? [];
  const [boxId, setBoxId] = useState<string>("");
  const selectedBox = boxId === CANVAS_SOURCE ? undefined : shareableBoxes.find((b) => b.id === boxId);
  const [itemId, setItemId] = useState<string>("");
  const sourceItems: (BlockItem | BoardLevelItem)[] = boxId === CANVAS_SOURCE ? canvasItems : (selectedBox?.items ?? []);
  const selectedItem = sourceItems.find((i) => i.id === itemId);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags((prev) => [...prev, t]);
      setTagInput("");
    }
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  // Published items must not carry instance identity, private widget state, or canvas placement
  const stripItem = (raw: BlockItem | BoardLevelItem): Omit<BlockItem, "id" | "showInCollapsed"> => {
    const { id: _id, showInCollapsed: _sc, widgetState: _ws, ...rest } = raw as BlockItem & Partial<BoardLevelItem>;
    const r = rest as Record<string, unknown>;
    delete r.boardX; delete r.boardY; delete r.boardW; delete r.boardH; delete r.zIndex; delete r.locked;
    return rest as Omit<BlockItem, "id" | "showInCollapsed">;
  };

  // Board-level items keep their canvas position/size (boardX/Y/W/H); only the id
  // is dropped so a fresh one is minted on apply.
  const stripBoardItem = (raw: BoardLevelItem): Omit<BoardLevelItem, "id"> => {
    const { id: _id, ...rest } = raw;
    return rest;
  };

  const toTemplateBox = (b: (typeof shareableBoxes)[number], atOrigin: boolean): TemplateBox => ({
    title: b.title,
    x: atOrigin ? 0 : b.x,
    y: atOrigin ? 0 : b.y,
    width: b.width,
    height: b.height,
    style: {
      backgroundColor: b.style.backgroundColor,
      borderColor: b.style.borderColor,
      borderWidth: b.style.borderWidth,
      borderRadius: b.style.borderRadius,
      borderStyle: b.style.borderStyle,
      shadow: b.style.shadow,
    },
    items: b.items.map(stripItem),
  });

  const handleSubmit = async () => {
    if (!name.trim() || !description.trim()) {
      setErrorMsg("Name and description are required.");
      return;
    }
    if (!board) return;
    if (kind === "box" && !selectedBox) { setErrorMsg("Pick a block to share."); return; }
    if (kind === "item" && !selectedItem) { setErrorMsg("Pick a source and an item to share."); return; }
    setStatus("loading");
    setErrorMsg("");

    const boardData =
      kind === "board"
        ? {
            backgroundColor: board.backgroundColor,
            backgroundImage: board.backgroundImage,
            backgroundOpacity: board.backgroundOpacity,
            backgroundSize: board.backgroundSize,
            backgroundPosition: board.backgroundPosition,
            backgroundFilter: board.backgroundFilter,
            backgroundOverlayColor: board.backgroundOverlayColor,
            backgroundOverlayOpacity: board.backgroundOverlayOpacity,
            backgroundVideo: board.backgroundVideo,
            backgroundLiveEffect: board.backgroundLiveEffect,
            backgroundLiveColor: board.backgroundLiveColor,
            backgroundLiveColor2: board.backgroundLiveColor2,
            themeBgColor: board.themeBgColor,
            themeBgImage: board.themeBgImage,
            themeBgOpacity: board.themeBgOpacity,
            themeBgSize: board.themeBgSize,
            boardThemeVars: board.boardThemeVars,
            boardItems: (board.boardItems ?? []).map(stripBoardItem),
            boxes: shareableBoxes.map((b) => toTemplateBox(b, false)),
          }
        : kind === "box"
          ? { boxes: [toTemplateBox(selectedBox!, true)] }
          : {
              boxes: [{
                title: name.trim(),
                x: 0,
                y: 0,
                width: (selectedItem as Partial<BoardLevelItem>).boardW ?? 340,
                height: (selectedItem as Partial<BoardLevelItem>).boardH ?? 400,
                items: [stripItem(selectedItem!)],
              }],
            };

    const input: PublishBoardInput = {
      kind,
      name: name.trim(),
      description: description.trim(),
      category,
      tags,
      boardData,
      previewUrl: coverUrl || undefined,
      previewImages: gallery,
      authorId: isLoggedIn ? identity.userId : undefined,
      authorName: identity.displayName,
      authorAvatarUrl: identity.avatarUrl,
    };

    try {
      await publishCommunityBoard(input);
      onPublished();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 480, maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Share to Community</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Share your whole board, one block, or a single item.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <Field label="What to share">
            <div className="flex gap-1.5">
              {TEMPLATE_KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => { setKind(k.id); setErrorMsg(""); }}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
                    kind === k.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--surface-overlay)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"
                  )}
                >
                  {k.id === "board" ? "Whole board" : k.id === "box" ? "One block" : "One item"}
                </button>
              ))}
            </div>
          </Field>

          {kind !== "board" && (
            <Field label={kind === "item" ? "Source" : "Block"}>
              <div className="relative">
                <select
                  value={boxId}
                  onChange={(e) => { setBoxId(e.target.value); setItemId(""); }}
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 pr-8 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 cursor-pointer"
                >
                  <option value="">— Pick {kind === "item" ? "a source" : "a block"} —</option>
                  {kind === "item" && canvasItems.length > 0 && (
                    <option value={CANVAS_SOURCE}>Canvas ({canvasItems.length} items placed on the board)</option>
                  )}
                  {shareableBoxes.map((b) => (
                    <option key={b.id} value={b.id}>{b.title || "Untitled block"} ({b.items.length} items)</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              </div>
            </Field>
          )}

          {kind === "item" && boxId && (
            <Field label="Item">
              <div className="relative">
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 pr-8 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 cursor-pointer"
                >
                  <option value="">— Pick an item —</option>
                  {sourceItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.type.charAt(0).toUpperCase() + it.type.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              </div>
            </Field>
          )}

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Give your board a clear name"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors placeholder:text-[var(--text-muted)]"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="What's this board for? Who would benefit from it?"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors placeholder:text-[var(--text-muted)] resize-none"
            />
            <span className="text-[11px] text-[var(--text-muted)] self-end">{description.length}/280</span>
          </Field>

          <Field label="Category">
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 pr-8 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 cursor-pointer"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </Field>

          <Field label="Cover & screenshots">
            <div className="flex flex-col gap-2">
              {/* Cover */}
              <div className="flex items-start gap-3">
                {coverUrl ? (
                  <div className="relative h-20 w-32 rounded-lg overflow-hidden border border-[var(--border)] shrink-0">
                    <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setCoverUrl("")}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <label className={cn(
                    "h-20 w-32 rounded-lg border border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1 text-[11px] text-[var(--text-muted)] shrink-0",
                    isLoggedIn ? "cursor-pointer hover:border-[var(--accent)]/50 hover:text-[var(--text-secondary)]" : "opacity-50 cursor-not-allowed"
                  )}>
                    <ImagePlus size={18} />
                    Cover image
                    <input
                      type="file" accept="image/*" className="hidden" disabled={!isLoggedIn}
                      onChange={(e) => { void uploadImages(e.target.files, "cover"); e.target.value = ""; }}
                    />
                  </label>
                )}
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  The cover shows on the card. Add screenshots below to showcase it in the detail view.
                </p>
              </div>
              {/* Gallery */}
              <div className="flex flex-wrap gap-2">
                {gallery.map((src, i) => (
                  <div key={src + i} className="relative h-14 w-20 rounded-md overflow-hidden border border-[var(--border)]">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setGallery((g) => g.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {gallery.length < MAX_GALLERY && (
                  <label className={cn(
                    "h-14 w-20 rounded-md border border-dashed border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]",
                    isLoggedIn ? "cursor-pointer hover:border-[var(--accent)]/50" : "opacity-50 cursor-not-allowed"
                  )}>
                    <ImagePlus size={16} />
                    <input
                      type="file" accept="image/*" multiple className="hidden" disabled={!isLoggedIn}
                      onChange={(e) => { void uploadImages(e.target.files, "gallery"); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
              {uploading && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <Loader2 size={11} className="animate-spin" /> Uploading…
                </span>
              )}
            </div>
          </Field>

          <Field label={`Tags (${tags.length}/5)`}>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                placeholder="Type a tag and press Enter"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors placeholder:text-[var(--text-muted)]"
              />
              <button
                onClick={addTag}
                disabled={tags.length >= 5}
                className="px-3 py-2 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:opacity-60 transition-opacity"><X size={8} /></button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Error / backend notice */}
          {(status === "error" || errorMsg) && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-400">
              {errorMsg}
            </div>
          )}

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
            {!isLoggedIn
              ? "🔒 Sign in to publish — guests can browse and use community shares, but not post them."
              : kind === "board"
                ? `📦 ${shareableBoxes.length} block(s) from "${board?.name ?? "this board"}" will be shared publicly.`
                : kind === "box"
                  ? "📦 The selected block and its items will be shared publicly."
                  : "📦 The selected item will be shared publicly as an addable community item."}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={status === "loading" || uploading || !isLoggedIn}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {status === "loading" ? "Publishing…" : uploading ? "Uploading…" : <><Upload size={13} /> Publish</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-5">
      <style>{`@keyframes tmpl-shimmer{0%{background-position:-450px 0}100%{background-position:450px 0}}
        .tmpl-sk{background:linear-gradient(90deg,var(--surface-overlay) 0%,var(--surface-raised) 50%,var(--surface-overlay) 100%);background-size:900px 100%;animation:tmpl-shimmer 1.4s linear infinite}`}</style>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="h-40 tmpl-sk" />
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="h-3.5 w-3/4 rounded tmpl-sk" />
            <div className="h-2.5 w-full rounded tmpl-sk" />
            <div className="h-2.5 w-2/3 rounded tmpl-sk" />
            <div className="h-6 w-full rounded tmpl-sk mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return avatarUrl ? (
    <img src={avatarUrl} alt={name} className="w-5 h-5 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 text-[10px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
