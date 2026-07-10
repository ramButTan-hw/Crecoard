"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileText, List, Video, Timer,
  BarChart2, Plug, CalendarDays, Table2,
  Code2, Music, Kanban, MessageSquare, FolderOpen,
  ChevronDown, ChevronRight,
  Layers, LayoutGrid, Image, KanbanSquare, Zap, Gamepad2,
  Lightbulb, PenLine, Vote, Twitch, Puzzle, GraduationCap, HelpCircle, AudioLines,
} from "lucide-react";
import { getInstalledItems, uninstallItem, INSTALLED_CHANGED_EVENT } from "@/lib/installedItems";
import { useDraggable } from "@dnd-kit/core";
import { BlockItem, ItemType, useBoardStore, useActiveBoard } from "@/store/boardStore";
import { useHasAppBg } from "@/lib/useHasAppBg";
import { useServerBoard, useServerBoardData } from "@/contexts/ServerBoardContext";
import { DEFAULT_WIDGET_CODE } from "@/lib/defaultWidgetCode";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";

// ─── Item definitions (exported so ExpandedBlock can reuse) ──────────────────

export const ITEM_DEFINITIONS: {
  type: ItemType;
  /** Unique palette key when several defs share a type (installed community items). Defaults to `type`. */
  key?: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  serverOnly?: boolean;
  /** Set on installed community items — right-click removes them from the library. */
  onRemove?: () => void;
  defaultItem: () => Omit<BlockItem, "id" | "showInCollapsed">;
}[] = [
  {
    type: "text",
    label: "Text",
    icon: <FileText size={15} />,
    description: "Styled paragraph",
    defaultItem: () => ({ type: "text", text: "", fontSize: 14, bold: false, italic: false, align: "left" }),
  },
  {
    type: "list",
    label: "List",
    icon: <List size={15} />,
    description: "Checklist / to-do",
    defaultItem: () => ({ type: "list", listItems: [{ id: nanoid(), text: "", checked: false }], listFontAutoScale: true }),
  },
  {
    type: "image",
    label: "Image",
    icon: <Image size={15} />,
    description: "Photo or picture",
    defaultItem: () => ({ type: "image", imageFit: "cover" }),
  },
  {
    type: "embed",
    label: "Embed",
    icon: <Video size={15} />,
    description: "YouTube or any URL",
    defaultItem: () => ({ type: "embed", embedUrl: "" }),
  },
  {
    type: "timer",
    label: "Timer",
    icon: <Timer size={15} />,
    description: "Countdown / stopwatch",
    defaultItem: () => ({ type: "timer", timerSeconds: 300, timerLabel: "" }),
  },
  {
    type: "graph",
    label: "Graph",
    icon: <BarChart2 size={15} />,
    description: "Bar, line, or pie chart",
    defaultItem: () => ({
      type: "graph",
      graphType: "bar",
      graphData: [{ label: "A", value: 40 }, { label: "B", value: 65 }, { label: "C", value: 30 }],
    }),
  },
  {
    type: "api",
    label: "API",
    icon: <Plug size={15} />,
    description: "Fetch data from any REST API",
    defaultItem: () => ({ type: "api", apiMethod: "GET" as const, apiDisplayMode: "value" as const }),
  },
  {
    type: "table",
    label: "Table",
    icon: <Table2 size={15} />,
    description: "Editable table with typed columns",
    defaultItem: () => ({
      type: "table",
      tableColumns: [
        { id: "c1", name: "Name", type: "text" as const },
        { id: "c2", name: "Status", type: "select" as const, options: ["Todo", "In Progress", "Done"] },
        { id: "c3", name: "Done", type: "checkbox" as const },
      ],
      tableRows: [
        { id: "r1", cells: { c1: "", c2: "Todo", c3: false } },
        { id: "r2", cells: { c1: "", c2: "Todo", c3: false } },
      ],
    }),
  },
  {
    type: "calendar",
    label: "Calendar",
    icon: <CalendarDays size={15} />,
    description: "Monthly calendar with events",
    defaultItem: () => ({ type: "calendar", calendarEvents: [], calendarShowWeekends: true }),
  },
  {
    type: "widget",
    label: "Custom Widget",
    icon: <Code2 size={15} />,
    description: "HTML · CSS · JS — build anything",
    defaultItem: () => ({ type: "widget", widgetCode: DEFAULT_WIDGET_CODE }),
  },
  {
    type: "playlist",
    label: "Playlist",
    icon: <Music size={15} />,
    description: "Music queue — paste YouTube links",
    defaultItem: () => ({ type: "playlist", playlistTracks: [], playlistCurrentIndex: 0, playlistLoop: true }),
  },
  {
    type: "kanban",
    label: "Kanban",
    icon: <Kanban size={15} />,
    description: "Drag-and-drop card board",
    defaultItem: () => ({
      type: "kanban",
      kanbanColumns: [
        { id: "col-todo",       title: "To Do",       color: "#d59ee8" },
        { id: "col-inprogress", title: "In Progress",  color: "#f2994a" },
        { id: "col-done",       title: "Done",         color: "#48cfa6", isDone: true },
      ],
      kanbanCards: [
        { id: nanoid(), columnId: "col-todo",       text: "Plan the week",   order: 0 },
        { id: nanoid(), columnId: "col-todo",       text: "Research topic",  order: 1 },
        { id: nanoid(), columnId: "col-inprogress", text: "Write outline",   order: 0 },
        { id: nanoid(), columnId: "col-done",       text: "Brainstorm ideas", order: 0 },
      ],
    }),
  },
  {
    type: "chat",
    label: "Chat Channel",
    icon: <MessageSquare size={15} />,
    description: "Real-time chat channel",
    serverOnly: true,
    defaultItem: () => ({ type: "chat", chatChannelName: "general" }),
  },
  {
    type: "filebank",
    label: "File Bank",
    icon: <FolderOpen size={15} />,
    description: "Shared file storage block",
    serverOnly: true,
    defaultItem: () => ({ type: "filebank", fileBankTitle: "Files" }),
  },
  {
    type: "external",
    label: "Live Stats",
    icon: <Gamepad2 size={15} />,
    description: "Tracker.gg · Steam — live player data",
    defaultItem: () => ({ type: "external" }),
  },
  {
    type: "suggestion",
    label: "Suggestion Box",
    icon: <Lightbulb size={15} />,
    description: "Viewers suggest & upvote ideas",
    serverOnly: true,
    defaultItem: () => ({ type: "suggestion", suggestionAllowUpvotes: true }),
  },
  {
    type: "guestbook",
    label: "Guestbook",
    icon: <PenLine size={15} />,
    description: "Visitors leave signed messages",
    serverOnly: true,
    defaultItem: () => ({ type: "guestbook" }),
  },
  {
    type: "poll",
    label: "Poll",
    icon: <Vote size={15} />,
    description: "Viewers vote — live results",
    serverOnly: true,
    defaultItem: () => ({
      type: "poll",
      pollShowResults: "afterVote",
      pollOptions: [
        { id: nanoid(), label: "" },
        { id: nanoid(), label: "" },
      ],
    }),
  },
  {
    type: "twitch",
    label: "Twitch Status",
    icon: <Twitch size={15} />,
    description: "Live / offline + next stream",
    serverOnly: true,
    defaultItem: () => ({ type: "twitch", twitchShowSchedule: true }),
  },
  {
    type: "flashcard",
    label: "Flashcards",
    icon: <GraduationCap size={15} />,
    description: "Flip-card study deck",
    defaultItem: () => ({
      type: "flashcard",
      flashcards: [
        { id: nanoid(), front: "Term", back: "Definition" },
      ],
    }),
  },
  {
    type: "quiz",
    label: "Quiz",
    icon: <HelpCircle size={15} />,
    description: "Multiple-choice quiz with scoring",
    defaultItem: () => ({
      type: "quiz",
      quizInstant: true,
      quizQuestions: [
        { id: nanoid(), prompt: "Your question?", options: ["Option A", "Option B"], correctIndex: 0 },
      ],
    }),
  },
  {
    type: "visualizer",
    label: "Visualizer",
    icon: <AudioLines size={15} />,
    description: "Audio bars, rain, particles & more",
    defaultItem: () => ({
      type: "visualizer",
      visualizerEffect: "bars",
      visualizerColor: "#d59ee8",
      visualizerColor2: "#48cfa6",
      visualizerBgColor: "#0d0e11",
    }),
  },
  {
    type: "embed-card",
    label: "Integration Card",
    icon: <Zap size={15} />,
    description: "Webhook / bot display card",
    defaultItem: () => ({
      type: "embed-card",
      embedCard: {
        title: "Integration Card",
        description: "This card is updated by an incoming webhook. Send a POST request to your board's webhook URL to populate it.",
        accentColor: "#d59ee8",
        source: "custom",
        fields: [
          { label: "Status", value: "No data yet", inline: true },
        ],
      },
    }),
  },
];

// ─── Draggable palette item ───────────────────────────────────────────────────

function DraggableItem({ def, selectedBoxId, onPick, tapMode, dense }: { def: (typeof ITEM_DEFINITIONS)[number]; selectedBoxId: string | null; onPick?: (def: (typeof ITEM_DEFINITIONS)[number]) => void; tapMode?: boolean; dense?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${def.key ?? def.type}`,
    data: { kind: "new-item", itemType: def.type, defaultItem: def.defaultItem },
    disabled: tapMode, // mobile: tap to add instead of drag
  });

  // Tap-to-add mode (mobile bottom sheet) — no drag, placed at canvas center.
  if (tapMode && onPick) {
    return (
      <button
        onClick={() => onPick(def)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] active:bg-[var(--surface-overlay)]"
      >
        <span className="flex-shrink-0 text-[var(--text-muted)]">{def.icon}</span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm leading-tight">{def.label}</span>
          <span className="text-[11px] leading-tight text-[var(--text-muted)]">{def.description}</span>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab items-center gap-2.5 rounded-lg px-3 text-sm transition-all select-none",
        dense ? "py-1.5" : "py-2",
        isDragging ? "opacity-40" : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]",
        selectedBoxId && "text-[var(--accent)] hover:bg-[var(--accent)]/10"
      )}
      // In dense mode the description moves to the tooltip so each row is one line
      title={`${def.description}${onPick ? " · click or drag to add" : " · drag onto a block or empty canvas"}${def.onRemove ? " · right-click to uninstall" : ""}`}
      onClick={onPick ? () => onPick(def) : undefined}
      onContextMenu={def.onRemove ? (e) => { e.preventDefault(); e.stopPropagation(); def.onRemove!(); } : undefined}
    >
      <span className={cn("flex-shrink-0", selectedBoxId ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>{def.icon}</span>
      {dense ? (
        <span className="min-w-0 truncate text-sm leading-tight">{def.label}</span>
      ) : (
        <div className="flex flex-col min-w-0">
          <span className="text-sm leading-tight">{def.label}</span>
          <span className="text-[11px] text-[var(--text-muted)] leading-tight">{def.description}</span>
        </div>
      )}
    </div>
  );
}

// ─── Icon-rail item (collapsed palette) ───────────────────────────────────────

function RailItem({ def, onPick }: { def: (typeof ITEM_DEFINITIONS)[number]; onPick?: (def: (typeof ITEM_DEFINITIONS)[number]) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${def.key ?? def.type}`,
    data: { kind: "new-item", itemType: def.type, defaultItem: def.defaultItem },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={`${def.label} — click to add, drag to place`}
      onClick={onPick ? () => onPick(def) : undefined}
      onContextMenu={def.onRemove ? (e) => { e.preventDefault(); e.stopPropagation(); def.onRemove!(); } : undefined}
      className={cn(
        "flex h-9 w-9 cursor-grab items-center justify-center rounded-lg transition-colors select-none",
        isDragging ? "opacity-40" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
    >
      {def.icon}
    </div>
  );
}

// Palette groups — a flat 20-item list stopped scaling; the rail + search need structure.
// Four broad buckets instead of six — fewer headers to scan.
const GROUP_OF: Record<string, string> = {
  text: "Basics", list: "Basics", image: "Basics", table: "Basics", calendar: "Basics", kanban: "Basics",
  embed: "Media", playlist: "Media", timer: "Media", widget: "Media", visualizer: "Media",
  graph: "Data & Advanced", api: "Data & Advanced", external: "Data & Advanced", "embed-card": "Data & Advanced",
  flashcard: "Data & Advanced", quiz: "Data & Advanced",
  chat: "Community", filebank: "Community", suggestion: "Community", guestbook: "Community", poll: "Community", twitch: "Community",
};
const GROUP_ORDER = ["Basics", "Media", "Data & Advanced", "Community", "Other"];

// New-user starter set — the rest hide behind "Show all items" until they've
// built something, so a first-timer isn't faced with 24 choices at once.
const STARTER_TYPES = new Set<ItemType>(["text", "list", "table", "calendar", "kanban", "image"]);

// ─── Collapsible section header ───────────────────────────────────────────────

function SectionHeader({
  label, open, onToggle, count,
}: { label: string; open: boolean; onToggle: () => void; count?: number }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
    >
      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      {label}
      {count !== undefined && (
        <span className="ml-auto text-[11px] font-normal tabular-nums">{count}</span>
      )}
    </button>
  );
}

// ─── Item type icon (small, for collection) ───────────────────────────────────

function ItemTypeIcon({ type, size = 11 }: { type: ItemType; size?: number }) {
  const p = { size, className: "flex-shrink-0 text-[var(--text-muted)]" };
  switch (type) {
    case "text": return <FileText {...p} />;
    case "list": return <List {...p} />;
    case "table": return <Table2 {...p} />;
    case "image": return <Image {...p} />;
    case "calendar": return <CalendarDays {...p} />;
    case "timer": return <Timer {...p} />;
    case "embed": return <Video {...p} />;
    case "api": return <Plug {...p} />;
    case "graph": return <BarChart2 {...p} />;
    case "playlist": return <Music {...p} />;
    case "kanban": return <KanbanSquare {...p} />;
    case "chat": return <MessageSquare {...p} />;
    case "filebank": return <FolderOpen {...p} />;
    case "widget": return <Code2 {...p} />;
    case "suggestion": return <Lightbulb {...p} />;
    case "guestbook": return <PenLine {...p} />;
    case "poll": return <Vote {...p} />;
    case "twitch": return <Twitch {...p} />;
    case "flashcard": return <GraduationCap {...p} />;
    case "quiz": return <HelpCircle {...p} />;
    case "visualizer": return <AudioLines {...p} />;
    default: return <FileText {...p} />;
  }
}

const TYPE_LABEL: Partial<Record<ItemType, string>> = {
  text: "Text", list: "List", table: "Table", image: "Image",
  calendar: "Calendar", timer: "Timer", embed: "Embed", api: "API",
  graph: "Graph", playlist: "Playlist", kanban: "Kanban",
  chat: "Chat", filebank: "Files", widget: "Widget",
  suggestion: "Suggestions", guestbook: "Guestbook", poll: "Poll", twitch: "Twitch",
  flashcard: "Flashcards", quiz: "Quiz", visualizer: "Visualizer",
};

// ─── Collection section ───────────────────────────────────────────────────────

function CollectionSection({ boardId }: { boardId: string }) {
  const board = useBoardStore((s) =>
    s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId]
  );
  const [expandedBoxIds, setExpandedBoxIds] = useState<Set<string>>(new Set());
  const [canvasOpen, setCanvasOpen] = useState(false);

  if (!board) return null;

  const toggle = (id: string) =>
    setExpandedBoxIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const canvasItems = board.boardItems ?? [];
  const totalItems = board.boxes.reduce((a, bx) => a + bx.items.length, 0) + canvasItems.length;

  if (board.boxes.length === 0 && canvasItems.length === 0) {
    return (
      <p className="px-4 pb-3 text-[11px] text-[var(--text-muted)] italic">
        Board is empty.
      </p>
    );
  }

  return (
    <div className="pb-2 space-y-0.5">
      {/* Blocks */}
      {board.boxes.map((box) => {
        const isOpen = expandedBoxIds.has(box.id);
        return (
          <div key={box.id}>
            <button
              onClick={() => toggle(box.id)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 hover:bg-[var(--surface-overlay)] rounded-lg mx-1 transition-colors text-left"
              style={{ width: "calc(100% - 8px)" }}
            >
              {isOpen ? <ChevronDown size={11} className="text-[var(--text-muted)] flex-shrink-0" /> : <ChevronRight size={11} className="text-[var(--text-muted)] flex-shrink-0" />}
              <LayoutGrid size={11} className="text-[var(--accent)] flex-shrink-0" />
              <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">{box.title || "Untitled"}</span>
              <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">{box.items.length}</span>
            </button>
            {isOpen && (
              <div className="ml-5 mb-1 space-y-0.5">
                {box.items.length === 0 ? (
                  <p className="px-3 py-1 text-[11px] text-[var(--text-muted)] italic">Empty</p>
                ) : (
                  box.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5 px-3 py-0.5">
                      <ItemTypeIcon type={item.type} />
                      <span className="text-[11px] text-[var(--text-muted)] truncate">
                        {TYPE_LABEL[item.type] ?? item.type}
                        {item.text ? <span className="opacity-60"> — {item.text.slice(0, 30)}</span> : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Canvas items */}
      {canvasItems.length > 0 && (
        <div>
          <button
            onClick={() => setCanvasOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 hover:bg-[var(--surface-overlay)] rounded-lg mx-1 transition-colors text-left"
            style={{ width: "calc(100% - 8px)" }}
          >
            {canvasOpen ? <ChevronDown size={11} className="text-[var(--text-muted)] flex-shrink-0" /> : <ChevronRight size={11} className="text-[var(--text-muted)] flex-shrink-0" />}
            <Layers size={11} className="text-[var(--accent)] flex-shrink-0" />
            <span className="text-[11px] text-[var(--text-secondary)] flex-1">Canvas items</span>
            <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">{canvasItems.length}</span>
          </button>
          {canvasOpen && (
            <div className="ml-5 mb-1 space-y-0.5">
              {canvasItems.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 px-3 py-0.5">
                  <ItemTypeIcon type={item.type} />
                  <span className="text-[11px] text-[var(--text-muted)] truncate">
                    {TYPE_LABEL[item.type] ?? item.type}
                    {item.text ? <span className="opacity-60"> — {item.text.slice(0, 30)}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main palette ─────────────────────────────────────────────────────────────

export function ItemPalette({ onPick, desktop }: { onPick?: (def: (typeof ITEM_DEFINITIONS)[number]) => void; desktop?: boolean } = {}) {
  const personalBoard = useActiveBoard();
  const serverBoard = useServerBoardData();
  const board = serverBoard ?? personalBoard;
  const selectedBoxId = useBoardStore((s) => s.selectedBoxId);
  const hasAppBg = useHasAppBg();
  const { serverId } = useServerBoard();
  const visibleDefs = ITEM_DEFINITIONS.filter(d => !d.serverOnly || serverId !== null);
  const mobile = !!onPick && !desktop;

  const [collectionOpen, setCollectionOpen] = useState(true);
  const [search, setSearch] = useState("");
  // Accordion: which item groups are expanded. Default to just the first
  // ("Basics") so the panel opens calm instead of dumping all ~23 items.
  // The remembered state is loaded AFTER mount (below) — reading localStorage in
  // the useState initializer would make SSR and the first client render disagree
  // (chevron rotation / which items show) → a hydration mismatch.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set([GROUP_ORDER[0]]));
  useEffect(() => {
    try {
      const raw = localStorage.getItem("crecoard-palette-groups");
      if (raw) setOpenGroups(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggleGroup = (g: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    try { localStorage.setItem("crecoard-palette-groups", JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const [showAllItems, setShowAllItems] = useState(() => typeof window !== "undefined" && localStorage.getItem("crecoard-palette-expanded") === "1");
  const [rail, setRail] = useState(() => typeof window !== "undefined" && localStorage.getItem("crecoard-palette-rail") === "1");
  const toggleRail = () => setRail((v) => {
    const next = !v;
    try { localStorage.setItem("crecoard-palette-rail", next ? "1" : "0"); } catch {}
    return next;
  });

  // Installed community items — the "mod library" (refreshes when installs change)
  const [installedTick, setInstalledTick] = useState(0);
  useEffect(() => {
    const onChange = () => setInstalledTick((t) => t + 1);
    window.addEventListener(INSTALLED_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(INSTALLED_CHANGED_EVENT, onChange);
  }, []);
  const installedDefs: typeof ITEM_DEFINITIONS = useMemo(
    () =>
      getInstalledItems().map((inst) => ({
        type: inst.item.type,
        key: `installed-${inst.id}`,
        label: inst.name,
        icon: <Puzzle size={15} />,
        description: `by ${inst.author} · community`,
        onRemove: () => uninstallItem(inst.id),
        defaultItem: () => JSON.parse(JSON.stringify(inst.item)) as Omit<BlockItem, "id" | "showInCollapsed">,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedTick]
  );

  const q = search.trim().toLowerCase();
  const filteredDefs = q
    ? visibleDefs.filter((d) => `${d.label} ${d.description}`.toLowerCase().includes(q))
    : visibleDefs;
  const filteredInstalled = q
    ? installedDefs.filter((d) => `${d.label} ${d.description}`.toLowerCase().includes(q))
    : installedDefs;
  const groups = GROUP_ORDER
    .map((g) => ({ g, defs: filteredDefs.filter((d) => (GROUP_OF[d.type] ?? "Other") === g) }))
    .filter((x) => x.defs.length > 0);
  if (filteredInstalled.length > 0) groups.push({ g: "Installed", defs: filteredInstalled });

  // First-run curation: until the board has content (or the user expands), show
  // just a starter set. Searching always reveals the full matching list.
  const hasContent = !!board && (board.boxes.length > 0 || (board.boardItems?.length ?? 0) > 0);
  const beginnerMode = !hasContent && !showAllItems && !q;
  const starterDefs = visibleDefs.filter((d) => STARTER_TYPES.has(d.type));
  const revealAll = () => {
    setShowAllItems(true);
    try { localStorage.setItem("crecoard-palette-expanded", "1"); } catch { /* ignore */ }
  };

  const collectionCount = board
    ? board.boxes.reduce((a, bx) => a + bx.items.length, 0) + (board.boardItems?.length ?? 0)
    : 0;

  if (board?.isFinished) return null;

  // Collapsed icon rail — reclaims canvas width; icons stay draggable and click-to-add.
  if (!mobile && rail) {
    return (
      <div
        data-tour="palette"
        className="flex w-12 flex-shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-[var(--border)] py-2"
        style={{ background: hasAppBg ? "transparent" : "var(--surface-raised)" }}
      >
        <button onClick={toggleRail} title="Expand palette"
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronRight size={14} />
        </button>
        {groups.map(({ g, defs }, gi) => (
          <div key={g} className="flex flex-col items-center gap-0.5">
            {gi > 0 && <div className="my-1.5 h-px w-6 bg-[var(--border)]" />}
            {defs.map((def) => <RailItem key={def.key ?? def.type} def={def} onPick={onPick} />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-tour="palette"
      className={cn(
        "flex flex-col overflow-y-auto",
        mobile ? "w-full" : "w-[196px] flex-shrink-0 border-r border-[var(--border)]"
      )}
      style={{ background: mobile ? "transparent" : (hasAppBg ? "transparent" : "var(--surface-raised)") }}
    >
      {/* Items section */}
      <div className="border-b border-[var(--border)]">
        {!mobile && (
          <div className="flex w-full items-center justify-between py-1 pl-3 pr-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Items
            <button onClick={toggleRail} title="Collapse to icon rail"
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronDown size={13} className="rotate-90" />
            </button>
          </div>
        )}
        {/* Search — on mobile too, so a full board's ~20 items are one type away
            instead of a long scroll. */}
        <div className={cn(mobile ? "px-3 pb-2 pt-1" : "px-2 pb-1.5")}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className={cn(
              "w-full rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]",
              mobile ? "px-3 py-2 text-sm" : "px-2 py-1 text-[11px]"
            )}
          />
        </div>
        <div className="pb-2">
          {beginnerMode ? (
            <>
              {!mobile && <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] opacity-70">Start with</p>}
              {starterDefs.map((def) => (
                <DraggableItem key={def.key ?? def.type} def={def} selectedBoxId={selectedBoxId} onPick={onPick} tapMode={mobile} />
              ))}
              <button
                onClick={revealAll}
                className="mt-1 flex w-full items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                <ChevronDown size={12} /> Show all items ({visibleDefs.length - starterDefs.length} more)
              </button>
            </>
          ) : (
            <>
              {groups.map(({ g, defs }) => {
                // Searching forces every group open so matches are never hidden.
                const expanded = !!q || openGroups.has(g);
                return (
                  <div key={g}>
                    {/* Collapsible section header — on mobile too, so the sheet opens
                        calm (just "Basics") instead of dumping all ~20 items. */}
                    <button
                      onClick={() => toggleGroup(g)}
                      disabled={!!q}
                      className={cn(
                        "flex w-full items-center gap-1.5 px-3 font-semibold uppercase tracking-wider text-[var(--text-muted)] opacity-70 transition-opacity hover:opacity-100",
                        mobile ? "py-2.5 text-[11px]" : "pb-0.5 pt-2 text-[10px]"
                      )}
                    >
                      <ChevronRight size={mobile ? 13 : 11} className={cn("transition-transform", expanded && "rotate-90")} />
                      <span className="flex-1 text-left">{g}</span>
                      <span className="font-normal opacity-70">{defs.length}</span>
                    </button>
                    {expanded && defs.map((def) => (
                      <DraggableItem key={def.key ?? def.type} def={def} selectedBoxId={selectedBoxId} onPick={onPick} tapMode={mobile} dense={!mobile} />
                    ))}
                  </div>
                );
              })}
              {groups.length === 0 && <p className="px-3 py-3 text-[11px] text-[var(--text-muted)]">No items match.</p>}
            </>
          )}
        </div>
      </div>

      {/* Collection section — desktop only (mobile sheet stays focused on adding) */}
      {!mobile && board && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label="Collection"
            open={collectionOpen}
            onToggle={() => setCollectionOpen((v) => !v)}
            count={collectionCount || undefined}
          />
          {collectionOpen && <CollectionSection boardId={board.id} />}
        </div>
      )}
    </div>
  );
}
