"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check, Plus, Trash2, ExternalLink, Play, Pause, RotateCcw,
  ImageIcon, Upload, X as XIcon,
  Filter, Search, ArrowUpDown, ArrowUp, ArrowDown,
  Music, SkipBack, SkipForward, Repeat, Shuffle, Volume1, Volume2, VolumeX,
  Radio, Users, Lock, LockOpen, CheckSquare, Square, Copy, FileDown, CopyPlus,
  ArrowUpToLine, ArrowDownToLine, Maximize2, Eye, EyeOff, CalendarDays, Code2, Pencil,
  List, ListOrdered, Link2, Unlink, IndentIncrease, IndentDecrease, RemoveFormatting, GripVertical, Pin, Bell, Palette,
} from "lucide-react";
import { WallpaperEditor } from "@/components/ui/WallpaperEditor";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Sector,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList,
} from "recharts";
import { BlockItem, BoardLevelItem, CalendarEvent, CalendarFeed, TableLink, SourceLink, TableColumn, TableRow, TableFilter, FilterOp, ListEntry, PlaylistTrack, GraphPoint, KanbanCard, KanbanColumn, useBoardStore, type Board } from "@/store/boardStore";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, closestCorners,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { useShallow } from "zustand/react/shallow";
import { FontPicker } from "@/components/ui/FontPicker";
import { loadGoogleFont } from "@/lib/fonts";
import { DEFAULT_WIDGET_CODE } from "@/lib/defaultWidgetCode";
import { EmbedCardItem } from "@/components/items/EmbedCardItem";
import { ExternalItem } from "@/components/items/ExternalItem";
import { SuggestionItem, GuestbookItem, PollItem } from "@/components/items/CommunityItems";
import { FlashcardItem, QuizItem } from "@/components/items/StudyItems";
import { VisualizerItem } from "@/components/items/VisualizerItem";
import { TwitchItem } from "@/components/items/TwitchItem";
import { nanoid } from "nanoid";
import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { useItemContributions } from "@/contexts/BoardContributionsContext";
import { useCanEditBoard, useServerBoard, useItemPerms, roleAllowed } from "@/contexts/ServerBoardContext";
import { resolveEmbed, PLATFORM_COLORS, getStaticThumbnail, advancePlaylistIndex, playerKeyOf } from "@/lib/playlist";
import { usePlayerStore } from "@/store/playerStore";
import { usePlayerSession, announceSessionState } from "@/lib/playerSession";
import { useBoardContributions } from "@/contexts/BoardContributionsContext";
import { animClassFor, type AnimSpec } from "@/lib/animSpec";
import { AnimationStudio } from "@/components/ui/AnimationStudio";
import { uploadFile, applyImageUpload } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { buildIcs } from "@/lib/ics";
import { REMINDER_LEADS, eventStartDate, createReminder } from "@/lib/reminders";
import { ContextMenu, ContextMenuEntry } from "@/components/ui/ContextMenu";
import { DueChip, MemberAvatar, AssigneeRows, TaskFieldsPopover, MemberPickerPopover, RemindMeControl } from "@/components/items/TaskFields";
import { htmlToPlainText } from "@/lib/taskFacts";
import { WIDGET_PERMISSIONS, METHOD_PERMISSIONS, WIDGET_API_VERSION, RateLimiter, clampCoord, clampSize, type WidgetApiResponse, type WidgetApiErrorCode } from "@/lib/widgetApi";
import { useCollab } from "@/lib/useCollabSession";
import type { ServerMember } from "@/types/server";

const CHART_COLORS = ["#d59ee8", "#48cfa6", "#f2994a", "#eb5757", "#9b51e0", "#2d9cdb"];

// ─── Paragraph style presets (Google Docs-style) ──────────────────────────────
export const PARA_STYLES: {
  id: string; label: string;
  fontSize: number; bold: boolean; italic: boolean; fontFamily?: string;
}[] = [
  { id: "normal",   label: "Normal",    fontSize: 14, bold: false, italic: false },
  { id: "title",    label: "Title",     fontSize: 40, bold: true,  italic: false },
  { id: "subtitle", label: "Subtitle",  fontSize: 18, bold: false, italic: true  },
  { id: "h1",       label: "Heading 1", fontSize: 30, bold: true,  italic: false },
  { id: "h2",       label: "Heading 2", fontSize: 22, bold: true,  italic: false },
  { id: "h3",       label: "Heading 3", fontSize: 16, bold: true,  italic: false },
  { id: "caption",  label: "Caption",   fontSize: 11, bold: false, italic: true  },
  { id: "code",     label: "Code",      fontSize: 13, bold: false, italic: false, fontFamily: "Courier New" },
];

// Whole-item aesthetic presets for the Text block — one click sets font, size,
// colour and background together. Minimalist: text labels, no emoji.
export const TEXT_PRESETS: { id: string; label: string; style: Partial<BlockItem> }[] = [
  { id: "document", label: "Document", style: { fontFamily: "Georgia",         fontSize: 16, bold: false, italic: false, align: "left", textColor: "",        textBgColor: "" } },
  { id: "note",     label: "Note",     style: { fontFamily: "Inter",           fontSize: 14, bold: false, italic: false, align: "left", textColor: "",        textBgColor: "rgba(255,255,255,0.04)" } },
  { id: "heading",  label: "Heading",  style: { fontFamily: "Inter",           fontSize: 28, bold: true,  italic: false, align: "left", textColor: "",        textBgColor: "" } },
  { id: "callout",  label: "Callout",  style: { fontFamily: "Inter",           fontSize: 15, bold: false, italic: false, align: "left", textColor: "#ffffff", textBgColor: "var(--accent)" } },
  { id: "mono",     label: "Mono",     style: { fontFamily: "JetBrains Mono",   fontSize: 13, bold: false, italic: false, align: "left", textColor: "",        textBgColor: "" } },
];

// Inline markdown shortcut: when invoked (on space), converts a **bold**, *italic*,
// ~~strike~~ or `code` run ending right before the cursor into the matching inline
// element. Pure DOM — works in any contentEditable (Text block + List rows).
// Returns true if it converted (caller should preventDefault + persist innerHTML).
function applyInlineMarkdownAtCursor(): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) return false;
  const textNode = container as Text;
  const before = textNode.data.slice(0, range.startOffset);
  const patterns: { re: RegExp; make: (inner: string) => HTMLElement }[] = [
    { re: /\*\*([^*]+)\*\*$/,          make: (s) => { const el = document.createElement("strong"); el.textContent = s; return el; } },
    { re: /(?<!\*)\*([^*\s][^*]*)\*$/, make: (s) => { const el = document.createElement("em"); el.textContent = s; return el; } },
    { re: /~~([^~]+)~~$/,              make: (s) => { const el = document.createElement("s"); el.textContent = s; return el; } },
    { re: /`([^`]+)`$/,                make: (s) => { const el = document.createElement("code"); el.textContent = s; el.style.cssText = "font-family:monospace;background:var(--surface-overlay);padding:0 4px;border-radius:3px"; return el; } },
  ];
  for (const { re, make } of patterns) {
    const m = before.match(re);
    if (!m) continue;
    const start = m.index!;
    const afterText = textNode.data.slice(range.startOffset);
    textNode.data = textNode.data.slice(0, start);
    const el = make(m[1]!);
    const space = document.createTextNode(" ");
    const afterNode = document.createTextNode(afterText);
    const parent = textNode.parentNode!;
    parent.insertBefore(afterNode, textNode.nextSibling);
    parent.insertBefore(space, afterNode);
    parent.insertBefore(el, space);
    const r = document.createRange();
    r.setStart(space, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }
  return false;
}

// One-click looks for the List item — minimalist, text labels (no emoji).
const LIST_PRESETS: { id: string; label: string; style: Partial<BlockItem> }[] = [
  { id: "checklist", label: "Checklist", style: { listMarker: "checkbox", listDividerStyle: "none",  listRowSpacing: 6 } },
  { id: "outline",   label: "Outline",   style: { listMarker: "bullet",   listDividerStyle: "none",  listRowSpacing: 4 } },
  { id: "steps",     label: "Steps",     style: { listMarker: "number",   listDividerStyle: "solid", listRowSpacing: 8 } },
  { id: "minimal",   label: "Minimal",   style: { listMarker: "none",     listDividerStyle: "none",  listRowSpacing: 2 } },
];

const API_PRESETS: { id: string; label: string; url: string; method: "GET" | "POST"; authType: "none" | "bearer" | "apikey"; authHeader?: string; note?: string }[] = [
  { id: "jsonplaceholder", label: "JSONPlaceholder", url: "https://jsonplaceholder.typicode.com/todos/1", method: "GET", authType: "none", note: "Free test API" },
  { id: "github-user",     label: "GitHub User",     url: "https://api.github.com/users/octocat",          method: "GET", authType: "none", note: "Public — no key needed" },
  { id: "weather",         label: "OpenWeather",     url: "https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_KEY&units=metric", method: "GET", authType: "none", note: "Add your API key to URL" },
  { id: "google-sheets",   label: "Google Sheets",   url: "https://sheets.googleapis.com/v4/spreadsheets/SHEET_ID/values/Sheet1!A1:Z100", method: "GET", authType: "bearer", note: "Needs OAuth token" },
  { id: "airtable",        label: "Airtable",        url: "https://api.airtable.com/v0/BASE_ID/TABLE_NAME", method: "GET", authType: "bearer", note: "Use Personal Access Token" },
  { id: "notion",          label: "Notion",          url: "https://api.notion.com/v1/databases/DATABASE_ID/query", method: "POST", authType: "bearer", note: "Use Integration Token" },
  { id: "openai",          label: "OpenAI",          url: "https://api.openai.com/v1/models", method: "GET", authType: "bearer", note: "Use API key as Bearer" },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ItemRendererProps {
  item: BlockItem;
  boardId: string;
  boxId: string;
  vars: Record<string, number>;
  collapsed?: boolean;
  isFinished?: boolean;
  /** Card pixel width — used for font auto-scaling */
  containerW?: number;
  /** Card pixel height — passed to chart so ResponsiveContainer gets a real value */
  containerH?: number;
  /** Override the default updateItem callback (used for board-level items) */
  onUpdate?: (patch: Partial<BlockItem>) => void;
  /** Extra entries prepended to the table's right-click menu (injected by BoardItemWidget for canvas-level tables) */
  extraContextItems?: ContextMenuEntry[];
  /** If false, wraps item in pointer-events:none (viewer lacks interact permission) */
  canInteract?: boolean;
  /** If false, text inputs/textareas are read-only (viewer lacks input permission) */
  canInput?: boolean;
  /** If true, the viewer may append their own entries (suggestion box / contributable list) */
  canContribute?: boolean;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function ItemRenderer({ item, boardId, boxId, vars, collapsed, isFinished, containerW, containerH, onUpdate, extraContextItems, canInteract, canInput, canContribute }: ItemRendererProps) {
  const upd = onUpdate ?? ((patch: Partial<BlockItem>) =>
    useBoardStore.getState().updateItem(boardId, boxId, item.id, patch));

  const rendered = (() => { switch (item.type) {
    case "text":     return <TextItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} canInput={canInput} extraContextItems={extraContextItems} />;
    case "list":     return <ListItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} canInput={canInput} canContribute={canContribute} boardId={boardId} boxId={boxId} extraContextItems={extraContextItems} />;
    case "embed":    return <EmbedItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} extraContextItems={extraContextItems} />;
    case "timer":    return <TimerItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} containerH={containerH} extraContextItems={extraContextItems} />;
    case "graph":    return <GraphItem item={item} collapsed={collapsed} containerW={containerW} containerH={containerH} boardId={boardId} boxId={boxId} extraContextItems={extraContextItems} />;
    case "api":      return <ApiItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} extraContextItems={extraContextItems} />;
    case "calendar": return <CalendarItem item={item} upd={upd} boardId={boardId} boxId={boxId} collapsed={collapsed} isFinished={isFinished} extraContextItems={extraContextItems} />;
    case "table":    return <TableItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} boardId={boardId} boxId={boxId} extraContextItems={extraContextItems} />;
    case "widget":   return <WidgetItem item={item} upd={upd} vars={vars} collapsed={collapsed} isFinished={isFinished} extraContextItems={extraContextItems} boardId={boardId} boxId={boxId} canInteract={canInteract} />;
    case "playlist": return <PlaylistItem item={item} upd={upd} boardId={boardId} boxId={boxId} collapsed={collapsed} isFinished={isFinished} canInteract={canInteract} extraContextItems={extraContextItems} />;
    case "kanban":   return <KanbanItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} extraContextItems={extraContextItems} boardId={boardId} />;
    // Items whose renderer builds no context menu of its own — wrap so right-click
    // opens the standard item menu (Duplicate/Delete/…) right at the block.
    case "chat":     return <WithItemMenu items={extraContextItems}><ChatBlockRenderer item={item} boardId={boardId} boxId={boxId} collapsed={collapsed} /></WithItemMenu>;
    case "filebank":    return <WithItemMenu items={extraContextItems}><FileBankBlockRenderer item={item} boardId={boardId} boxId={boxId} collapsed={collapsed} /></WithItemMenu>;
    case "embed-card":  return <WithItemMenu items={extraContextItems}><EmbedCardItem item={item} collapsed={collapsed} /></WithItemMenu>;
    case "external":    return <WithItemMenu items={extraContextItems}><ExternalItem item={item} boardId={boardId} boxId={boxId} collapsed={collapsed} isFinished={isFinished} onUpdate={onUpdate} /></WithItemMenu>;
    case "image":       return <WithItemMenu items={extraContextItems}><ImageItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} /></WithItemMenu>;
    case "suggestion":  return <WithItemMenu items={extraContextItems}><SuggestionItem item={item} upd={upd} boardId={boardId} collapsed={collapsed} isFinished={isFinished} canContribute={canContribute} /></WithItemMenu>;
    case "guestbook":   return <WithItemMenu items={extraContextItems}><GuestbookItem item={item} upd={upd} boardId={boardId} collapsed={collapsed} isFinished={isFinished} canContribute={canContribute} /></WithItemMenu>;
    case "poll":        return <WithItemMenu items={extraContextItems}><PollItem item={item} upd={upd} boardId={boardId} collapsed={collapsed} isFinished={isFinished} canContribute={canContribute} /></WithItemMenu>;
    case "flashcard":   return <WithItemMenu items={extraContextItems}><FlashcardItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} /></WithItemMenu>;
    case "quiz":        return <WithItemMenu items={extraContextItems}><QuizItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} /></WithItemMenu>;
    case "visualizer":  return <WithItemMenu items={extraContextItems}><VisualizerItem item={item} upd={upd} collapsed={collapsed} isFinished={isFinished} /></WithItemMenu>;
    case "twitch":      return <WithItemMenu items={extraContextItems}><TwitchItem item={item} boardId={boardId} boxId={boxId} collapsed={collapsed} isFinished={isFinished} onUpdate={onUpdate} /></WithItemMenu>;
    default:            return null;
  }})();

  if (canInteract === false && !isFinished) {
    return <div style={{ pointerEvents: "none", width: "100%", height: "100%" }}>{rendered}</div>;
  }
  return rendered;
}

/**
 * Wraps items whose renderer has no context menu (chat, filebank, image, embed-card,
 * external, community items, twitch) so a right-click opens the standard item menu.
 * stopPropagation keeps the box/canvas-level menu from also firing.
 */
function WithItemMenu({ items, children }: { items?: ContextMenuEntry[]; children: React.ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!items || items.length === 0) return <>{children}</>;
  return (
    <div
      className="h-full w-full"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {children}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}

// ─── Chat + File bank item renderers (thin wrappers) ─────────────────────────

import { ChatBlock } from "@/components/items/ChatBlock";
import { FileBankBlock } from "@/components/items/FileBankBlock";

function ChatBlockRenderer({ item, boardId, boxId, collapsed }: { item: BlockItem; boardId: string; boxId: string; collapsed?: boolean }) {
  return <ChatBlock item={item} boardId={boardId} boxId={boxId} expanded={!collapsed} />;
}

function FileBankBlockRenderer({ item, boardId, boxId, collapsed }: { item: BlockItem; boardId: string; boxId: string; collapsed?: boolean }) {
  return <FileBankBlock item={item} boardId={boardId} boxId={boxId} expanded={!collapsed} />;
}

// ─── Text ─────────────────────────────────────────────────────────────────────

const TEXT_BORDER_STYLES = [
  { id: "solid",  label: "Solid"  },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "double", label: "Double" },
  { id: "groove", label: "Groove" },
  { id: "ridge",  label: "Ridge"  },
  { id: "inset",  label: "Inset"  },
  { id: "outset", label: "Outset" },
  { id: "glow",   label: "Glow"   },
] as const;



// ─── Shared rich-text selection hook ──────────────────────────────────────────
// containerRef: the element whose descendants are the editable divs.
// onHTMLChange: called with the contenteditable element that was modified so
//               the caller can persist the updated innerHTML.

function useRichSel(
  containerRef: React.RefObject<HTMLElement | null>,
  onHTMLChange: (el: HTMLElement) => void,
) {
  const savedRangeRef = useRef<Range | null>(null);
  const [selState, setSelState] = useState<{ bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; fontSize?: number; fontFamily?: string }>({ bold: false, italic: false, underline: false, strikethrough: false });
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<{ cx: number; top: number } | null>(null);

  // Show toolbar whenever any child contenteditable is focused
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onFocusIn = () => {
      const rect = el.getBoundingClientRect();
      setToolbarPos({ cx: rect.left + rect.width / 2, top: rect.top });
      setShowToolbar(true);
    };
    el.addEventListener("focusin", onFocusIn);
    return () => el.removeEventListener("focusin", onFocusIn);
  }, [containerRef]);

  // Hide toolbar when clicking outside container AND outside toolbar
  useEffect(() => {
    if (!showToolbar) return;
    const handler = (e: MouseEvent) => {
      const path = e.composedPath() as Element[];
      if (path.includes(containerRef.current!)) return;
      if (path.some(el => el instanceof Element && el.getAttribute?.("data-richtoolbar") === "true")) return;
      setShowToolbar(false);
      setToolbarPos(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [showToolbar, containerRef]);

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) return;
      if (!sel.isCollapsed) savedRangeRef.current = range.cloneRange();
      // Walk up inline styles to find explicit font settings; fall back to computed for size + family
      let walkerEl: Node | null = range.startContainer;
      if (walkerEl?.nodeType === Node.TEXT_NODE) walkerEl = (walkerEl as Text).parentElement;
      let fsPx: number | undefined;
      let fsFamily: string | undefined;
      while (walkerEl instanceof HTMLElement) {
        if (!fsPx && walkerEl.style.fontSize) fsPx = Math.round(parseFloat(walkerEl.style.fontSize)) || undefined;
        if (!fsFamily && walkerEl.style.fontFamily) fsFamily = walkerEl.style.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
        if ((fsPx && fsFamily) || walkerEl.isContentEditable) break;
        walkerEl = walkerEl.parentElement;
      }
      if (walkerEl instanceof HTMLElement) {
        const cs = window.getComputedStyle(walkerEl);
        if (!fsPx) fsPx = Math.round(parseFloat(cs.fontSize)) || undefined;
        if (!fsFamily) fsFamily = cs.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
      }
      setSelState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
        fontSize: fsPx,
        fontFamily: fsFamily,
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [containerRef]);

  // Find the contenteditable ancestor of the saved range's start
  const findEditableEl = useCallback((): HTMLElement | null => {
    let node: Node | null = savedRangeRef.current?.startContainer ?? null;
    while (node) {
      if (node instanceof HTMLElement && node.isContentEditable) return node;
      node = node.parentNode;
    }
    return null;
  }, []);

  const withSavedRange = useCallback((fn: () => void) => {
    const range = savedRangeRef.current;
    if (!range) return;
    const el = findEditableEl();
    if (el) el.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fn();
    const newSel = window.getSelection();
    if (newSel && !newSel.isCollapsed && newSel.rangeCount > 0) {
      const newRange = newSel.getRangeAt(0);
      savedRangeRef.current = newRange.cloneRange();
      let wEl: Node | null = newRange.startContainer;
      if (wEl?.nodeType === Node.TEXT_NODE) wEl = (wEl as Text).parentElement;
      let wPx: number | undefined;
      let wFamily: string | undefined;
      while (wEl instanceof HTMLElement) {
        if (!wPx && wEl.style.fontSize) wPx = Math.round(parseFloat(wEl.style.fontSize)) || undefined;
        if (!wFamily && wEl.style.fontFamily) wFamily = wEl.style.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
        if ((wPx && wFamily) || wEl.isContentEditable) break;
        wEl = wEl.parentElement;
      }
      if (wEl instanceof HTMLElement) {
        const cs = window.getComputedStyle(wEl);
        if (!wPx) wPx = Math.round(parseFloat(cs.fontSize)) || undefined;
        if (!wFamily) wFamily = cs.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
      }
      setSelState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
        fontSize: wPx,
        fontFamily: wFamily,
      });
    }
    if (el) onHTMLChange(el);
  }, [findEditableEl, onHTMLChange]);

  const wrapSelectionSpan = useCallback((styleProps: Record<string, string>): boolean => {
    const el = findEditableEl();
    const range = savedRangeRef.current;
    if (!el || !range || range.collapsed) return false;
    el.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const cur = window.getSelection();
    if (cur && !cur.isCollapsed && cur.rangeCount > 0) {
      const r = cur.getRangeAt(0);
      const span = document.createElement("span");
      for (const [k, v] of Object.entries(styleProps)) {
        (span.style as unknown as Record<string, string>)[k] = v;
      }
      try { r.surroundContents(span); }
      catch { const frag = r.extractContents(); span.appendChild(frag); r.insertNode(span); }
      sel?.removeAllRanges();
    }
    onHTMLChange(el);
    return true;
  }, [findEditableEl, onHTMLChange]);

  const applyFontSizeRange = useCallback((sizePx: number): boolean => {
    // Use live selection — toolbar buttons keep focus via e.preventDefault()
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!containerRef.current?.contains(range.commonAncestorContainer)) return false;
    const el = findEditableEl();
    if (!el) return false;
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    const newSpans: HTMLElement[] = [];
    el.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement("span");
      span.style.fontSize = `${sizePx}px`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.parentNode!.replaceChild(span, font);
      newSpans.push(span);
    });
    // Re-select the newly created spans so the highlight stays visible
    if (newSpans.length > 0) {
      const newRange = document.createRange();
      newRange.setStartBefore(newSpans[0]);
      newRange.setEndAfter(newSpans[newSpans.length - 1]);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
    onHTMLChange(el);
    return true;
  }, [findEditableEl, containerRef, onHTMLChange, savedRangeRef]);

  const applyFontSizeAll = useCallback((sizePx: number) => {
    const editables = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[contenteditable="true"]') ?? []
    );
    // Strip inline font-size overrides from all children so the container-level CSS (set by the
    // caller via upd({ fontSize/listFontSize })) cascades uniformly. No focus/selectAll needed.
    for (const el of editables) {
      el.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach(child => {
        child.style.removeProperty('font-size');
        if (!child.getAttribute('style')?.trim()) child.removeAttribute('style');
      });
      onHTMLChange(el);
    }
  }, [containerRef, onHTMLChange]);

  const dismissSelToolbar = useCallback(() => {
    savedRangeRef.current = null;
    setShowToolbar(false);
    setToolbarPos(null);
  }, []);

  return { selState, showToolbar, toolbarPos, withSavedRange, wrapSelectionSpan, applyFontSizeRange, applyFontSizeAll, dismissSelToolbar };
}

function TextItem({ item, upd, collapsed, isFinished, canInput, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; canInput?: boolean; extraContextItems?: ContextMenuEntry[] }) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [selState, setSelState] = useState<{ bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; fontSize?: number; fontFamily?: string }>({ bold: false, italic: false, underline: false, strikethrough: false });
  const [toolbarPos, setToolbarPos] = useState<{ cx: number; top: number } | null>(null);
  const bgImageFileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Rich text editing
  const editorRef = useRef<HTMLDivElement>(null);
  const innerHTMLRef = useRef(item.text ?? "");
  const savedRangeRef = useRef<Range | null>(null);

  // Initialize editor content on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = item.text ?? "";
      innerHTMLRef.current = item.text ?? "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track selection; update savedRangeRef and B/I/U/S active state for the toolbar
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!editorRef.current?.contains(range.commonAncestorContainer)) return;
      if (!sel.isCollapsed) savedRangeRef.current = range.cloneRange();
      let tiEl: Node | null = range.startContainer;
      if (tiEl?.nodeType === Node.TEXT_NODE) tiEl = (tiEl as Text).parentElement;
      let tiPx: number | undefined;
      let tiFamily: string | undefined;
      while (tiEl instanceof HTMLElement) {
        if (!tiPx && tiEl.style.fontSize) tiPx = Math.round(parseFloat(tiEl.style.fontSize)) || undefined;
        if (!tiFamily && tiEl.style.fontFamily) tiFamily = tiEl.style.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
        if ((tiPx && tiFamily) || tiEl.isContentEditable) break;
        tiEl = tiEl.parentElement;
      }
      if (tiEl instanceof HTMLElement) {
        const cs = window.getComputedStyle(tiEl);
        if (!tiPx) tiPx = Math.round(parseFloat(cs.fontSize)) || undefined;
        if (!tiFamily) tiFamily = cs.fontFamily.replace(/['"]/g, "").split(",")[0]?.trim() || undefined;
      }
      setSelState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
        fontSize: tiPx,
        fontFamily: tiFamily,
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // Hide toolbar when clicking outside BOTH the editor container AND the toolbar.
  useEffect(() => {
    if (!showToolbar) return;
    const handler = (e: MouseEvent) => {
      const path = e.composedPath() as Element[];
      if (path.includes(containerRef.current!)) return;
      if (path.some(el => el instanceof Element && el.getAttribute?.("data-richtoolbar") === "true")) return;
      setShowToolbar(false);
      setToolbarPos(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [showToolbar]);

  // Wrap the current selection (or restore savedRangeRef) in a <span> with inline styles.
  // Returns true if applied inline, false if there was nothing to wrap.
  const wrapSelInStyle = useCallback((styles: Record<string, string>): boolean => {
    const range = savedRangeRef.current;
    if (!range || range.collapsed || !editorRef.current) return false;
    editorRef.current.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const span = document.createElement("span");
    Object.assign(span.style, styles);
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    const h = editorRef.current.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h });
    return true;
  }, [upd]);

  // Apply inline styles to the existing block element(s) containing the selection (does not change tag).
  const applyBlockStyle = useCallback((styles: Record<string, string>) => {
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;
    const range = savedRangeRef.current ?? (sel.rangeCount > 0 ? sel.getRangeAt(0) : null);
    if (!range) return;
    const findBlock = (node: Node): HTMLElement | null => {
      let n: Node | null = node;
      while (n && n !== editorRef.current) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const t = (n as Element).tagName.toLowerCase();
          if (["p","div","h1","h2","h3","h4","h5","h6","blockquote","pre","li"].includes(t))
            return n as HTMLElement;
        }
        n = n.parentNode;
      }
      return null;
    };
    const startBlock = findBlock(range.startContainer);
    const endBlock   = findBlock(range.endContainer);
    const blocks: HTMLElement[] = [];
    if (startBlock) {
      let curr: Node | null = startBlock;
      while (curr) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const t = (curr as Element).tagName.toLowerCase();
          if (["p","div","h1","h2","h3","h4","h5","h6","blockquote","pre","li"].includes(t))
            blocks.push(curr as HTMLElement);
        }
        if (curr === endBlock) break;
        curr = curr.nextSibling;
      }
    }
    if (blocks.length === 0 && startBlock) blocks.push(startBlock);
    blocks.forEach(block => Object.assign(block.style, styles));
    const h = editorRef.current.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h });
  }, [upd]);

  // Change the block element(s) that contain the current selection to a new tag.
  const applyBlockTag = useCallback((tag: string, inlineStyles?: Record<string, string>) => {
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;

    const findBlock = (node: Node): HTMLElement | null => {
      let n: Node | null = node;
      while (n && n !== editorRef.current) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const t = (n as Element).tagName.toLowerCase();
          if (["p","div","h1","h2","h3","h4","h5","h6","blockquote","pre","li"].includes(t))
            return n as HTMLElement;
        }
        n = n.parentNode;
      }
      // text node directly in editor root — wrap it first
      if (n === editorRef.current) {
        const p = document.createElement("p");
        node.parentNode!.insertBefore(p, node);
        p.appendChild(node);
        return p;
      }
      return null;
    };

    const range = savedRangeRef.current ?? (sel.rangeCount > 0 ? sel.getRangeAt(0) : null);
    if (!range) return;

    const startBlock = findBlock(range.startContainer);
    const endBlock   = findBlock(range.endContainer);

    // collect all sibling blocks between start and end
    const blocks: HTMLElement[] = [];
    if (startBlock) {
      let curr: Node | null = startBlock;
      while (curr) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const t = (curr as Element).tagName.toLowerCase();
          if (["p","div","h1","h2","h3","h4","h5","h6","blockquote","pre","li"].includes(t))
            blocks.push(curr as HTMLElement);
        }
        if (curr === endBlock) break;
        curr = curr.nextSibling;
      }
    }
    if (blocks.length === 0 && startBlock) blocks.push(startBlock);

    blocks.forEach(block => {
      const newEl = document.createElement(tag);
      if (inlineStyles) Object.assign(newEl.style, inlineStyles);
      while (block.firstChild) newEl.appendChild(block.firstChild);
      block.parentNode!.replaceChild(newEl, block);
    });

    const h = editorRef.current.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h });
  }, [upd]);

  // Sync external changes without disrupting active editing
  useEffect(() => {
    if (editorRef.current && document.activeElement !== editorRef.current && item.text !== innerHTMLRef.current) {
      editorRef.current.innerHTML = item.text ?? "";
      innerHTMLRef.current = item.text ?? "";
    }
  }, [item.text]);

  // Run an execCommand on the focused editor and persist the HTML
  const exec = useCallback((cmd: string, val?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (savedRangeRef.current) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(savedRangeRef.current);
    }
    document.execCommand(cmd, false, val);
    const html = editorRef.current.innerHTML;
    innerHTMLRef.current = html;
    upd({ text: html });
  }, [upd]);

  // Restore saved selection and wrap it in an <a> tag, then sync HTML
  const insertLink = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed || !editorRef.current) return;
    const range = savedRangeRef.current ?? (() => {
      const s = window.getSelection();
      return (s && s.rangeCount > 0) ? s.getRangeAt(0) : null;
    })();
    if (!range) return;
    const finalUrl = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const anchor = document.createElement("a");
    anchor.href = finalUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    // Manipulate the DOM directly — no focus() before the operation so the
    // sync-external-changes effect (which fires when !activeElement && text changed)
    // never sees a window between innerHTMLRef update and the DOM state.
    if (range.collapsed) {
      anchor.textContent = finalUrl;
      range.insertNode(anchor);
    } else {
      try {
        range.surroundContents(anchor);
      } catch {
        const frag = range.extractContents();
        anchor.appendChild(frag);
        range.insertNode(anchor);
      }
    }
    const html = editorRef.current.innerHTML;
    innerHTMLRef.current = html;
    upd({ text: html });
    savedRangeRef.current = null;
    // Focus editor and move cursor after the inserted link
    editorRef.current.focus();
    try {
      const cur = document.createRange();
      cur.setStartAfter(anchor);
      cur.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(cur);
    } catch { /* anchor may have moved during surroundContents — cursor placement is best-effort */ }
  }, [upd]);

  // Insert a task checkbox at the current cursor position
  const insertCheckboxLine = useCallback(() => {
    exec("insertHTML", `<span class="chk" data-checked="false" contenteditable="false" style="cursor:pointer;user-select:none;display:inline-block;margin-right:5px;line-height:1">☐</span>&#8203;`);
  }, [exec]);

  const insertList = useCallback((listTag: "ul" | "ol") => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    document.execCommand(listTag === "ul" ? "insertUnorderedList" : "insertOrderedList");
    const html = editorRef.current.innerHTML;
    innerHTMLRef.current = html;
    upd({ text: html });
  }, [upd]);

  const applyHighlight = useCallback((color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    document.execCommand("hiliteColor", false, color);
    const h = editorRef.current.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h });
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }, [upd]);

  const applyFontSizeToSel = useCallback((sizePx: number): boolean => {
    if (!editorRef.current) return false;
    // Restore saved selection — clicking the toolbar collapses the live selection
    if (savedRangeRef.current) {
      editorRef.current.focus();
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(savedRangeRef.current);
    }
    const sel = window.getSelection();
    const hasActiveSel = sel && !sel.isCollapsed && sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!hasActiveSel) return false;
    document.execCommand("styleWithCSS", false, "false");
    const preExisting = new Set(editorRef.current.querySelectorAll('font[size="7"]'));
    document.execCommand("fontSize", false, "7");
    const newSpans: HTMLElement[] = [];
    editorRef.current.querySelectorAll('font[size="7"]').forEach(font => {
      if (preExisting.has(font)) return;
      const span = document.createElement("span");
      span.style.fontSize = `${sizePx}px`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.parentNode!.replaceChild(span, font);
      newSpans.push(span);
    });
    // Re-select the newly created spans so the highlight stays visible
    if (newSpans.length > 0 && sel) {
      const newRange = document.createRange();
      newRange.setStartBefore(newSpans[0]);
      newRange.setEndAfter(newSpans[newSpans.length - 1]);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
    const h = editorRef.current.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h });
    return true;
  }, [upd]);

  const applyFontSizeGlobal = useCallback((sizePx: number) => {
    const el = editorRef.current;
    if (!el) { upd({ fontSize: sizePx }); return; }
    // Strip inline font-size overrides so the editor's container-level font-size cascades uniformly.
    // No focus/selectAll needed — cursor stays in place, no auto-selection side effect.
    el.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach(child => {
      child.style.removeProperty('font-size');
      if (!child.getAttribute('style')?.trim()) child.removeAttribute('style');
    });
    const h = el.innerHTML;
    innerHTMLRef.current = h;
    upd({ text: h, fontSize: sizePx });
  }, [upd]);

  // Handle clicks inside the contenteditable: checkbox toggle + link navigation
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("chk")) {
      const checked = target.dataset.checked === "true";
      target.dataset.checked = checked ? "false" : "true";
      target.textContent = checked ? "☐" : "☑";
      target.style.color = checked ? "" : "var(--accent)";
      const html = editorRef.current?.innerHTML ?? "";
      innerHTMLRef.current = html;
      upd({ text: html });
      return;
    }
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (anchor?.href) {
      e.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
    }
  }, [isFinished, upd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " ") return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    let blockEl: HTMLElement | null = container.parentElement;
    while (blockEl && blockEl !== editorRef.current) {
      if (["p", "div", "h1", "h2", "h3", "li", "blockquote"].includes(blockEl.tagName.toLowerCase())) break;
      blockEl = blockEl.parentElement;
    }
    // Text node is a direct child of the editor root (no block wrapper yet) — wrap it so we can replace it
    if (!blockEl || blockEl === editorRef.current) {
      const p = document.createElement("p");
      container.parentNode!.insertBefore(p, container);
      p.appendChild(container);
      blockEl = p;
    }
    const fullText = blockEl.textContent?.trim() ?? "";

    // Place the caret inside a freshly-created (empty) block. Browsers won't let
    // the caret enter a truly empty block element (which made the shortcuts seem
    // to "do nothing" after converting), so seed it with an invisible zero-width
    // space and drop the caret after it. The ZWSP renders as nothing and is
    // overwritten as soon as the user types.
    const caretInto = (el: HTMLElement) => {
      const seed = document.createTextNode("​");
      el.appendChild(seed);
      const r = document.createRange();
      r.setStart(seed, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      const html = editorRef.current?.innerHTML ?? "";
      innerHTMLRef.current = html;
      upd({ text: html });
    };

    const swapBlock = (tag: string) => {
      e.preventDefault();
      const newEl = document.createElement(tag);
      blockEl!.parentNode!.replaceChild(newEl, blockEl!);
      caretInto(newEl);
    };

    const swapList = (listTag: "ul" | "ol") => {
      e.preventDefault();
      const list = document.createElement(listTag);
      const li = document.createElement("li");
      list.appendChild(li);
      blockEl!.parentNode!.replaceChild(list, blockEl!);
      caretInto(li);
    };

    // [] / [ ] at line start → a checklist line (reuses the .chk checkbox)
    const swapChecklist = () => {
      e.preventDefault();
      blockEl!.innerHTML =
        `<span class="chk" data-checked="false" contenteditable="false" style="cursor:pointer;user-select:none;display:inline-block;margin-right:5px;line-height:1">☐</span>​`;
      const r = document.createRange();
      r.selectNodeContents(blockEl!);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      const html = editorRef.current?.innerHTML ?? "";
      innerHTMLRef.current = html;
      upd({ text: html });
    };

    // Inline markdown (**bold**, *italic*, ~~strike~~, `code`) — shared helper.
    // Runs before the block checks; the two never overlap (block markers are the
    // whole line, inline ones aren't).
    if (applyInlineMarkdownAtCursor()) {
      e.preventDefault();
      const html = editorRef.current?.innerHTML ?? "";
      innerHTMLRef.current = html;
      upd({ text: html });
      return;
    }

    if (fullText === "#") swapBlock("h1");
    else if (fullText === "##") swapBlock("h2");
    else if (fullText === "###") swapBlock("h3");
    else if (fullText === ">") swapBlock("blockquote");
    else if (fullText === "```") swapBlock("pre");
    else if (fullText === "[]" || fullText === "[ ]") swapChecklist();
    else if (fullText === "-" || fullText === "*") swapList("ul");
    else if (/^\d+\.$/.test(fullText)) swapList("ol");
  }, [upd]);

  const hasBorder = (item.textBorderWidth ?? 0) > 0;
  const hasBg = !!(item.textBgColor || item.textBgImage);
  const isTextGlow = hasBorder && item.textBorderStyle === "glow";
  const shadowColor = item.textShadowColor ?? "#000000";
  const boxShadowVal = isTextGlow
    ? `0 0 ${(item.textBorderWidth ?? 1) * 5}px ${item.textBorderColor ?? "#ffffff"}, 0 0 ${(item.textBorderWidth ?? 1) * 12}px ${item.textBorderColor ?? "#ffffff"}55`
    : item.textShadow === "drop" ? `4px 4px 8px ${shadowColor}99`
    : item.textShadow === "hard" ? `3px 3px 0px ${shadowColor}`
    : item.textShadow === "glow" ? `0 0 12px ${shadowColor}, 0 0 24px ${shadowColor}88`
    : item.textShadow === "neon" ? `0 0 6px ${shadowColor}, 0 0 14px ${shadowColor}, 0 0 30px ${shadowColor}66`
    : undefined;

  const textStyle: React.CSSProperties = {
    fontSize: item.fontSize ?? 16,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textAlign: item.align ?? "left",
    fontFamily: item.fontFamily ?? "Inter",
    color: item.textColor || undefined,
    backgroundColor: item.textBgColor || "transparent",
    backgroundImage: item.textBgImage ? `url(${item.textBgImage})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    borderRadius: item.textBorderRadius ?? 0,
    border: hasBorder && !isTextGlow
      ? `${item.textBorderWidth}px ${item.textBorderStyle ?? "solid"} ${item.textBorderColor ?? "#ffffff"}`
      : "none",
    boxShadow: boxShadowVal,
    padding: item.textPadding ?? (hasBg || hasBorder ? 8 : 0),
    lineHeight: item.textLineHeight ?? 1.5,
    letterSpacing: item.textLetterSpacing ? `${item.textLetterSpacing}px` : undefined,
  };

  const editorTypoStyle: React.CSSProperties = {
    fontSize: textStyle.fontSize,
    fontWeight: textStyle.fontWeight,
    fontStyle: textStyle.fontStyle,
    textAlign: textStyle.textAlign,
    fontFamily: textStyle.fontFamily,
    color: textStyle.color,
    lineHeight: textStyle.lineHeight,
    letterSpacing: textStyle.letterSpacing,
    padding: item.textPadding ?? 10,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  };

  const handleBgImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => upd({ textBgImage: url }));
    e.target.value = "";
  };

  if (collapsed) {
    const hasCollapsedFont = item.collapsedFontFamily || item.collapsedFontSize || item.collapsedBold !== undefined || item.collapsedItalic !== undefined || item.collapsedFontColor;
    const collapsedStyle: React.CSSProperties = hasCollapsedFont ? {
      ...textStyle,
      fontFamily: item.collapsedFontFamily ?? textStyle.fontFamily,
      fontSize: item.collapsedFontSize ?? textStyle.fontSize,
      fontWeight: item.collapsedBold !== undefined ? (item.collapsedBold ? 700 : 400) : textStyle.fontWeight,
      fontStyle: item.collapsedItalic !== undefined ? (item.collapsedItalic ? "italic" : "normal") : textStyle.fontStyle,
      color: item.collapsedFontColor ?? textStyle.color,
    } : textStyle;
    if (!item.text) {
      return <p className="truncate opacity-40 italic" style={{ ...collapsedStyle, fontSize: 12 }}>Empty text</p>;
    }
    return <p className="truncate" style={collapsedStyle} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text) }} />;
  }

  return (
    <div ref={containerRef}
      className={cn("relative w-full h-full", animClassFor(item.textAnimation, item.textAnimationCustom))}
      style={{
        ...(item.textAnimation ? itemAnimStyle(item.textAnimationSpeed) : undefined),
        ...(item.textBackdrop ? { background: "rgba(13, 14, 18, 0.58)", borderRadius: 6 } : undefined),
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* Hidden file input for bg image */}
      <input ref={bgImageFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageFile} />

      {/* Number mode — big editable number */}
      {item.textMode === "number" ? (
        <div className="flex flex-col items-center justify-center w-full h-full gap-1" style={textStyle}>
          <input
            type="number"
            readOnly={isFinished || canInput === false}
            className="bg-transparent outline-none text-center font-mono font-bold w-full"
            style={{ fontSize: item.fontSize ?? 40, color: item.textColor || "var(--accent)" }}
            placeholder="0"
            value={item.text ?? ""}
            onChange={(e) => upd({ text: e.target.value })}
          />
        </div>
      ) : (
        /* Normal text — contenteditable; toolbar floats above via portal */
        <div className="relative w-full h-full" style={{
          backgroundColor: textStyle.backgroundColor,
          backgroundImage: textStyle.backgroundImage,
          backgroundSize: textStyle.backgroundSize,
          backgroundPosition: textStyle.backgroundPosition,
          backgroundRepeat: textStyle.backgroundRepeat,
          borderRadius: textStyle.borderRadius,
          border: textStyle.border,
          boxShadow: textStyle.boxShadow,
        }}>
          {!item.text && !focused && !isFinished && (
            <span
              className="absolute inset-0 pointer-events-none select-none opacity-30 italic"
              style={{ fontSize: textStyle.fontSize, fontFamily: textStyle.fontFamily, padding: editorTypoStyle.padding, zIndex: 1 }}
            >
              Start typing… (# heading, - list)
            </span>
          )}
          <div
            ref={editorRef}
            contentEditable={!isFinished && canInput !== false}
            suppressContentEditableWarning
            className="doc-editor w-full h-full outline-none overflow-y-auto"
            style={editorTypoStyle}
            onFocus={() => {
              setFocused(true);
              setShowToolbar(true);
              const rect = containerRef.current?.getBoundingClientRect();
              if (rect) setToolbarPos({ cx: rect.left + rect.width / 2, top: rect.top });
            }}
            onBlur={() => { setTimeout(() => setFocused(false), 0); }}
            onClick={handleEditorClick}
            onKeyDown={handleKeyDown}
            onInput={() => {
              const html = editorRef.current?.innerHTML ?? "";
              innerHTMLRef.current = html;
              upd({ text: html });
            }}
          />
        </div>
      )}

      {/* Floating toolbar — visible as long as editor or toolbar itself has focus */}
      {showToolbar && toolbarPos && !isFinished && createPortal(
        <RichSelToolbar
          cx={toolbarPos.cx}
          top={toolbarPos.top}
          selState={selState}
          onExecCmd={(cmd) => exec(cmd)}
          onParaStyle={(styleId) => {
            const style = PARA_STYLES.find(s => s.id === styleId);
            if (!style) return;
            const range = savedRangeRef.current;
            // Non-collapsed selection → apply visual styles inline to selected text only
            if (range && !range.collapsed) {
              const selStyles: Record<string, string> = {
                fontSize: `${style.fontSize}px`,
                fontWeight: style.bold ? "700" : "400",
                fontStyle: style.italic ? "italic" : "normal",
              };
              if (style.fontFamily) selStyles.fontFamily = style.fontFamily;
              wrapSelInStyle(selStyles);
              return;
            }
            // No selection → change the block-level tag as before
            const tagMap: Record<string, string> = { h1: "h1", h2: "h2", h3: "h3", code: "pre" };
            const tag = tagMap[style.id] ?? "p";
            const inlineStyles: Record<string, string> = {};
            if (!["h1","h2","h3"].includes(style.id)) {
              inlineStyles.fontSize = `${style.fontSize}px`;
              inlineStyles.fontWeight = style.bold ? "700" : "400";
              inlineStyles.fontStyle = style.italic ? "italic" : "normal";
              if (style.fontFamily) inlineStyles.fontFamily = style.fontFamily;
            }
            applyBlockTag(tag, Object.keys(inlineStyles).length ? inlineStyles : undefined);
          }}
          onPreset={(id) => {
            const p = TEXT_PRESETS.find((x) => x.id === id);
            if (!p) return;
            if (p.style.fontFamily) loadGoogleFont(p.style.fontFamily);
            upd(p.style);
          }}
          onFontFamily={(font) => { loadGoogleFont(font); if (!wrapSelInStyle({ fontFamily: font })) upd({ fontFamily: font }); }}
          onFontSize={(size) => { if (!applyFontSizeToSel(size)) applyFontSizeGlobal(size); }}
          onColor={(color) => {
            if (!editorRef.current) return;
            editorRef.current.focus();
            const range = savedRangeRef.current;
            if (range) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range); }
            document.execCommand("styleWithCSS", false, "true");
            document.execCommand("foreColor", false, color);
            document.execCommand("styleWithCSS", false, "false");
            const h = editorRef.current.innerHTML;
            innerHTMLRef.current = h;
            upd({ text: h });
          }}
          onHighlight={(color) => applyHighlight(color)}
          onInsertList={(tag) => insertList(tag)}
          onClearFormat={() => { exec("removeFormat"); exec("formatBlock", "p"); }}
          onLink={insertLink}
          onLineSpacing={(value) => applyBlockStyle({ lineHeight: value })}
          onInsertCheckbox={insertCheckboxLine}
          onDismiss={() => { setShowToolbar(false); setToolbarPos(null); }}
        />,
        document.body
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            { label: "Copy text", icon: <Copy size={14} />, onClick: () => { const el = document.createElement("div"); el.innerHTML = innerHTMLRef.current; navigator.clipboard.writeText(el.innerText); } },
            ...(!isFinished ? [
              "separator" as const,
              { label: "Clear text", icon: <Trash2 size={14} />, danger: true, onClick: () => { if (editorRef.current) editorRef.current.innerHTML = ""; innerHTMLRef.current = ""; upd({ text: "" }); } },
            ] : []),
          ]}
        />
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-[var(--border)] mx-0.5 flex-shrink-0" />;
}

function TBtn({ children, active, onClick, title }: { children: React.ReactNode; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center justify-center gap-0.5 rounded px-1.5 py-0.5 transition-colors min-w-[22px]",
        active ? "bg-[var(--accent)]/25 text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

// ─── Rich text selection toolbar (portal) ─────────────────────────────────────

const SIZE_PRESETS = [8,9,10,11,12,14,18,24,30,36,48,60,72,96];

function RichSelToolbar({
  cx, top, selState,
  onExecCmd, onParaStyle, onPreset, onFontFamily, onFontSize, onColor, onHighlight, onInsertList,
  onClearFormat, onLink, onLineSpacing, onInsertCheckbox, onDismiss, hideAlignment,
}: {
  cx: number; top: number;
  selState: { bold: boolean; italic: boolean; underline: boolean; strikethrough?: boolean; fontSize?: number; fontFamily?: string };
  onExecCmd: (cmd: string) => void;
  onParaStyle: (styleId: string) => void;
  onPreset?: (presetId: string) => void;
  onFontFamily: (font: string) => void;
  onFontSize: (size: number) => void;
  onColor: (color: string) => void;
  onHighlight: (color: string) => void;
  onInsertList?: (tag: "ul" | "ol") => void;
  onClearFormat: () => void;
  onLink?: (url: string) => void;
  onLineSpacing?: (value: string) => void;
  onInsertCheckbox?: () => void;
  onDismiss: () => void;
  hideAlignment?: boolean;
}) {
  const [currentSize, setCurrentSize] = useState(16);
  const [showSizePicker, setShowSizePicker] = useState(false);
  useEffect(() => {
    if (selState.fontSize !== undefined) setCurrentSize(selState.fontSize);
  }, [selState.fontSize]);
  const [linkInput, setLinkInput] = useState<string | null>(null);
  const [linkSelText, setLinkSelText] = useState("");
  const [hlColor, setHlColor] = useState("#ffff00");
  const [showHlPicker, setShowHlPicker] = useState(false);
  const hlBtnRef = useRef<HTMLButtonElement>(null);
  const hlPickerRef = useRef<HTMLDivElement>(null);
  const sizeBtnRef = useRef<HTMLButtonElement>(null);
  const sizePickerRef = useRef<HTMLDivElement>(null);

  const toolbarTop = Math.max(8, top - 52);
  const toolbarWidth = 660;
  const left = Math.max(8, Math.min((typeof window !== "undefined" ? window.innerWidth : 1200) - toolbarWidth - 8, cx - toolbarWidth / 2));

  const applySize = (n: number) => {
    const clamped = Math.max(6, Math.min(200, Math.round(n)));
    setCurrentSize(clamped);
    onFontSize(clamped);
  };

  // Close size picker on outside click
  useEffect(() => {
    if (!showSizePicker) return;
    const handler = (e: MouseEvent) => {
      if (!sizePickerRef.current?.contains(e.target as Node) && !sizeBtnRef.current?.contains(e.target as Node))
        setShowSizePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSizePicker]);

  // Close highlight picker on outside click
  useEffect(() => {
    if (!showHlPicker) return;
    const handler = (e: MouseEvent) => {
      if (!hlPickerRef.current?.contains(e.target as Node) && !hlBtnRef.current?.contains(e.target as Node))
        setShowHlPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHlPicker]);

  return (
    <div
      data-richtoolbar="true"
      style={{ position: "fixed", top: toolbarTop, left, zIndex: 99999, pointerEvents: "auto" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className="flex items-center gap-0.5 rounded-xl border border-[var(--border)] shadow-2xl px-2 py-1.5"
        style={{ background: "var(--surface-raised)", whiteSpace: "nowrap" }}
      >
        {/* Para style */}
        <select
          value=""
          onChange={(e) => { onParaStyle(e.target.value); (e.target as HTMLSelectElement).value = ""; }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[11px] text-[var(--text-primary)] outline-none cursor-pointer"
          style={{ maxWidth: 76 }}
          title="Paragraph style"
        >
          <option value="" disabled>Style</option>
          {PARA_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {onPreset && (
          <select
            value=""
            onChange={(e) => { onPreset(e.target.value); (e.target as HTMLSelectElement).value = ""; }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="ml-0.5 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[11px] text-[var(--text-primary)] outline-none cursor-pointer"
            style={{ maxWidth: 82 }}
            title="Style preset"
          >
            <option value="" disabled>Preset</option>
            {TEXT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
        <Divider />
        {/* Font family */}
        <FontPicker compact value={selState.fontFamily ?? ""} onChange={onFontFamily} />
        <Divider />
        {/* Font size: − input + */}
        <div className="relative flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] text-sm font-bold leading-none"
            onClick={() => applySize(currentSize - 1)}
            title="Decrease font size"
          >−</button>
          <button
            ref={sizeBtnRef}
            className="min-w-[36px] rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-center text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
            onClick={() => setShowSizePicker(v => !v)}
            title="Font size"
          >{currentSize}</button>
          <button
            className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] text-sm font-bold leading-none"
            onClick={() => applySize(currentSize + 1)}
            title="Increase font size"
          >+</button>
          {showSizePicker && (
            <div
              ref={sizePickerRef}
              className="absolute left-0 top-full mt-1 rounded-lg border border-[var(--border)] shadow-2xl overflow-y-auto"
              style={{ background: "var(--surface-raised)", zIndex: 2, maxHeight: 220, minWidth: 56 }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {SIZE_PRESETS.map(s => (
                <button
                  key={s}
                  className="block w-full text-left px-3 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] transition-colors"
                  style={{ fontWeight: s === currentSize ? 700 : 400 }}
                  onClick={() => { applySize(s); setShowSizePicker(false); }}
                >{s}</button>
              ))}
            </div>
          )}
        </div>
        <Divider />
        {/* B / I / U / S */}
        <TBtn active={selState.bold} onClick={() => onExecCmd("bold")} title="Bold"><span className="font-bold text-xs">B</span></TBtn>
        <TBtn active={selState.italic} onClick={() => onExecCmd("italic")} title="Italic"><span className="italic text-xs">I</span></TBtn>
        <TBtn active={selState.underline} onClick={() => onExecCmd("underline")} title="Underline"><span className="underline text-xs">U</span></TBtn>
        <TBtn active={selState.strikethrough ?? false} onClick={() => onExecCmd("strikeThrough")} title="Strikethrough"><span className="line-through text-xs">S</span></TBtn>
        <Divider />
        {/* Text color */}
        <label className="cursor-pointer flex items-center" title="Text color">
          <span className="font-bold text-xs text-[var(--text-primary)] px-1" style={{ textDecoration: "underline 2px var(--accent)" }}>A</span>
          <input type="color" defaultValue="#ffffff" onChange={(e) => onColor(e.target.value)} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0 outline-none" />
        </label>
        {/* Highlight button + swatch picker */}
        <button
          ref={hlBtnRef}
          title="Highlight"
          className="flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-black transition-opacity hover:opacity-80"
          style={{ background: hlColor }}
          onClick={() => setShowHlPicker(v => !v)}
        >H</button>
        {!hideAlignment && (<>
        <Divider />
        {/* Alignment */}
        <TBtn active={false} onClick={() => onExecCmd("justifyLeft")} title="Align left"><span className="text-[11px] font-mono">≡L</span></TBtn>
        <TBtn active={false} onClick={() => onExecCmd("justifyCenter")} title="Align center"><span className="text-[11px] font-mono">≡C</span></TBtn>
        <TBtn active={false} onClick={() => onExecCmd("justifyRight")} title="Align right"><span className="text-[11px] font-mono">≡R</span></TBtn>
        <TBtn active={false} onClick={() => onExecCmd("justifyFull")} title="Justify"><span className="text-[11px] font-mono">≡J</span></TBtn>
        </>)}
        {/* Line spacing */}
        {onLineSpacing && (<>
          <Divider />
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) { onLineSpacing(e.target.value); e.target.value = ""; } }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[11px] text-[var(--text-primary)] outline-none cursor-pointer"
            style={{ width: 40 }}
            title="Line spacing"
          >
            <option value="" disabled>↕</option>
            <option value="1">1</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
          </select>
        </>)}
        {/* Lists + checklist */}
        {onInsertList && (<>
          <TBtn active={false} onClick={() => onInsertList("ul")} title="Bullet list"><List size={13} /></TBtn>
          <TBtn active={false} onClick={() => onInsertList("ol")} title="Numbered list"><ListOrdered size={13} /></TBtn>
        </>)}
        {onInsertCheckbox && <TBtn active={false} onClick={onInsertCheckbox} title="Checklist"><CheckSquare size={13} /></TBtn>}
        <Divider />
        {/* Indent */}
        <TBtn active={false} onClick={() => onExecCmd("outdent")} title="Decrease indent"><IndentDecrease size={13} /></TBtn>
        <TBtn active={false} onClick={() => onExecCmd("indent")} title="Increase indent"><IndentIncrease size={13} /></TBtn>
        <Divider />
        {/* Link */}
        {onLink && (
          linkInput !== null ? (
            <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              {linkSelText && (
                <span className="max-w-[80px] truncate rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[11px] text-[var(--accent)]" title={linkSelText}>
                  "{linkSelText}"
                </span>
              )}
              <input
                autoFocus
                placeholder="https://…"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && linkInput) { onLink(linkInput); setLinkInput(null); }
                  if (e.key === "Escape") setLinkInput(null);
                }}
                className="w-36 rounded border border-[var(--accent)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--text-primary)] outline-none"
              />
            </div>
          ) : (
            <TBtn active={false} onClick={() => { setLinkSelText(window.getSelection()?.toString() || ""); setLinkInput(""); }} title="Insert link">
              <Link2 size={13} />
            </TBtn>
          )
        )}
        {onLink && <TBtn active={false} onClick={() => onExecCmd("unlink")} title="Remove link"><Unlink size={13} /></TBtn>}
        <Divider />
        <TBtn active={false} onClick={onClearFormat} title="Clear formatting"><RemoveFormatting size={13} /></TBtn>
        <button onClick={onDismiss} className="ml-1 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1" title="Dismiss"><XIcon size={13} /></button>
      </div>

      {/* Highlight color picker */}
      {showHlPicker && (
        <div
          ref={hlPickerRef}
          className="absolute left-0 top-full mt-1 flex flex-wrap gap-1 rounded-xl border border-[var(--border)] p-2 shadow-2xl"
          style={{ background: "var(--surface-raised)", zIndex: 1 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            title="Remove highlight"
            className="relative rounded border border-[var(--border)] hover:border-[var(--accent)] transition-colors overflow-hidden"
            style={{ width: 22, height: 22, background: "#fff", flexShrink: 0 }}
            onClick={() => { onHighlight("transparent"); setShowHlPicker(false); }}
          >
            <svg viewBox="0 0 22 22" className="absolute inset-0 w-full h-full pointer-events-none">
              <line x1="4" y1="18" x2="18" y2="4" stroke="red" strokeWidth="2" />
            </svg>
          </button>
          {(["#ffff00","#ffd700","#90ee90","#87ceeb","#ffb6c1","#ffa07a","#da70d6","#ffffff"] as const).map(c => (
            <button
              key={c}
              title={c}
              className="rounded transition-all hover:scale-110"
              style={{
                width: 22, height: 22, background: c, flexShrink: 0,
                border: c === hlColor ? "2px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: 4,
              }}
              onClick={() => { setHlColor(c); onHighlight(c); setShowHlPicker(false); }}
            />
          ))}
          <label
            title="Custom color"
            className="relative rounded border border-[var(--border)] hover:border-[var(--accent)] transition-all cursor-pointer overflow-hidden hover:scale-110"
            style={{ width: 22, height: 22, flexShrink: 0, background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
          >
            <input
              type="color"
              value={hlColor}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => { const c = e.target.value; setHlColor(c); onHighlight(c); setShowHlPicker(false); }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const LIST_BORDER_STYLES = ["solid","dashed","dotted","double","groove","ridge","inset","outset"] as const;

export function ListStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const hasBorder = (item.listBorderWidth ?? 0) > 0;
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => upd({ listWallpaperUrl: url }));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">

      {/* Title */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title</p>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-colors"
          placeholder="List title (optional)…"
          value={item.listTitle ?? ""}
          onChange={(e) => upd({ listTitle: e.target.value || undefined })}
        />
      </div>

      {/* Wallpaper */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Wallpaper</p>
        <input
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Paste image URL…"
          value={item.listWallpaperUrl?.startsWith("data:") ? "" : (item.listWallpaperUrl ?? "")}
          onChange={(e) => upd({ listWallpaperUrl: e.target.value || undefined })}
        />
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Upload size={11} /> Upload
          </button>
          {item.listWallpaperUrl && (
            <button onClick={() => upd({ listWallpaperUrl: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        {item.listWallpaperUrl && (
          <WallpaperEditor
            url={item.listWallpaperUrl}
            size={item.listWallpaperSize ?? "cover"}
            position={item.listWallpaperPosition ?? "center"}
            opacity={item.listWallpaperOpacity ?? 1}
            onSizeChange={(v) => upd({ listWallpaperSize: v })}
            onPositionChange={(v) => upd({ listWallpaperPosition: v })}
            onOpacityChange={(v) => upd({ listWallpaperOpacity: v })}
          />
        )}
      </div>

      {/* Font */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Font</p>
        <div className="flex flex-col gap-2">
          <FontPicker
            compact
            value={item.listFontFamily ?? "Inter"}
            onChange={(font) => { loadGoogleFont(font); upd({ listFontFamily: font }); }}
          />
          <PanelSlider label="Size" value={item.listFontSize ?? 14} min={8} max={48} onChange={(v) => upd({ listFontSize: v })} />
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
            <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listFontColor ?? "#f2f2f2" }}>
              <input type="color" value={item.listFontColor ?? "#f2f2f2"} onChange={(e) => upd({ listFontColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </span>
            <span className="flex-1 text-[var(--text-secondary)]">Text color</span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{item.listFontColor ?? "default"}</span>
          </label>
        </div>
      </div>

      {/* Marker */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Marker style</p>
        <div className="flex gap-1.5">
          {([
            { id: "checkbox", icon: "☑", label: "Check" },
            { id: "bullet",   icon: "•", label: "Bullet" },
            { id: "number",   icon: "1.", label: "Number" },
            { id: "none",     icon: "—", label: "None" },
          ] as const).map((m) => (
            <button
              key={m.id}
              onClick={() => upd({ listMarker: m.id })}
              className={cn(
                "flex-1 rounded-lg border py-1.5 flex flex-col items-center gap-0.5 transition-colors",
                (item.listMarker ?? "checkbox") === m.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
              )}
            >
              <span className="text-sm">{m.icon}</span>
              <span className="text-[10px]">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Border */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Border</p>
          <button
            onClick={() => upd({ listBorderWidth: hasBorder ? 0 : 1, listBorderColor: item.listBorderColor ?? "#ffffff", listBorderStyle: "solid" })}
            className={cn("rounded px-2 py-0.5 text-[11px] transition-colors border", hasBorder ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}
          >
            {hasBorder ? "On" : "Off"}
          </button>
        </div>
        {hasBorder && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
                <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listBorderColor ?? "#ffffff" }}>
                  <input type="color" value={item.listBorderColor ?? "#ffffff"} onChange={(e) => upd({ listBorderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-[var(--text-secondary)]">Color</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">W</span>
                <input type="number" min={1} max={16} value={item.listBorderWidth ?? 1} onChange={(e) => upd({ listBorderWidth: Number(e.target.value) })} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {LIST_BORDER_STYLES.map((bs) => {
                const bc = item.listBorderColor ?? "#ffffff";
                const bw = Math.max(1, Math.min(item.listBorderWidth ?? 1, 3));
                return (
                  <button
                    key={bs}
                    onClick={() => upd({ listBorderStyle: bs })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
                      (item.listBorderStyle ?? "solid") === bs ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-overlay)]"
                    )}
                  >
                    <div className="w-full rounded-sm" style={{ height: 10, border: `${bw}px ${bs} ${bc}` }} />
                    <span className={cn("text-[10px]", (item.listBorderStyle ?? "solid") === bs ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>{bs}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Shape */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Shape</p>
        <PanelSlider label="Corners" value={item.listBorderRadius ?? 0} min={0} max={120} onChange={(v) => upd({ listBorderRadius: v })} />
        <PanelSlider label="Padding" value={item.listPadding ?? (item.listBgColor || (item.listBorderWidth ?? 0) > 0 ? 8 : 0)} min={0} max={48} onChange={(v) => upd({ listPadding: v })} />
      </div>

      {/* Spacing */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Spacing</p>
        <PanelSlider label="Row gap" value={item.listRowSpacing ?? 4} min={0} max={32} onChange={(v) => upd({ listRowSpacing: v })} />
        <PanelSlider label="Letter" value={item.listLetterSpacing ?? 0} min={-3} max={20} step={0.5} onChange={(v) => upd({ listLetterSpacing: v })} decimals={1} />
        <PanelSlider label="Line H" value={item.listLineHeight ?? 1.6} min={0.8} max={4} step={0.1} onChange={(v) => upd({ listLineHeight: v })} decimals={1} />
      </div>

      {/* Background */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Background</p>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
          <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listBgColor || "transparent", backgroundImage: !item.listBgColor ? "repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%) 0/6px 6px" : undefined }}>
            <input type="color" value={item.listBgColor ?? "#1a1b1e"} onChange={(e) => upd({ listBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </span>
          <span className="flex-1 text-[var(--text-secondary)]">Fill color</span>
          {item.listBgColor && <button onClick={(e) => { e.preventDefault(); upd({ listBgColor: undefined }); }} className="text-[var(--text-muted)] hover:text-red-400 text-xs">×</button>}
        </label>
      </div>

      {/* Shadow */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Shadow</p>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {(["none","drop","hard","glow"] as const).map((s) => (
            <button key={s} onClick={() => upd({ listShadow: s })}
              className={cn("rounded border py-1.5 text-[11px] capitalize transition-colors",
                (item.listShadow ?? "none") === s ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
              )}>{s}</button>
          ))}
        </div>
        {item.listShadow && item.listShadow !== "none" && (
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
            <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listShadowColor ?? "#000000" }}>
              <input type="color" value={item.listShadowColor ?? "#000000"} onChange={(e) => upd({ listShadowColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </span>
            <span className="flex-1 text-[var(--text-secondary)]">Shadow color</span>
          </label>
        )}
      </div>

      {/* Dividers */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Dividers</p>
        <div className="grid grid-cols-4 gap-1 mb-3">
          {(["solid","dashed","dotted","none"] as const).map((s) => (
            <button key={s} onClick={() => upd({ listDividerStyle: s })}
              className={cn("rounded border py-1.5 text-[11px] capitalize transition-colors",
                (item.listDividerStyle ?? "solid") === s ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
              )}>{s}</button>
          ))}
        </div>
        {(item.listDividerStyle ?? "solid") !== "none" && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
              <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listDividerColor ?? "#ffffff" }}>
                <input type="color" value={item.listDividerColor ?? "#ffffff"} onChange={(e) => upd({ listDividerColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="flex-1 text-[var(--text-secondary)]">Color</span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">{item.listDividerColor ?? "#ffffff"}</span>
            </label>
            <PanelSlider label="Opacity" value={item.listDividerOpacity ?? 20} min={0} max={100} onChange={(v) => upd({ listDividerOpacity: v })} />
            <PanelSlider label="Width" value={item.listDividerWidth ?? 1} min={1} max={8} onChange={(v) => upd({ listDividerWidth: v })} />
          </div>
        )}
      </div>

      {/* Progress bar — only for checkbox marker */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Progress</p>
        {(item.listMarker ?? "checkbox") !== "checkbox" ? (
          <p className="text-[11px] text-[var(--text-muted)]">Only available with the Checkbox marker.</p>
        ) : (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!item.listShowProgress} onChange={(e) => upd({ listShowProgress: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Show progress bar</span>
          </label>
          {item.listShowProgress && (<>
            {/* Bar color */}
            <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
              <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listProgressColor ?? item.listCheckColor ?? "var(--accent)" }}>
                <input type="color" value={item.listProgressColor ?? item.listCheckColor ?? "#6c63ff"} onChange={(e) => upd({ listProgressColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="flex-1 text-[var(--text-secondary)]">Bar color</span>
              {item.listProgressColor && (
                <button onClick={() => upd({ listProgressColor: undefined })} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Reset</button>
              )}
            </label>
            {/* Height */}
            <PanelSlider label="Height" value={item.listProgressHeight ?? 6} min={2} max={20} onChange={(v) => upd({ listProgressHeight: v })} />
            {/* Style */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] flex-1">Style</span>
              <div className="flex rounded overflow-hidden border border-[var(--border)]">
                {(["rounded", "square"] as const).map(s => (
                  <button key={s} onClick={() => upd({ listProgressStyle: s })}
                    className="px-2.5 py-1 text-[11px] transition-colors capitalize"
                    style={{ background: (item.listProgressStyle ?? "rounded") === s ? "var(--accent)" : "transparent", color: (item.listProgressStyle ?? "rounded") === s ? "#fff" : "var(--text-muted)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {/* Position */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] flex-1">Position</span>
              <div className="flex rounded overflow-hidden border border-[var(--border)]">
                {(["top", "bottom"] as const).map(p => (
                  <button key={p} onClick={() => upd({ listProgressPosition: p })}
                    className="px-2.5 py-1 text-[11px] transition-colors capitalize"
                    style={{ background: (item.listProgressPosition ?? "top") === p ? "var(--accent)" : "transparent", color: (item.listProgressPosition ?? "top") === p ? "#fff" : "var(--text-muted)" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Label */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={item.listProgressShowLabel !== false} onChange={(e) => upd({ listProgressShowLabel: e.target.checked })} className="accent-[var(--accent)]" />
              <span className="text-[var(--text-secondary)]">Show label</span>
            </label>
          </>)}
        </div>
        )}
      </div>

      {/* Contributions */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Contributions</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!item.allowContributions} onChange={(e) => upd({ allowContributions: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-[var(--text-secondary)]">Let viewers add their own entries</span>
        </label>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Contributed entries are attributed to their author and only the author (or the board owner) can remove them.</p>
        {item.allowContributions && (
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!item.requireContributionApproval} onChange={(e) => upd({ requireContributionApproval: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Require approval before showing</span>
          </label>
        )}
      </div>

      {/* Checkbox */}
      {(item.listMarker ?? "checkbox") === "checkbox" && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Checkbox</p>
          <div className="flex flex-col gap-2">
            {/* Checked color */}
            <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
              <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: item.listCheckColor ?? "var(--accent)" }}>
                <input type="color" value={item.listCheckColor ?? "#6c63ff"} onChange={(e) => upd({ listCheckColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="flex-1 text-[var(--text-secondary)]">Checked color</span>
            </label>
            {/* Icon size */}
            <PanelSlider label="Icon size" value={item.listCheckIconSize ?? 18} min={12} max={48} onChange={(v) => upd({ listCheckIconSize: v })} />
            {/* Unchecked icon */}
            <div>
              <p className="mb-1 text-[11px] text-[var(--text-muted)]">Unchecked icon (URL or upload)</p>
              <div className="flex gap-1.5">
                <input
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="Image URL…"
                  value={item.listCheckUncheckedIcon?.startsWith("data:") ? "" : (item.listCheckUncheckedIcon ?? "")}
                  onChange={(e) => upd({ listCheckUncheckedIcon: e.target.value || undefined })}
                />
                <IconUploadBtn onUpload={(url) => upd({ listCheckUncheckedIcon: url })} />
                {item.listCheckUncheckedIcon && <button onClick={() => upd({ listCheckUncheckedIcon: undefined })} className="text-[var(--text-muted)] hover:text-red-400 text-xs px-1">×</button>}
              </div>
              {item.listCheckUncheckedIcon && (
                <img src={item.listCheckUncheckedIcon} alt="unchecked" className="mt-1 h-8 w-8 rounded object-contain border border-[var(--border)]" />
              )}
            </div>
            {/* Checked icon */}
            <div>
              <p className="mb-1 text-[11px] text-[var(--text-muted)]">Checked icon (optional — defaults to greyed unchecked)</p>
              <div className="flex gap-1.5">
                <input
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="Image URL…"
                  value={item.listCheckCheckedIcon?.startsWith("data:") ? "" : (item.listCheckCheckedIcon ?? "")}
                  onChange={(e) => upd({ listCheckCheckedIcon: e.target.value || undefined })}
                />
                <IconUploadBtn onUpload={(url) => upd({ listCheckCheckedIcon: url })} />
                {item.listCheckCheckedIcon && <button onClick={() => upd({ listCheckCheckedIcon: undefined })} className="text-[var(--text-muted)] hover:text-red-400 text-xs px-1">×</button>}
              </div>
              {item.listCheckCheckedIcon && (
                <img src={item.listCheckCheckedIcon} alt="checked" className="mt-1 h-8 w-8 rounded object-contain border border-[var(--border)]" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconUploadBtn({ onUpload }: { onUpload: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, onUpload, "icons");
    e.target.value = "";
  };
  return (
    <>
      <button onClick={() => ref.current?.click()}
        className="flex-shrink-0 rounded border border-dashed border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
        <Upload size={10} />
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </>
  );
}

function ChatColorRow({ label, value, fallback, onChange, onClear }: {
  label: string; value?: string; fallback: string; onChange: (c: string) => void; onClear: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 cursor-pointer hover:border-[var(--text-muted)] transition-colors">
      <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: value ?? fallback }}>
        <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      <span className="flex-1 text-[var(--text-secondary)]">{label}</span>
      {value ? (
        <button onClick={(e) => { e.preventDefault(); onClear(); }} className="font-mono text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">clear</button>
      ) : (
        <span className="font-mono text-[11px] text-[var(--text-muted)]">default</span>
      )}
    </label>
  );
}

function ChatToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", value ? "bg-[var(--accent)]" : "bg-[var(--border)]")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform", value ? "translate-x-[14px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

// Channels claimed by chat blocks on a board, excluding one item — used to keep
// a channel unique to a single chat block per board.
export function chatChannelsInUse(board: Board | undefined, excludeId: string): string[] {
  const set = new Set<string>();
  board?.boxes?.forEach((bx) => bx.items?.forEach((it) => { if (it.type === "chat" && it.id !== excludeId) set.add(it.chatChannelName ?? "general"); }));
  board?.boardItems?.forEach((it) => { if (it.type === "chat" && it.id !== excludeId) set.add(it.chatChannelName ?? "general"); });
  return [...set];
}

export function ChatStylePanel({ item, upd, usedChannels = [] }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; usedChannels?: string[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  // A channel may live on the board only once. `usedChannels` are the channels
  // taken by *other* chat blocks; if the user types one, revert on blur + warn.
  const lastValid = useRef(item.chatChannelName ?? "general");
  const current = (item.chatChannelName ?? "general").trim().toLowerCase();
  const collides = usedChannels.map((c) => c.trim().toLowerCase()).includes(current);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => upd({ chatBgImage: url }));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      {/* Channel */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Channel name</p>
        <input
          className={cn(
            "w-full rounded border bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors",
            collides ? "border-red-500/60 focus:border-red-500" : "border-[var(--border)] focus:border-[var(--accent)]"
          )}
          placeholder="general"
          value={item.chatChannelName ?? ""}
          onFocus={() => { if (!collides) lastValid.current = item.chatChannelName ?? "general"; }}
          onChange={(e) => upd({ chatChannelName: e.target.value || undefined })}
          onBlur={() => { if (collides) upd({ chatChannelName: lastValid.current }); }}
        />
        {collides && (
          <p className="mt-1 text-[11px] text-red-400">#{current} is already on this board — a channel can only appear once.</p>
        )}
      </div>

      {/* Mention color */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Mention color</p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={item.chatMentionColor ?? "#a78bfa"}
            onChange={(e) => upd({ chatMentionColor: e.target.value })}
            className="h-7 w-9 cursor-pointer rounded border border-[var(--border)] bg-transparent"
          />
          <span className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ background: `color-mix(in srgb, ${item.chatMentionColor ?? "var(--accent)"} 25%, transparent)`, color: item.chatMentionColor ?? "var(--accent)" }}>
            @preview
          </span>
          {item.chatMentionColor && (
            <button onClick={() => upd({ chatMentionColor: undefined })}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Background image */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Background image</p>
        <input
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Paste image URL…"
          value={item.chatBgImage?.startsWith("data:") ? "" : (item.chatBgImage ?? "")}
          onChange={(e) => upd({ chatBgImage: e.target.value || undefined })}
        />
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Upload size={11} /> Upload
          </button>
          {item.chatBgImage && (
            <button onClick={() => upd({ chatBgImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        {item.chatBgImage && (
          <WallpaperEditor
            url={item.chatBgImage}
            size={item.chatBgSize ?? "cover"}
            position={item.chatBgPosition ?? "center"}
            opacity={item.chatBgOpacity ?? 1}
            onSizeChange={(v) => upd({ chatBgSize: v })}
            onPositionChange={(v) => upd({ chatBgPosition: v })}
            onOpacityChange={(v) => upd({ chatBgOpacity: v })}
          />
        )}
      </div>

      {/* Colors */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Colors</p>
        <div className="flex flex-col gap-2">
          <ChatColorRow label="Background" value={item.chatBgColor} fallback="#1a1b1e" onChange={(c) => upd({ chatBgColor: c })} onClear={() => upd({ chatBgColor: undefined })} />
          <ChatColorRow label="Accent" value={item.chatAccentColor} fallback="#d59ee8" onChange={(c) => upd({ chatAccentColor: c })} onClear={() => upd({ chatAccentColor: undefined })} />
          <ChatColorRow label="Text" value={item.chatTextColor} fallback="#f2f2f2" onChange={(c) => upd({ chatTextColor: c })} onClear={() => upd({ chatTextColor: undefined })} />
        </div>
      </div>

      {/* Font */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Font</p>
        <div className="flex flex-col gap-2">
          <FontPicker compact value={item.chatFontFamily ?? "Inter"} onChange={(font) => { loadGoogleFont(font); upd({ chatFontFamily: font }); }} />
          <PanelSlider label="Size" value={item.chatFontSize ?? 14} min={10} max={22} onChange={(v) => upd({ chatFontSize: v })} />
        </div>
      </div>

      {/* Options */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Options</p>
        <div className="flex flex-col gap-2">
          <ChatToggleRow label="Message bubbles" value={item.chatBubbles ?? false} onChange={(v) => upd({ chatBubbles: v })} />
          <ChatToggleRow label="Hide channel header" value={item.chatHideHeader ?? false} onChange={(v) => upd({ chatHideHeader: v })} />
        </div>
      </div>
    </div>
  );
}

function PanelSlider({ label, value, min, max, step = 1, decimals = 0, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; decimals?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-12 flex-shrink-0 text-[11px] text-[var(--text-muted)]">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 accent-[var(--accent)] h-1"
      />
      <span className="w-8 text-right text-[11px] text-[var(--text-muted)] flex-shrink-0">{value.toFixed(decimals)}</span>
    </div>
  );
}

/**
 * Viewer-contributed list entries. These are NOT owner-authored rows in the board
 * JSONB — they live in board_item_contributions (RLS: read all, write own) and are
 * merged in below the owner's items. Each viewer can add/edit/delete only their own;
 * a board moderator (useCanEditBoard) can additionally pin or remove anyone's entry
 * through the security-definer RPCs (delete_contribution / set_contribution_pinned).
 */
function ListContributions({
  itemId, boardId, collapsed, canContribute, requireApproval, marker, dividerBorder, rowSpacing, fontColor,
}: {
  itemId: string;
  boardId: string;
  collapsed?: boolean;
  canContribute: boolean;
  requireApproval: boolean;
  marker: "checkbox" | "bullet" | "number" | "none";
  dividerBorder?: string;
  rowSpacing: number;
  fontColor?: string;
}) {
  const { identity } = useUser();
  const { contributions, add, removeOwn, editOwn, moderateRemove, togglePin, setApproved } = useItemContributions(itemId, boardId);
  const canModerate = useCanEditBoard();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const muted = fontColor ? fontColor + "90" : "var(--text-muted)";

  // Non-moderators only see approved entries (matters once "require approval" boxes exist);
  // pinned entries float to the top, otherwise oldest-first as loaded.
  const visible = contributions
    .filter((c) => c.approved || canModerate || c.authorId === identity.userId)
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  if (visible.length === 0 && (collapsed || !canContribute)) return null;

  const submitAdd = () => {
    const text = draft.trim();
    if (!text) return;
    void add(text, { approved: !requireApproval });
    setDraft("");
  };

  const commitEdit = (id: string) => {
    const text = editDraft.trim();
    if (text) void editOwn(id, text);
    setEditingId(null);
  };

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      {visible.map((c) => {
        const isOwn = c.authorId === identity.userId;
        const isEditing = editingId === c.id;
        const canDelete = isOwn || canModerate;
        return (
          <div key={c.id}
            className={cn("flex items-center gap-2 min-w-0 group/contrib", !c.approved && "opacity-50")}
            style={{
              paddingTop: rowSpacing / 2, paddingBottom: rowSpacing / 2,
              paddingLeft: 4, paddingRight: 4,
              borderTop: dividerBorder,
            }}>
            {c.pinned ? (
              <Pin size={11} className="w-4 flex-shrink-0" style={{ color: muted }} />
            ) : marker !== "none" && (
              <span className="w-4 flex-shrink-0 text-center" style={{ color: muted }}>•</span>
            )}
            {isEditing ? (
              <input
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(c.id); }
                  else if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => commitEdit(c.id)}
                className="flex-1 min-w-0 bg-transparent outline-none border-b border-[var(--border)]"
                style={{ fontSize: "inherit", fontFamily: "inherit", color: "inherit" }}
              />
            ) : (
              <span className="flex-1 min-w-0" style={{ wordBreak: "break-word" }}>
                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.content) }} />
                <span className="ml-1.5 text-[11px] whitespace-nowrap" style={{ color: muted }}>— {c.authorName || "Anonymous"}</span>
                {!c.approved && <span className="ml-1 text-[11px] whitespace-nowrap italic" style={{ color: muted }}>· pending</span>}
              </span>
            )}
            {!collapsed && !isEditing && (canDelete || canModerate) && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {isOwn && (
                  <button
                    onClick={() => { setEditingId(c.id); setEditDraft(c.content); }}
                    title="Edit your entry"
                    className="text-[var(--text-muted)] opacity-0 group-hover/contrib:opacity-100 hover:text-[var(--text-primary)] transition-colors rounded p-0.5"
                  >
                    <Pencil size={11} />
                  </button>
                )}
                {canModerate && !c.approved && (
                  <button
                    onClick={() => void setApproved(c.id, true)}
                    title="Approve entry"
                    className="text-[var(--text-muted)] opacity-0 group-hover/contrib:opacity-100 hover:text-green-400 transition-colors rounded p-0.5"
                  >
                    <Check size={11} />
                  </button>
                )}
                {canModerate && (
                  <button
                    onClick={() => void togglePin(c.id, !c.pinned)}
                    title={c.pinned ? "Unpin" : "Pin to top"}
                    className={cn("transition-colors rounded p-0.5", c.pinned
                      ? "text-[var(--accent)] hover:text-[var(--text-muted)]"
                      : "text-[var(--text-muted)] opacity-0 group-hover/contrib:opacity-100 hover:text-[var(--text-primary)]")}
                  >
                    <Pin size={11} />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => void (isOwn ? removeOwn(c.id) : moderateRemove(c.id))}
                    title={isOwn ? "Delete your entry" : "Remove entry (moderator)"}
                    className="text-[var(--text-muted)] opacity-0 group-hover/contrib:opacity-100 hover:text-red-400 transition-colors rounded p-0.5"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {canContribute && !collapsed && (
        <div className="flex items-center gap-2 min-w-0"
          style={{
            paddingTop: rowSpacing / 2, paddingBottom: rowSpacing / 2,
            paddingLeft: 4, paddingRight: 4,
            borderTop: visible.length > 0 ? dividerBorder : undefined,
          }}>
          <Plus size={11} className="flex-shrink-0" style={{ color: muted }} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
            placeholder="Add your entry…"
            className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-[var(--text-muted)]"
            style={{ fontSize: "inherit", fontFamily: "inherit", color: "inherit" }}
          />
        </div>
      )}
    </div>
  );
}

function ListItem({ item, upd, collapsed, isFinished, canInput, canContribute, boardId, boxId, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; canInput?: boolean; canContribute?: boolean; boardId: string; boxId: string; extraContextItems?: ContextMenuEntry[] }) {
  const entries = item.listItems ?? [];
  const shown = collapsed ? entries.slice(0, 4) : entries;
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [taskPopover, setTaskPopover] = useState<{ entryId: string; x: number; y: number } | null>(null);
  const { members } = useServerBoard();
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const marker = item.listMarker ?? "checkbox";
  const hasBorder = (item.listBorderWidth ?? 0) > 0;

  const setEntries = (next: ListEntry[]) => upd({ listItems: next });

  // Drag-to-reorder: move the dragged row to the drop target's position.
  const reorderEntries = (fromId: string, toId: string) => {
    const from = entries.findIndex((e) => e.id === fromId);
    const to = entries.findIndex((e) => e.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...entries];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setEntries(next);
  };

  const listContainerRef = useRef<HTMLDivElement>(null);
  const entryHTMLRef = useRef<Map<string, string>>(new Map());
  const editingDivRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingFocusId = useRef<string | null>(null);

  // Auto-focus newly created entries (after Enter key)
  useLayoutEffect(() => {
    const id = pendingFocusId.current;
    if (!id) return;
    const el = editingDivRefs.current.get(id);
    if (el) {
      pendingFocusId.current = null;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });

  const handleEntryHTMLChange = useCallback((el: HTMLElement) => {
    const id = el.dataset.entryId;
    if (!id) return;
    const html = el.innerHTML;
    entryHTMLRef.current.set(id, html);
    setEntries(entries.map((e) => e.id === id ? { ...e, text: html } : e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const { showToolbar: listShowToolbar, toolbarPos: listToolbarPos, selState, withSavedRange, wrapSelectionSpan, applyFontSizeRange, dismissSelToolbar } = useRichSel(
    listContainerRef,
    handleEntryHTMLChange,
  );

  // Initialize entry divs on mount
  useEffect(() => {
    if (!listContainerRef.current) return;
    for (const entry of entries) {
      const el = listContainerRef.current.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"]`);
      if (el) {
        el.innerHTML = entry.text ?? "";
        entryHTMLRef.current.set(entry.id, entry.text ?? "");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external changes (undo, collaboration) without disrupting active editing
  useEffect(() => {
    if (!listContainerRef.current) return;
    for (const entry of entries) {
      const el = listContainerRef.current.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"]`);
      if (el && document.activeElement !== el && entry.text !== entryHTMLRef.current.get(entry.id)) {
        el.innerHTML = entry.text ?? "";
        entryHTMLRef.current.set(entry.id, entry.text ?? "");
      }
    }
  }, [entries]);

  const listShadowColor = item.listShadowColor ?? "#000000";
  const listBoxShadow = item.listShadow === "drop" ? `4px 4px 8px ${listShadowColor}99`
    : item.listShadow === "hard" ? `3px 3px 0px ${listShadowColor}`
    : item.listShadow === "glow" ? `0 0 12px ${listShadowColor}, 0 0 24px ${listShadowColor}88`
    : undefined;

  const rowSpacing = item.listRowSpacing ?? 4;
  const containerStyle: React.CSSProperties = {
    fontFamily: item.listFontFamily ?? "inherit",
    fontSize: `${item.listFontSize ?? 14}px`,
    letterSpacing: item.listLetterSpacing ? `${item.listLetterSpacing}px` : undefined,
    lineHeight: item.listLineHeight ?? 1.6,
    color: item.listFontColor || undefined,
    backgroundColor: item.listBgColor || undefined,
    border: hasBorder ? `${item.listBorderWidth}px ${item.listBorderStyle ?? "solid"} ${item.listBorderColor ?? "#ffffff"}` : undefined,
    borderRadius: item.listBorderRadius ?? 0,
    boxShadow: listBoxShadow,
    padding: item.listPadding ?? (hasBorder || item.listBgColor ? 8 : 0),
    position: "relative",
    overflow: "hidden",
  };

  const checkedCount = entries.filter((e) => e.checked).length;
  const progressPct = entries.length > 0 ? (checkedCount / entries.length) * 100 : 0;

  const progressBar = item.listShowProgress && !collapsed && entries.length > 0 && marker === "checkbox" ? (() => {
    const barH = item.listProgressHeight ?? 6;
    const barR = item.listProgressStyle === "square" ? 2 : 9999;
    const barColor = item.listProgressColor ?? item.listCheckColor ?? "var(--accent)";
    return (
      <div className="relative z-10 flex flex-col gap-1">
        {item.listProgressShowLabel !== false && (
          <div className="flex items-center justify-between text-[11px]" style={{ color: item.listFontColor ? item.listFontColor + "90" : "var(--text-muted)" }}>
            <span>{checkedCount} / {entries.length} done</span>
            <span className="font-semibold">{Math.round(progressPct)}%</span>
          </div>
        )}
        <div style={{ height: barH, borderRadius: barR, overflow: "hidden", background: "var(--border)" }}>
          <div style={{ height: "100%", borderRadius: barR, width: `${progressPct}%`, background: barColor, transition: "width 300ms" }} />
        </div>
      </div>
    );
  })() : null;

  return (
    <div ref={listContainerRef} className="flex flex-col w-full h-full" style={containerStyle}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!isFinished) setContextMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Wallpaper layer */}
      {item.listWallpaperUrl && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, borderRadius: item.listBorderRadius ?? 0,
          backgroundImage: `url(${item.listWallpaperUrl})`,
          backgroundSize: item.listWallpaperSize ?? "cover",
          backgroundPosition: item.listWallpaperPosition ?? "center",
          backgroundRepeat: "no-repeat",
          opacity: item.listWallpaperOpacity ?? 1,
        }} />
      )}
      {/* List title */}
      {item.listTitle && (
        <p className="relative z-10 font-semibold truncate shrink-0" style={{
          color: item.listFontColor || undefined,
          fontSize: (item.listFontSize ?? 14) + 2,
          marginBottom: collapsed ? 2 : 6,
        }}>
          {item.listTitle}
        </p>
      )}
      {/* Progress bar — top position (default) */}
      {(item.listProgressPosition ?? "top") === "top" && progressBar && (
        <div className="mb-2">{progressBar}</div>
      )}
      {shown.map((entry, i) => {
        // Divider
        const divStyle = item.listDividerStyle ?? "solid";
        const divColor = item.listDividerColor ?? "#ffffff";
        const divOpacity = (item.listDividerOpacity ?? 20) / 100;
        const divWidth = item.listDividerWidth ?? 1;
        const dividerBorder = i > 0 && divStyle !== "none"
          ? `${divWidth}px ${divStyle} ${divColor}${Math.round(divOpacity * 255).toString(16).padStart(2, "0")}`
          : undefined;

        // Checkbox icon
        const iconSize = item.listCheckIconSize ?? 18;
        const checkColor = item.listCheckColor ?? "var(--accent)";
        const hasCustomIcon = !!(item.listCheckUncheckedIcon || item.listCheckCheckedIcon);

        return (
          <div key={entry.id}
            className={cn("flex items-center gap-2 min-w-0 group/le transition-colors hover:bg-white/5 active:bg-white/10", dragId === entry.id && "opacity-40")}
            onDragOver={!isFinished && !collapsed ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
            onDrop={!isFinished && !collapsed ? (e) => { e.preventDefault(); if (dragId) reorderEntries(dragId, entry.id); setDragId(null); } : undefined}
            style={{
              position: "relative", zIndex: 1,
              paddingTop: rowSpacing / 2, paddingBottom: rowSpacing / 2,
              paddingLeft: 4 + (entry.depth ?? 0) * 20, paddingRight: 4, // nesting indent
              borderTop: dividerBorder,
            }}>
            {marker === "checkbox" && (
              hasCustomIcon ? (
                <button
                  onClick={(e) => { e.stopPropagation(); if (!isFinished) setEntries(entries.map((ev) => ev.id === entry.id ? { ...ev, checked: !ev.checked } : ev)); }}
                  className="flex-shrink-0 transition-opacity"
                  style={{ width: iconSize, height: iconSize, cursor: isFinished ? "default" : undefined }}
                >
                  {entry.checked && item.listCheckCheckedIcon ? (
                    <img src={item.listCheckCheckedIcon} alt="" style={{ width: iconSize, height: iconSize, objectFit: "contain" }} />
                  ) : (
                    <img
                      src={item.listCheckUncheckedIcon || item.listCheckCheckedIcon!}
                      alt=""
                      style={{ width: iconSize, height: iconSize, objectFit: "contain", opacity: entry.checked ? 0.3 : 1, filter: entry.checked ? "grayscale(1)" : undefined }}
                    />
                  )}
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); if (!isFinished) setEntries(entries.map((ev) => ev.id === entry.id ? { ...ev, checked: !ev.checked } : ev)); }}
                  className={cn("flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                    entry.checked ? "border-transparent" : "border-[var(--border)] hover:border-[var(--accent)]",
                    isFinished && "cursor-default")}
                  style={entry.checked ? { backgroundColor: checkColor, borderColor: checkColor } : undefined}
                >
                  {entry.checked && <Check size={10} className="text-white" />}
                </button>
              )
            )}
            {marker === "bullet" && (
              <span className="w-4 flex-shrink-0 text-center" style={{ color: item.listFontColor || "var(--text-muted)" }}>•</span>
            )}
            {marker === "number" && (
              <span className="w-5 flex-shrink-0 text-right text-xs" style={{ color: item.listFontColor || "var(--text-muted)" }}>{i + 1}.</span>
            )}

            {collapsed ? (
              <span className={cn("flex-1", entry.checked && marker === "checkbox" && "line-through opacity-40")} style={{ fontSize: "inherit" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.text ?? "") }} />
            ) : (
              <div
                data-entry-id={entry.id}
                contentEditable={!isFinished && canInput !== false}
                suppressContentEditableWarning
                className={cn("flex-1 min-w-0 outline-none", entry.checked && marker === "checkbox" && "line-through opacity-40")}
                style={{ fontSize: "inherit", fontFamily: "inherit", color: "inherit", wordBreak: "break-word", whiteSpace: "pre-wrap", minHeight: "1em", caretColor: (isFinished || canInput === false) && editingEntryId !== entry.id ? "transparent" : undefined }}
                ref={(el) => {
                  if (el) editingDivRefs.current.set(entry.id, el);
                  else editingDivRefs.current.delete(entry.id);
                }}
                onFocus={() => { if (isFinished && !locked) setEditingEntryId(entry.id); }}
                onBlur={() => { if (isFinished) setEditingEntryId(null); }}
                onInput={(e) => {
                  if (isFinished && (locked || editingEntryId !== entry.id)) {
                    e.currentTarget.innerHTML = entryHTMLRef.current.get(entry.id) ?? entry.text ?? "";
                    return;
                  }
                  const html = (e.currentTarget as HTMLDivElement).innerHTML;
                  entryHTMLRef.current.set(entry.id, html);
                  setEntries(entries.map((x) => x.id === entry.id ? { ...x, text: html } : x));
                }}
                onKeyDown={(e) => {
                  if (isFinished && (locked || editingEntryId !== entry.id)) { e.preventDefault(); return; }
                  const el = e.currentTarget as HTMLDivElement;
                  const isEmpty = el.innerHTML === "" || el.innerHTML === "<br>";
                  if (!isFinished && e.key === " " && applyInlineMarkdownAtCursor()) {
                    // Inline markdown (**bold**, *italic*, ~~strike~~, `code`) in a row.
                    e.preventDefault();
                    const html = el.innerHTML;
                    entryHTMLRef.current.set(entry.id, html);
                    setEntries(entries.map((x) => x.id === entry.id ? { ...x, text: html } : x));
                  } else if (!isFinished && e.key === "Tab") {
                    // Tab indents, Shift+Tab outdents — Notion-style nesting.
                    e.preventDefault();
                    const cur = entry.depth ?? 0;
                    const prevDepth = i > 0 ? (entries[i - 1]!.depth ?? 0) : -1;
                    const nextDepth = e.shiftKey
                      ? Math.max(0, cur - 1)
                      : Math.min(cur + 1, prevDepth + 1, 6); // can't indent deeper than the row above + 1
                    if (nextDepth !== cur) setEntries(entries.map((x) => x.id === entry.id ? { ...x, depth: nextDepth } : x));
                  } else if (!isFinished && e.key === "Enter") {
                    e.preventDefault();
                    const newId = nanoid();
                    pendingFocusId.current = newId;
                    const next = [...entries];
                    next.splice(i + 1, 0, { id: newId, text: "", checked: false, depth: entry.depth ?? 0 });
                    setEntries(next);
                  } else if (!isFinished && e.key === "Backspace" && isEmpty && (entry.depth ?? 0) > 0) {
                    // Outdent an empty nested row before deleting it (Notion behaviour).
                    e.preventDefault();
                    setEntries(entries.map((x) => x.id === entry.id ? { ...x, depth: (x.depth ?? 0) - 1 } : x));
                  } else if (!isFinished && e.key === "Backspace" && isEmpty && entries.length > 1) {
                    e.preventDefault();
                    const prevEntry = entries[i - 1];
                    if (prevEntry) {
                      const prevEl = editingDivRefs.current.get(prevEntry.id);
                      if (prevEl) {
                        prevEl.focus();
                        const range = document.createRange();
                        range.selectNodeContents(prevEl);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                      }
                    }
                    setEntries(entries.filter((x) => x.id !== entry.id));
                  } else if (isFinished && e.key === "Escape") {
                    el.blur();
                  }
                }}
              />
            )}
            {(entry.due || entry.assigneeId) && (
              <span className="flex flex-shrink-0 items-center gap-1.5">
                {entry.due && <DueChip due={entry.due} done={entry.checked && marker === "checkbox"} />}
                {entry.assigneeId && memberById.get(entry.assigneeId) && (
                  <MemberAvatar member={memberById.get(entry.assigneeId)!} size={14} />
                )}
              </span>
            )}
            {!isFinished && !collapsed && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {canInput !== false && (
                  <button
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setTaskPopover({ entryId: entry.id, x: r.right - 220, y: r.bottom + 6 });
                    }}
                    title="Due date & assignee"
                    className="text-[var(--text-muted)] opacity-0 group-hover/le:opacity-100 hover:text-[var(--text-primary)] transition-colors rounded p-0.5"
                  >
                    <CalendarDays size={11} />
                  </button>
                )}
                <span
                  draggable
                  onDragStart={(e) => { setDragId(entry.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", entry.id); }}
                  onDragEnd={() => setDragId(null)}
                  title="Drag to reorder"
                  className="cursor-grab text-[var(--text-muted)] opacity-0 group-hover/le:opacity-100 hover:text-[var(--text-primary)] transition-colors rounded p-0.5 active:cursor-grabbing"
                >
                  <GripVertical size={11} />
                </span>
                <button onClick={() => setEntries(entries.filter((x) => x.id !== entry.id))} className="text-[var(--text-muted)] opacity-0 group-hover/le:opacity-100 hover:text-red-400 transition-colors rounded p-0.5">
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {collapsed && entries.length > 4 && (
        <p className="text-xs text-[var(--text-muted)] px-1" style={{ position: "relative", zIndex: 1, paddingTop: rowSpacing / 2 }}>+{entries.length - 4} more items</p>
      )}
      {/* Progress bar — bottom position */}
      {item.listProgressPosition === "bottom" && progressBar && (
        <div className="mt-2">{progressBar}</div>
      )}
      {!isFinished && !collapsed && (
        <button onClick={() => setEntries([...entries, { id: nanoid(), text: "", checked: false }])}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors w-full px-1"
          style={{ position: "relative", zIndex: 1, paddingTop: rowSpacing / 2, paddingBottom: rowSpacing / 2,
            borderTop: shown.length > 0 && (item.listDividerStyle ?? "solid") !== "none"
              ? `${item.listDividerWidth ?? 1}px ${item.listDividerStyle ?? "solid"} ${item.listDividerColor ?? "#ffffff"}${Math.round(((item.listDividerOpacity ?? 20) / 100) * 255).toString(16).padStart(2, "0")}`
              : undefined }}>
          <Plus size={11} /> Add item
        </button>
      )}
      {/* Viewer contributions — entries live in board_item_contributions, not the board JSONB. */}
      {item.allowContributions && (
        <ListContributions
          itemId={item.id}
          boardId={boardId}
          collapsed={collapsed}
          canContribute={!!canContribute}
          requireApproval={!!item.requireContributionApproval}
          marker={marker}
          dividerBorder={shown.length > 0 && (item.listDividerStyle ?? "solid") !== "none"
            ? `${item.listDividerWidth ?? 1}px ${item.listDividerStyle ?? "solid"} ${item.listDividerColor ?? "#ffffff"}${Math.round(((item.listDividerOpacity ?? 20) / 100) * 255).toString(16).padStart(2, "0")}`
            : undefined}
          rowSpacing={rowSpacing}
          fontColor={item.listFontColor}
        />
      )}
      {listShowToolbar && listToolbarPos && !collapsed && !isFinished && createPortal(
        <RichSelToolbar
          cx={listToolbarPos.cx}
          top={listToolbarPos.top}
          selState={selState}
          onExecCmd={(cmd) => withSavedRange(() => document.execCommand(cmd))}
          onParaStyle={(styleId) => {
            const tagMap: Record<string, string> = { h1: "h1", h2: "h2", h3: "h3", code: "pre", normal: "p" };
            withSavedRange(() => document.execCommand("formatBlock", false, tagMap[styleId] ?? "p"));
          }}
          onFontFamily={(font) => { loadGoogleFont(font); if (!wrapSelectionSpan({ fontFamily: font })) upd({ listFontFamily: font }); }}
          onFontSize={(size) => {
            if (!applyFontSizeRange(size)) {
              // Apply to all entries in one upd call to avoid stale-closure issues with handleEntryHTMLChange
              const editables = Array.from(listContainerRef.current?.querySelectorAll<HTMLElement>('[contenteditable="true"]') ?? []);
              const updatedItems = entries.map(e => {
                const el = editables.find(div => div.dataset.entryId === e.id);
                if (!el) return e;
                el.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach(child => {
                  child.style.removeProperty('font-size');
                  if (!child.getAttribute('style')?.trim()) child.removeAttribute('style');
                });
                const html = el.innerHTML;
                entryHTMLRef.current.set(e.id, html);
                return { ...e, text: html };
              });
              upd({ listItems: updatedItems, listFontSize: size });
            }
          }}
          onColor={(color) => withSavedRange(() => {
            document.execCommand("styleWithCSS", false, "true");
            document.execCommand("foreColor", false, color);
            document.execCommand("styleWithCSS", false, "false");
          })}
          onHighlight={(color) => withSavedRange(() => {
            document.execCommand("styleWithCSS", false, "true");
            document.execCommand("hiliteColor", false, color);
            document.execCommand("styleWithCSS", false, "false");
          })}
          onClearFormat={() => { withSavedRange(() => document.execCommand("removeFormat")); dismissSelToolbar(); }}
          onDismiss={dismissSelToolbar}
        />,
        document.body
      )}
      {taskPopover && (() => {
        const entry = entries.find((x) => x.id === taskPopover.entryId);
        if (!entry) return null;
        return (
          <TaskFieldsPopover
            x={taskPopover.x}
            y={taskPopover.y}
            due={entry.due}
            assigneeId={entry.assigneeId}
            onChange={(p) => setEntries(entries.map((x) => x.id === entry.id ? { ...x, due: p.due, assigneeId: p.assigneeId } : x))}
            onClose={() => setTaskPopover(null)}
            remind={{ title: htmlToPlainText(entry.text) || "Task", boardId, itemId: item.id }}
          />
        );
      })()}
      {contextMenu && (() => {
        const tmp = document.createElement("div");
        const ctxItems: ContextMenuEntry[] = [
          ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
          ...(!isFinished ? [
            { label: "Add item", icon: <Plus size={14} />, onClick: () => setEntries([...entries, { id: nanoid(), text: "", checked: false }]) },
            "separator" as const,
          ] : []),
          { label: locked ? "Unlock editing" : "Lock editing", icon: locked ? <LockOpen size={14} /> : <Lock size={14} />, onClick: () => setLocked(v => !v) },
          ...(!isFinished ? [
            "separator" as const,
            { label: "Style preset", icon: <List size={14} />, children: LIST_PRESETS.map((p) => ({
              label: p.label,
              onClick: () => upd(p.style),
            })) },
            { label: "Sort A → Z", icon: <ArrowUpDown size={14} />, onClick: () => setEntries([...entries].sort((a, b) => (a.text ?? "").replace(/<[^>]*>/g, "").localeCompare((b.text ?? "").replace(/<[^>]*>/g, "")))) },
            { label: "Sort Z → A", icon: <ArrowUpDown size={14} />, onClick: () => setEntries([...entries].sort((a, b) => (b.text ?? "").replace(/<[^>]*>/g, "").localeCompare((a.text ?? "").replace(/<[^>]*>/g, "")))) },
          ] : []),
          ...(marker === "checkbox" ? [
            "separator" as const,
            { label: "Check all", icon: <CheckSquare size={14} />, onClick: () => setEntries(entries.map(e => ({ ...e, checked: true }))) },
            { label: "Uncheck all", icon: <Square size={14} />, onClick: () => setEntries(entries.map(e => ({ ...e, checked: false }))) },
            ...(!isFinished ? [{ label: "Delete checked", icon: <Trash2 size={14} />, danger: true, onClick: () => setEntries(entries.filter(e => !e.checked)) }] : []),
          ] : []),
          ...(!isFinished ? [
            "separator" as const,
            { label: "Clear all items", icon: <Trash2 size={14} />, danger: true, onClick: () => setEntries([]) },
          ] : []),
          "separator" as const,
          { label: "Copy as text", icon: <Copy size={14} />, onClick: () => { const text = entries.map(e => { tmp.innerHTML = e.text ?? ""; return tmp.textContent ?? ""; }).filter(Boolean).join("\n"); navigator.clipboard.writeText(text); } },
        ];
        return <ContextMenu x={contextMenu.x} y={contextMenu.y} items={ctxItems} onClose={() => setContextMenu(null)} />;
      })()}
    </div>
  );
}

// ─── Embed ────────────────────────────────────────────────────────────────────

function EmbedItem({ item, upd, collapsed, isFinished, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; extraContextItems?: ContextMenuEntry[] }) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const url = item.embedUrl ?? "";
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  const ytId = ytMatch?.[1];
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  const vimeoId = vimeoMatch?.[1];
  const embedSrc = ytId
    ? `https://www.youtube.com/embed/${ytId}`
    : vimeoId
    ? `https://player.vimeo.com/video/${vimeoId}`
    : null;

  const br = item.embedBorderRadius ?? 8;
  const bw = item.embedBorderWidth ?? 0;
  const bc = item.embedBorderColor ?? "#ffffff";
  const bs = item.embedBorderStyle ?? "solid";

  const filterParts: string[] = [];
  if (item.embedFilterBrightness !== undefined && item.embedFilterBrightness !== 100) filterParts.push(`brightness(${item.embedFilterBrightness}%)`);
  if (item.embedFilterContrast !== undefined && item.embedFilterContrast !== 100) filterParts.push(`contrast(${item.embedFilterContrast}%)`);
  if (item.embedFilterSaturate !== undefined && item.embedFilterSaturate !== 100) filterParts.push(`saturate(${item.embedFilterSaturate}%)`);
  if (item.embedFilterGrayscale) filterParts.push(`grayscale(${item.embedFilterGrayscale}%)`);
  if (item.embedFilterSepia) filterParts.push(`sepia(${item.embedFilterSepia}%)`);
  if (item.embedFilterBlur) filterParts.push(`blur(${item.embedFilterBlur}px)`);
  if (item.embedFilterHueRotate) filterParts.push(`hue-rotate(${item.embedFilterHueRotate}deg)`);
  const filterStr = filterParts.join(" ") || undefined;

  const shadowMap: Record<string, string> = {
    sm: "0 2px 8px rgba(0,0,0,0.4)",
    md: "0 4px 20px rgba(0,0,0,0.55)",
    lg: "0 8px 40px rgba(0,0,0,0.7)",
    glow: `0 0 24px ${bc}88`,
  };
  const boxShadow = item.embedShadow && item.embedShadow !== "none" ? shadowMap[item.embedShadow] : undefined;

  const wrapStyle: React.CSSProperties = {
    borderRadius: br,
    overflow: "hidden",
    border: bw > 0 ? (bs === "glow" ? `${bw}px solid ${bc}` : `${bw}px ${bs} ${bc}`) : undefined,
    boxShadow: bs === "glow" && bw > 0 ? `0 0 ${bw * 4}px ${bc}88` : boxShadow,
    filter: filterStr,
  };

  const commitUrl = (val: string) => {
    const trimmed = val.trim();
    if (trimmed) upd({ embedUrl: trimmed });
    setEditingUrl(false);
  };

  if ((!url || editingUrl) && !isFinished) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 w-full h-full rounded border border-dashed border-[var(--border)] p-4 text-[var(--text-muted)]">
        <ExternalLink size={22} className="opacity-50" />
        <input
          key={String(editingUrl)}
          autoFocus={editingUrl}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none text-center placeholder:text-[var(--text-muted)]"
          placeholder="Paste a YouTube, Vimeo, or any URL…"
          defaultValue={editingUrl ? url : ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUrl((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditingUrl(false);
          }}
          onBlur={(e) => { if (e.target.value.trim()) commitUrl(e.target.value); else setEditingUrl(false); }}
        />
        {editingUrl && (
          <button onClick={() => setEditingUrl(false)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Cancel
          </button>
        )}
      </div>
    );
  }

  const editBar = !isFinished && (
    <div className="flex items-center gap-2 mt-1">
      <button onClick={() => setEditingUrl(true)}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <ExternalLink size={11} /> Change URL
      </button>
      <span className="text-[var(--border)]">·</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
        Open in new tab
      </a>
      <span className="text-[var(--border)]">·</span>
      <button onClick={() => upd({ embedUrl: "" })}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">
        <Trash2 size={11} /> Remove
      </button>
    </div>
  );

  if (collapsed) {
    if (ytId) {
      if (playing) {
        return (
          <div className="relative w-full h-full min-h-[120px]" style={wrapStyle}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="embed"
              style={{ border: "none" }}
            />
          </div>
        );
      }
      return (
        <div
          className="relative w-full h-full min-h-[120px] cursor-pointer group/thumb"
          style={wrapStyle}
          onClick={(e) => { e.stopPropagation(); setPlaying(true); }}
        >
          <img
            src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
            alt="YouTube thumbnail"
            className="w-full h-full object-cover"
            style={{ display: "block" }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/thumb:bg-black/40 transition-colors">
            <div className="bg-black/70 group-hover/thumb:bg-black/90 transition-colors rounded-full p-3 shadow-lg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full min-h-[80px]" style={wrapStyle}>
        <iframe src={url} className="w-full h-full" title="embed" style={{ border: "none", display: "block" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full h-full" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {embedSrc ? (
        <div className="relative w-full flex-1 min-h-0">
          <div className="relative w-full" style={{ paddingBottom: "56.25%", ...wrapStyle }}>
            <iframe src={embedSrc} className="absolute inset-0 h-full w-full" allowFullScreen title="embed" style={{ border: "none" }} />
          </div>
        </div>
      ) : (
        <div style={wrapStyle} className="flex-1 min-h-0">
          <iframe src={url} className="h-full w-full min-h-[120px]" title="embed" style={{ border: "none", display: "block" }} />
        </div>
      )}
      {editBar}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            ...(url ? [
              { label: "Copy URL", icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(url) },
              { label: "Open in new tab", icon: <ExternalLink size={14} />, onClick: () => window.open(url, "_blank") },
            ] : []),
            ...(!isFinished ? [
              "separator" as const,
              { label: "Change URL", icon: <Pencil size={14} />, onClick: () => setEditingUrl(true) },
              ...(url ? ["separator" as const, { label: "Clear URL", icon: <Trash2 size={14} />, danger: true, onClick: () => { upd({ embedUrl: "" }); setPlaying(false); } }] : []),
            ] : []),
          ]}
        />
      )}
    </div>
  );
}

export function EmbedStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const sliders: Array<{ label: string; key: keyof BlockItem; min: number; max: number; def: number; unit: string }> = [
    { label: "Brightness", key: "embedFilterBrightness", min: 0, max: 200, def: 100, unit: "%" },
    { label: "Contrast",   key: "embedFilterContrast",   min: 0, max: 200, def: 100, unit: "%" },
    { label: "Saturation", key: "embedFilterSaturate",   min: 0, max: 200, def: 100, unit: "%" },
    { label: "Grayscale",  key: "embedFilterGrayscale",  min: 0, max: 100, def: 0,   unit: "%" },
    { label: "Sepia",      key: "embedFilterSepia",      min: 0, max: 100, def: 0,   unit: "%" },
    { label: "Blur",       key: "embedFilterBlur",       min: 0, max: 20,  def: 0,   unit: "px" },
    { label: "Hue rotate", key: "embedFilterHueRotate",  min: 0, max: 360, def: 0,   unit: "°" },
  ];

  return (
    <div className="flex flex-col gap-5 p-3">

      {/* Border */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Border</p>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-[var(--text-muted)]">Color</span>
            <div className="relative h-8 w-full rounded border border-[var(--border)] overflow-hidden" style={{ backgroundColor: item.embedBorderColor ?? "#ffffff" }}>
              <input type="color" value={item.embedBorderColor ?? "#ffffff"} onChange={(e) => upd({ embedBorderColor: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </label>
          <label className="flex flex-col gap-1 w-16">
            <span className="text-[11px] text-[var(--text-muted)]">Width</span>
            <input type="number" min={0} max={20} value={item.embedBorderWidth ?? 0}
              onChange={(e) => upd({ embedBorderWidth: Number(e.target.value) })}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(["solid","dashed","dotted","double","glow"] as const).map((s) => (
            <button key={s} onClick={() => upd({ embedBorderStyle: s })}
              className={cn("rounded py-1 text-[11px] capitalize transition-colors",
                (item.embedBorderStyle ?? "solid") === s ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}>{s}</button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-muted)]">Corner radius</span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">{item.embedBorderRadius ?? 8}px</span>
          </div>
          <input type="range" min={0} max={48} value={item.embedBorderRadius ?? 8}
            onChange={(e) => upd({ embedBorderRadius: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]" />
        </div>
      </div>

      {/* Shadow */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Shadow</p>
        <div className="grid grid-cols-3 gap-1">
          {(["none","sm","md","lg","glow"] as const).map((s) => (
            <button key={s} onClick={() => upd({ embedShadow: s })}
              className={cn("rounded py-1 text-[11px] capitalize transition-colors",
                (item.embedShadow ?? "none") === s ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}>{s}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filters</p>
          <button onClick={() => upd({ embedFilterBrightness: undefined, embedFilterContrast: undefined, embedFilterSaturate: undefined, embedFilterGrayscale: undefined, embedFilterSepia: undefined, embedFilterBlur: undefined, embedFilterHueRotate: undefined })}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Reset</button>
        </div>
        {sliders.map(({ label, key, min, max, def, unit }) => {
          const val = (item[key] as number | undefined) ?? def;
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">{val}{unit}</span>
              </div>
              <input type="range" min={min} max={max} value={val}
                onChange={(e) => upd({ [key]: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]" />
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ─── Timer ────────────────────────────────────────────────────────────────────

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

// ─── Timer presets ────────────────────────────────────────────────────────────

const TIMER_PRESETS = [
  { id: "pomodoro",  label: "Pomodoro",  workSecs: 25*60, breakSecs: 5*60, longBreakSecs: 15*60, cycles: 4,  pomodoro: true },
  { id: "flow",      label: "Flow 50/10", workSecs: 50*60, breakSecs: 10*60, longBreakSecs: 20*60, cycles: 3, pomodoro: true },
  { id: "sprint",    label: "Sprint",    workSecs: 15*60, breakSecs: 5*60,  longBreakSecs: 10*60, cycles: 4, pomodoro: false },
  { id: "deepwork",  label: "Deep Work", workSecs: 90*60, breakSecs: 20*60, longBreakSecs: 30*60, cycles: 2, pomodoro: true },
] as const;

const PHASE_LABELS: Record<string, string> = {
  work: "Focus",
  break: "Short Break",
  "long-break": "Long Break",
};

function TimerItem({ item, upd, collapsed, isFinished, containerH, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; containerH?: number; extraContextItems?: ContextMenuEntry[] }) {
  const mode = item.timerMode ?? "countdown";
  const total = item.timerSeconds ?? 300;
  const accent = item.timerAccentColor ?? "var(--accent)";
  const fontColor = item.timerFontColor ?? "var(--text-primary)";
  const fontSize = item.timerFontSize ?? 48;
  const fontFamily = item.timerFontFamily;
  const bold = item.timerBold !== false;
  const showLabel = item.timerShowLabel !== false;
  const labelPos = item.timerLabelPosition ?? "bottom";

  const pomodoroEnabled = !!item.timerPomodoroEnabled && mode === "countdown";
  const pomodoroWorkSecs = item.timerPomodoroWorkSecs ?? 1500;
  const pomodoroBreakSecs = item.timerPomodoroBreakSecs ?? 300;
  const pomodoroLongBreakSecs = item.timerPomodoroLongBreakSecs ?? 900;
  const cyclesBeforeLong = item.timerPomodoroCyclesBeforeLongBreak ?? 4;

  // Store-backed runtime state — shared across collapsed + expanded instances
  const storeRunning = item.timerRunning ?? false;
  const startEpoch = item.timerStartEpoch;
  const baseRemaining = item.timerRemainingSecs ?? (pomodoroEnabled ? pomodoroWorkSecs : total);
  const baseElapsed = item.timerElapsedSecs ?? 0;
  const phase = (item.timerPhase ?? "work") as "work" | "break" | "long-break";
  const displayCycles = item.timerDisplayCycles ?? 0;

  // Compute current time from epoch — no per-tick store writes needed
  const sinceStart = (storeRunning && startEpoch) ? Math.max(0, Math.floor((Date.now() - startEpoch) / 1000)) : 0;
  const remaining = Math.max(0, baseRemaining - sinceStart);
  const elapsed = baseElapsed + sinceStart;

  // Local UI-only state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [, setTick] = useState(0);
  const [now, setNow] = useState(new Date());
  const [hovered, setHovered] = useState(false);
  const [completed, setCompleted] = useState(false);
  const prevTotalRef = useRef(total);
  const prevPomoRef = useRef(pomodoroEnabled);

  const advancePhase = useCallback(() => {
    const newCycles = phase === "work" ? displayCycles + 1 : displayCycles;
    const nextPhase: "work" | "break" | "long-break" = phase === "work"
      ? (newCycles % cyclesBeforeLong === 0 ? "long-break" : "break")
      : "work";
    const nextSecs = nextPhase === "work" ? pomodoroWorkSecs
      : nextPhase === "long-break" ? pomodoroLongBreakSecs
      : pomodoroBreakSecs;
    upd({ timerRunning: true, timerPhase: nextPhase, timerDisplayCycles: newCycles, timerRemainingSecs: nextSecs, timerStartEpoch: Date.now(), timerElapsedSecs: 0 });
  }, [phase, displayCycles, cyclesBeforeLong, pomodoroWorkSecs, pomodoroBreakSecs, pomodoroLongBreakSecs, upd]);

  const toggleRunning = useCallback(() => {
    if (storeRunning) {
      upd({ timerRunning: false, timerRemainingSecs: remaining, timerElapsedSecs: elapsed });
    } else {
      upd({ timerRunning: true, timerStartEpoch: Date.now(), timerRemainingSecs: remaining, timerElapsedSecs: elapsed });
    }
  }, [storeRunning, remaining, elapsed, upd]);

  // Tick interval — just re-renders, does not mutate state
  useEffect(() => {
    if (mode === "clock") {
      const id = setInterval(() => { setNow(new Date()); setTick((t) => t + 1); }, 1000);
      return () => clearInterval(id);
    }
    if (!storeRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [storeRunning, mode]);

  // Stop detection — when countdown hits 0
  useEffect(() => {
    if (!storeRunning || mode !== "countdown" || remaining > 0) return;
    if (pomodoroEnabled) {
      advancePhase();
    } else {
      upd({ timerRunning: false, timerRemainingSecs: 0 });
      setCompleted(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, storeRunning, mode, pomodoroEnabled]);

  // Completed glow clear
  useEffect(() => {
    if (!completed) return;
    const t = setTimeout(() => setCompleted(false), 1800);
    return () => clearTimeout(t);
  }, [completed]);

  // Pomodoro toggle — reset (skip mount fire)
  useEffect(() => {
    if (prevPomoRef.current === pomodoroEnabled) return;
    prevPomoRef.current = pomodoroEnabled;
    if (pomodoroEnabled) {
      upd({ timerRunning: false, timerPhase: "work", timerRemainingSecs: pomodoroWorkSecs, timerDisplayCycles: 0, timerStartEpoch: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoroEnabled, pomodoroWorkSecs]);

  // Total duration change — reset (skip mount fire)
  useEffect(() => {
    if (prevTotalRef.current === total) return;
    prevTotalRef.current = total;
    if (!pomodoroEnabled) {
      upd({ timerRunning: false, timerRemainingSecs: total, timerElapsedSecs: 0, timerStartEpoch: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pomodoroEnabled]);

  const fmtSecs = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const running = storeRunning;

  const effectiveTotal = pomodoroEnabled
    ? (phase === "work" ? pomodoroWorkSecs : phase === "long-break" ? pomodoroLongBreakSecs : pomodoroBreakSecs)
    : total;

  let displayTime = "";
  let progress = 1;

  if (mode === "clock") {
    const use24 = item.timerFormat24h;
    const showSec = item.timerShowSeconds !== false;
    const h = use24 ? now.getHours().toString().padStart(2, "0") : ((now.getHours() % 12) || 12).toString().padStart(2, "0");
    const m = now.getMinutes().toString().padStart(2, "0");
    const s = now.getSeconds().toString().padStart(2, "0");
    displayTime = showSec ? `${h}:${m}:${s}` : `${h}:${m}`;
    if (!use24) displayTime += now.getHours() >= 12 ? " PM" : " AM";
    progress = 1;
  } else if (mode === "countdown") {
    displayTime = fmtSecs(remaining);
    progress = effectiveTotal > 0 ? remaining / effectiveTotal : 0;
  } else {
    displayTime = fmtSecs(elapsed);
    progress = 1;
  }

  const dateStr = mode === "clock" && item.timerShowDate
    ? now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : null;

  const label = item.timerLabel?.trim();

  const handleReset = () => {
    if (pomodoroEnabled) {
      upd({ timerRunning: false, timerPhase: "work", timerRemainingSecs: pomodoroWorkSecs, timerDisplayCycles: 0, timerStartEpoch: undefined, timerElapsedSecs: 0 });
    } else {
      upd({ timerRunning: false, timerRemainingSecs: total, timerElapsedSecs: 0, timerStartEpoch: undefined });
    }
  };

  if (collapsed) {
    const collapsedFontSize = containerH ? Math.max(10, Math.round(containerH * 0.44)) : 18;
    const btnSize = Math.max(10, Math.round(collapsedFontSize * 0.7));
    return (
      <div className="flex items-center gap-2 w-full h-full px-2 overflow-hidden">
        {pomodoroEnabled && <span className="font-medium shrink-0 px-1 py-0.5 rounded" style={{ fontSize: Math.max(8, collapsedFontSize * 0.6), background: accent + "25", color: accent }}>{PHASE_LABELS[phase]}</span>}
        <span className="font-mono font-bold shrink-0" style={{ fontSize: collapsedFontSize, color: accent }}>{displayTime}</span>
        {label && <span className="truncate" style={{ fontSize: Math.max(9, collapsedFontSize * 0.65), color: "var(--text-muted)" }}>{label}</span>}
        {mode !== "clock" && (
          <button onClick={(e) => { e.stopPropagation(); toggleRunning(); }} className="ml-auto rounded-full p-1 shrink-0 transition-colors" style={{ color: accent, background: accent + "20" }}>
            {running ? <Pause size={btnSize} /> : <Play size={btnSize} />}
          </button>
        )}
      </div>
    );
  }

  const bw = item.timerBorderWidth ?? 0;
  const bc = item.timerBorderColor ?? "var(--accent)";
  const br = item.timerBorderRadius ?? 0;
  const bs = item.timerBorderStyle ?? "solid";
  const borderStyle = bw > 0
    ? bs === "glow"
      ? { borderRadius: br, boxShadow: `0 0 ${bw * 3}px ${bw}px ${bc}` }
      : { border: `${bw}px ${bs} ${bc}`, borderRadius: br }
    : { borderRadius: br };

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-3 select-none overflow-hidden"
      style={borderStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Background color layer */}
      {item.timerBgColor && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundColor: item.timerBgColor,
          borderRadius: br,
          opacity: (item.timerBgOpacity ?? 100) / 100,
          pointerEvents: "none",
        }} />
      )}

      {/* Background image layer */}
      {item.timerBgImage && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `url(${item.timerBgImage})`,
          backgroundSize: item.timerBgImageSize ?? "cover",
          backgroundPosition: "center",
          borderRadius: br,
          opacity: (item.timerBgImageOpacity ?? 80) / 100,
          pointerEvents: "none",
        }} />
      )}

      {/* ── Background-fill progress layer (zIndex 1, between bg and content) ── */}
      {(() => {
        const ps = item.timerProgressStyle ?? "bar";
        const dir = item.timerProgressDir ?? "btt";
        const pc = item.timerProgressColor ?? accent;
        const pct = progress * 100;
        if (mode !== "countdown" || ps === "none" || ps === "bar" || ps === "thick-bar" || ps === "ring") return null;

        if (ps === "bg-fill") {
          // Accent-tinted fill that shrinks as time runs out
          const fillStyle: React.CSSProperties = {
            position: "absolute", zIndex: 1, transition: "all 1s linear", pointerEvents: "none",
            background: pc + "40",
          };
          if (dir === "ltr")      { fillStyle.left = 0; fillStyle.top = 0; fillStyle.bottom = 0; fillStyle.width = `${pct}%`; }
          else if (dir === "rtl") { fillStyle.right = 0; fillStyle.top = 0; fillStyle.bottom = 0; fillStyle.width = `${pct}%`; }
          else if (dir === "ttb") { fillStyle.top = 0; fillStyle.left = 0; fillStyle.right = 0; fillStyle.height = `${pct}%`; }
          else                    { fillStyle.bottom = 0; fillStyle.left = 0; fillStyle.right = 0; fillStyle.height = `${pct}%`; }
          return (
            <div style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "hidden", borderRadius: br, pointerEvents: "none" }}>
              <div style={fillStyle} />
            </div>
          );
        }

        if (ps === "bg-dim") {
          // Uniform dark-grey overlay that intensifies as time runs out (1-progress)
          const alpha = (1 - progress) * 0.78;
          return (
            <div style={{
              position: "absolute", inset: 0, zIndex: 1, borderRadius: br, pointerEvents: "none",
              background: `rgba(30,30,30,${alpha.toFixed(3)})`,
              transition: "background 1s linear",
            }} />
          );
        }

        if (ps === "bg-sweep") {
          // A grey "curtain" sweeps from the expired side — sharp edge between fresh and expired
          const expiredStyle: React.CSSProperties = {
            position: "absolute", zIndex: 1, transition: "all 1s linear", pointerEvents: "none",
            background: "rgba(30,30,30,0.65)",
            backdropFilter: "grayscale(1) brightness(0.55)",
            WebkitBackdropFilter: "grayscale(1) brightness(0.55)",
          };
          if (dir === "ltr")      { expiredStyle.left = `${pct}%`; expiredStyle.top = 0; expiredStyle.bottom = 0; expiredStyle.right = 0; }
          else if (dir === "rtl") { expiredStyle.right = `${pct}%`; expiredStyle.top = 0; expiredStyle.bottom = 0; expiredStyle.left = 0; }
          else if (dir === "ttb") { expiredStyle.top = `${pct}%`; expiredStyle.left = 0; expiredStyle.right = 0; expiredStyle.bottom = 0; }
          else                    { expiredStyle.bottom = `${pct}%`; expiredStyle.left = 0; expiredStyle.right = 0; expiredStyle.top = 0; }
          return (
            <div style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "hidden", borderRadius: br, pointerEvents: "none" }}>
              <div style={expiredStyle} />
            </div>
          );
        }

        return null;
      })()}

      {/* Ring progress (SVG, sits above bg layers, below content) */}
      {mode === "countdown" && (item.timerProgressStyle ?? "bar") === "ring" && (() => {
        const pc = item.timerProgressColor ?? accent;
        const r = 46;
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - progress);
        return (
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}
            viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
          >
            <circle cx="50" cy="50" r={r} fill="none" stroke={pc + "28"} strokeWidth="4" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={pc} strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
        );
      })()}

      {/* Content above bg */}
      <div className="relative z-10 flex flex-col items-center gap-3 w-full px-4">

        {/* Pomodoro phase + cycle dots */}
        {pomodoroEnabled && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full"
              style={{ background: accent + "25", color: accent }}>
              {PHASE_LABELS[phase]}
            </span>
            <div className="flex items-center gap-1">
              {Array.from({ length: cyclesBeforeLong }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full transition-colors"
                  style={{ background: i < (displayCycles % cyclesBeforeLong) ? accent : accent + "30" }} />
              ))}
            </div>
          </div>
        )}

        {/* Label above */}
        {showLabel && label && labelPos === "top" && (
          <span className="text-xs font-medium tracking-wide" style={{ color: fontColor + "70" }}>{label}</span>
        )}

        {/* Number */}
        <span
          className="font-mono tabular-nums leading-none transition-all duration-300"
          style={{
            fontSize, color: fontColor, fontFamily: fontFamily || undefined, fontWeight: bold ? 700 : 400,
            ...(completed ? { textShadow: `0 0 16px ${accent}, 0 0 32px ${accent}88`, color: accent } : {}),
          }}
        >
          {displayTime}
        </span>

        {/* Progress bar — bar / thick-bar styles only */}
        {mode === "countdown" && (() => {
          const ps = item.timerProgressStyle ?? "bar";
          const pc = item.timerProgressColor ?? accent;
          if (ps === "bar") return (
            <div className="w-full max-w-[180px] h-1 rounded-full overflow-hidden" style={{ background: pc + "25" }}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress * 100}%`, background: pc }} />
            </div>
          );
          if (ps === "thick-bar") return (
            <div className="w-full h-3 rounded-lg overflow-hidden" style={{ background: pc + "25" }}>
              <div className="h-full rounded-lg transition-all duration-1000" style={{ width: `${progress * 100}%`, background: pc }} />
            </div>
          );
          return null;
        })()}

        {/* Date (clock only) */}
        {dateStr && <span className="text-xs" style={{ color: fontColor + "60" }}>{dateStr}</span>}

        {/* Label below */}
        {showLabel && label && labelPos === "bottom" && (
          <span className="text-xs font-medium tracking-wide" style={{ color: fontColor + "70" }}>{label}</span>
        )}

        {/* Controls — always visible, full opacity on hover or while running */}
        {mode !== "clock" && (
          <div
            className="flex items-center gap-2 transition-opacity duration-200"
            style={{ opacity: hovered || running ? 1 : 0.3 }}
          >
            <button
              onMouseDown={(e) => { e.stopPropagation(); toggleRunning(); }}
              title={running ? "Pause" : "Start"}
              className="rounded-full p-2.5 transition-colors"
              style={{ background: accent, color: "#fff" }}
            >
              {running ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              onMouseDown={(e) => { e.stopPropagation(); handleReset(); }}
              title="Reset"
              className="rounded-full p-2 transition-colors"
              style={{ background: "var(--surface-overlay)", color: "var(--text-muted)" }}
            >
              <RotateCcw size={13} />
            </button>
            {item.timerCollabEnabled && (
              <span className="rounded-full p-2" title="Synced" style={{ color: accent }}>
                <Radio size={13} />
              </span>
            )}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            ...(mode !== "clock" ? [
              { label: running ? "Pause" : "Start", icon: running ? <Pause size={14} /> : <Play size={14} />, onClick: toggleRunning },
              { label: "Reset", icon: <RotateCcw size={14} />, onClick: handleReset },
            ] : []),
          ]}
        />
      )}
    </div>
  );
}

// ─── Timer Style Panel ────────────────────────────────────────────────────────

// Module-level so its identity is stable — a panel-local component would remount
// its <input> on every onChange re-render, killing in-progress slider drags.
function SliderRow({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[var(--text-muted)] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
      <span className="w-8 text-right tabular-nums text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

export function TimerStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const mode = item.timerMode ?? "countdown";
  const total = item.timerSeconds ?? 300;
  const [openPicker, setOpenPicker] = useState<"font" | "accent" | "bg" | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const totalH = Math.floor(total / 3600);
  const totalM = Math.floor((total % 3600) / 60);
  const totalS = total % 60;

  const setDuration = (h: number, m: number, s: number) => {
    upd({ timerSeconds: Math.max(1, h * 3600 + m * 60 + s) });
  };

  const PLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</p>
  );

  const ToggleGroup = ({ options, value, onChange }: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) => (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md py-1 text-[11px] font-medium transition-colors",
            value === o.value
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const accent = item.timerAccentColor ?? "#d59ee8";

  return (
    <div className="flex flex-col gap-5 p-3 text-xs">

      {/* Quick presets */}
      <section>
        <PLabel>Quick Presets</PLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {TIMER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => upd({
                timerMode: "countdown",
                timerSeconds: p.workSecs,
                timerLabel: p.label,
                timerPomodoroEnabled: p.pomodoro,
                timerPomodoroWorkSecs: p.workSecs,
                timerPomodoroBreakSecs: p.breakSecs,
                timerPomodoroLongBreakSecs: p.longBreakSecs,
                timerPomodoroCyclesBeforeLongBreak: p.cycles,
              })}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-2 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)] transition-colors text-left"
            >
              <span className="block font-semibold text-[var(--text-primary)]">{p.label}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {Math.floor(p.workSecs/60)}m work · {Math.floor(p.breakSecs/60)}m break
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Mode */}
      <section>
        <PLabel>Mode</PLabel>
        <ToggleGroup
          options={[{ label: "Countdown", value: "countdown" }, { label: "Stopwatch", value: "stopwatch" }, { label: "Clock", value: "clock" }]}
          value={mode}
          onChange={(v) => upd({ timerMode: v as BlockItem["timerMode"] })}
        />
      </section>

      {/* Pomodoro cycle (countdown only) */}
      {mode === "countdown" && (
        <section>
          <PLabel>Cycle mode</PLabel>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={!!item.timerPomodoroEnabled}
              onChange={(e) => upd({ timerPomodoroEnabled: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            <span className="text-[var(--text-secondary)]">Auto-cycle work / break</span>
          </label>
          {item.timerPomodoroEnabled && (
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center pl-1">
              {([
                { label: "Work",       totalSecs: item.timerPomodoroWorkSecs ?? 1500,  onChangeSecs: (s: number) => upd({ timerPomodoroWorkSecs: s, timerSeconds: s }) },
                { label: "Break",      totalSecs: item.timerPomodoroBreakSecs ?? 300,  onChangeSecs: (s: number) => upd({ timerPomodoroBreakSecs: s }) },
                { label: "Long break", totalSecs: item.timerPomodoroLongBreakSecs ?? 900, onChangeSecs: (s: number) => upd({ timerPomodoroLongBreakSecs: s }) },
              ]).map(({ label, totalSecs, onChangeSecs }) => {
                const m = Math.floor(totalSecs / 60);
                const s = totalSecs % 60;
                return (
                  <>
                    <span key={label + "-l"} className="text-[var(--text-muted)]">{label}</span>
                    <div key={label + "-i"} className="flex items-center gap-1">
                      <input type="number" min={0} value={m}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0) onChangeSecs(Math.max(1, n * 60 + s)); }}
                        className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                      />
                      <span className="text-[var(--text-muted)] text-[11px]">m</span>
                      <input type="number" min={0} max={59} value={s}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0 && n <= 59) onChangeSecs(Math.max(1, m * 60 + n)); }}
                        className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                      />
                      <span className="text-[var(--text-muted)] text-[11px]">s</span>
                    </div>
                  </>
                );
              })}
              <span className="text-[var(--text-muted)]">Cycles</span>
              <input type="number" min={1} value={item.timerPomodoroCyclesBeforeLongBreak ?? 4}
                onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) upd({ timerPomodoroCyclesBeforeLongBreak: n }); }}
                className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          )}
        </section>
      )}

      {/* Collaboration sync */}
      <section>
        <PLabel>Collaboration</PLabel>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!item.timerCollabEnabled}
            onChange={(e) => upd({ timerCollabEnabled: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-[var(--text-secondary)]">Sync timer across session</span>
        </label>
        {item.timerCollabEnabled && (
          <p className="mt-1 text-[11px] text-[var(--text-muted)] pl-5">
            Connect Supabase to enable real-time sync.
          </p>
        )}
      </section>

      {/* Duration (countdown only) */}
      {mode === "countdown" && !item.timerPomodoroEnabled && (
        <section>
          <PLabel>Duration</PLabel>
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} value={totalH}
              onChange={(e) => setDuration(Number(e.target.value), totalM, totalS)}
              className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none"
            />
            <span className="text-[var(--text-muted)]">h</span>
            <input type="number" min={0} max={59} value={totalM}
              onChange={(e) => setDuration(totalH, Number(e.target.value), totalS)}
              className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none"
            />
            <span className="text-[var(--text-muted)]">m</span>
            <input type="number" min={0} max={59} value={totalS}
              onChange={(e) => setDuration(totalH, totalM, Number(e.target.value))}
              className="w-12 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)] outline-none"
            />
            <span className="text-[var(--text-muted)]">s</span>
          </div>
        </section>
      )}

      {/* Clock options */}
      {mode === "clock" && (
        <section>
          <PLabel>Clock format</PLabel>
          <div className="flex flex-col gap-2">
            <ToggleGroup
              options={[{ label: "12 h", value: "12" }, { label: "24 h", value: "24" }]}
              value={item.timerFormat24h ? "24" : "12"}
              onChange={(v) => upd({ timerFormat24h: v === "24" })}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={item.timerShowSeconds !== false} onChange={(e) => upd({ timerShowSeconds: e.target.checked })} className="accent-[var(--accent)]" />
              <span className="text-[var(--text-secondary)]">Show seconds</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!item.timerShowDate} onChange={(e) => upd({ timerShowDate: e.target.checked })} className="accent-[var(--accent)]" />
              <span className="text-[var(--text-secondary)]">Show date</span>
            </label>
          </div>
        </section>
      )}

      {/* Label */}
      <section>
        <PLabel>Label</PLabel>
        <input
          className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Label text…"
          value={item.timerLabel ?? ""}
          onChange={(e) => upd({ timerLabel: e.target.value })}
        />
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.timerShowLabel !== false} onChange={(e) => upd({ timerShowLabel: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Show label</span>
          </label>
          <ToggleGroup
            options={[{ label: "Above", value: "top" }, { label: "Below", value: "bottom" }]}
            value={item.timerLabelPosition ?? "bottom"}
            onChange={(v) => upd({ timerLabelPosition: v as "top" | "bottom" })}
          />
        </div>
      </section>

      {/* Progress indicator */}
      {mode !== "clock" && (
        <section>
          <PLabel>Progress indicator</PLabel>
          <div className="flex flex-col gap-2">
            {/* Style grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: "bar",      label: "Bar",        desc: "Thin bar below time" },
                { id: "thick-bar",label: "Thick bar",  desc: "Tall bar below time" },
                { id: "ring",     label: "Ring",       desc: "Circular ring border" },
                { id: "bg-fill",  label: "BG fill",    desc: "Accent tint sweeps background" },
                { id: "bg-dim",   label: "BG dim",     desc: "Background fades to grey" },
                { id: "bg-sweep", label: "BG sweep",   desc: "Grey curtain over expired portion" },
                { id: "none",     label: "None",       desc: "No progress indicator" },
              ] as { id: string; label: string; desc: string }[]).map((opt) => {
                const active = (item.timerProgressStyle ?? "bar") === opt.id;
                return (
                  <button key={opt.id}
                    onClick={() => upd({ timerProgressStyle: opt.id as BlockItem["timerProgressStyle"] })}
                    title={opt.desc}
                    className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center transition-all",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}>
                    <span className="text-[11px] font-medium leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Direction picker (for bg-fill and bg-sweep) */}
            {(item.timerProgressStyle === "bg-fill" || item.timerProgressStyle === "bg-sweep") && (
              <div>
                <p className="text-[11px] text-[var(--text-muted)] mb-1">Direction</p>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    { id: "ltr", label: "→" },
                    { id: "rtl", label: "←" },
                    { id: "ttb", label: "↓" },
                    { id: "btt", label: "↑" },
                  ] as { id: string; label: string }[]).map((d) => {
                    const active = (item.timerProgressDir ?? "btt") === d.id;
                    return (
                      <button key={d.id}
                        onClick={() => upd({ timerProgressDir: d.id as BlockItem["timerProgressDir"] })}
                        className={cn("rounded py-1.5 text-sm font-bold transition-colors",
                          active ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        )}>{d.label}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progress color override */}
            {(item.timerProgressStyle ?? "bar") !== "none" && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] shrink-0 text-[11px]">Color</span>
                <label className="relative h-5 w-5 rounded border border-[var(--border)] overflow-hidden cursor-pointer flex-shrink-0">
                  <span className="absolute inset-0 rounded" style={{ background: item.timerProgressColor ?? (item.timerAccentColor ?? "#d59ee8") }} />
                  <input type="color"
                    value={item.timerProgressColor ?? (item.timerAccentColor ?? "#d59ee8")}
                    onChange={(e) => upd({ timerProgressColor: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                {item.timerProgressColor && (
                  <button onClick={() => upd({ timerProgressColor: undefined })} className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">reset</button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Accent color */}
      <section>
        <PLabel>Accent color</PLabel>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenPicker((v) => v === "accent" ? null : "accent")}
            className="h-6 w-6 rounded border border-[var(--border)] shadow-sm"
            style={{ background: accent }}
          />
          <span className="text-[var(--text-muted)]">{accent}</span>
        </div>
        {openPicker === "accent" && (
          <div className="mt-2">
            <input type="color" value={accent} onChange={(e) => upd({ timerAccentColor: e.target.value })} className="h-8 w-full cursor-pointer rounded border-0 bg-transparent" />
          </div>
        )}
      </section>

      {/* Font */}
      <section>
        <PLabel>Font color</PLabel>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenPicker((v) => v === "font" ? null : "font")}
            className="h-6 w-6 rounded border border-[var(--border)] shadow-sm"
            style={{ background: item.timerFontColor ?? "#f2f2f2" }}
          />
          <span className="text-[var(--text-muted)]">{item.timerFontColor ?? "default"}</span>
        </div>
        {openPicker === "font" && (
          <div className="mt-2">
            <input type="color" value={item.timerFontColor ?? "#f2f2f2"} onChange={(e) => upd({ timerFontColor: e.target.value })} className="h-8 w-full cursor-pointer rounded border-0 bg-transparent" />
          </div>
        )}
      </section>

      {/* Typography */}
      <section>
        <PLabel>Typography</PLabel>
        <div className="flex flex-col gap-2">
          <SliderRow label="Size" value={item.timerFontSize ?? 48} min={20} max={120} onChange={(v) => upd({ timerFontSize: v })} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.timerBold !== false} onChange={(e) => upd({ timerBold: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Bold</span>
          </label>
          <div className="mt-1">
            <FontPicker value={item.timerFontFamily ?? ""} onChange={(f) => upd({ timerFontFamily: f || undefined })} />
          </div>
        </div>
      </section>

      {/* Shape */}
      <section>
        <PLabel>Shape</PLabel>
        <SliderRow label="Corners" value={item.timerBorderRadius ?? 0} min={0} max={40} onChange={(v) => upd({ timerBorderRadius: v })} />
      </section>

      {/* Border */}
      <section>
        <PLabel>Border</PLabel>
        <div className="flex flex-col gap-2">
          <SliderRow label="Width" value={item.timerBorderWidth ?? 0} min={0} max={8} onChange={(v) => upd({ timerBorderWidth: v })} />
          {(item.timerBorderWidth ?? 0) > 0 && (
            <>
              <div className="flex gap-1">
                {(["solid","dashed","dotted","glow"] as const).map((s) => (
                  <button key={s} onClick={() => upd({ timerBorderStyle: s })}
                    className={cn("flex-1 rounded py-1 text-[11px] capitalize transition-colors",
                      (item.timerBorderStyle ?? "solid") === s
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}>
                    {s}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                <div className="flex items-center gap-2">
                  <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.timerBorderColor ?? "#d59ee8" }}>
                    <input type="color" value={item.timerBorderColor ?? "#d59ee8"} onChange={(e) => upd({ timerBorderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">Border color</span>
                </div>
              </label>
            </>
          )}
        </div>
      </section>

      {/* Background */}
      <section>
        <PLabel>Background</PLabel>
        <div className="flex flex-col gap-2">
          {/* Color */}
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.timerBgColor ?? "transparent" }}>
                <input type="color" value={item.timerBgColor ?? "#1a1b1e"} onChange={(e) => upd({ timerBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-xs text-[var(--text-secondary)]">Background color</span>
            </div>
            {item.timerBgColor && (
              <button onClick={(e) => { e.stopPropagation(); upd({ timerBgColor: undefined }); }} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>
            )}
          </label>
          {item.timerBgColor && (
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[var(--text-muted)]">Opacity</span>
              <input type="range" min={0} max={100} value={item.timerBgOpacity ?? 100}
                onChange={(e) => upd({ timerBgOpacity: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)]" />
              <span className="w-8 text-right tabular-nums text-[var(--text-secondary)]">{item.timerBgOpacity ?? 100}%</span>
            </div>
          )}

          {/* Image */}
          <div>
            <div className="flex gap-1.5">
              <input
                className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Image URL…"
                value={item.timerBgImage?.startsWith("data:") ? "" : (item.timerBgImage ?? "")}
                onChange={(e) => upd({ timerBgImage: e.target.value || undefined })}
              />
              <label className="flex items-center justify-center gap-1 cursor-pointer rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors flex-shrink-0">
                <Upload size={10} />
                <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  applyImageUpload(file, (url) => upd({ timerBgImage: url }));
                  e.target.value = "";
                }} />
              </label>
              {item.timerBgImage && (
                <button onClick={() => upd({ timerBgImage: undefined })} className="flex-shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors px-1"><XIcon size={11} /></button>
              )}
            </div>
            {item.timerBgImage?.startsWith("data:") && (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Local file uploaded</p>
            )}
          </div>

          {/* Image options */}
          {item.timerBgImage && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Opacity</span>
                <span className="text-[var(--text-muted)] font-mono">{item.timerBgImageOpacity ?? 80}%</span>
              </div>
              <input type="range" min={5} max={100} value={item.timerBgImageOpacity ?? 80}
                onChange={(e) => upd({ timerBgImageOpacity: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]" />
              <div className="flex gap-1">
                {(["cover", "contain", "fill"] as const).map((s) => (
                  <button key={s} onClick={() => upd({ timerBgImageSize: s })}
                    className={cn("flex-1 rounded py-1 text-[11px] capitalize transition-colors",
                      (item.timerBgImageSize ?? "cover") === s
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>


    </div>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

/** Upload to Supabase storage; fall back to an inline data URL in guest/local mode. */
async function readImageToUrl(file: File, userId: string): Promise<string> {
  const uploaded = await uploadFile(file, userId, "images");
  if (uploaded) return uploaded;
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.readAsDataURL(file);
  });
}

function ImageItem({ item, upd, collapsed, isFinished }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean }) {
  const { identity } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    upd({ imageUrl: await readImageToUrl(file, identity.userId) });
    setUploading(false);
  };

  const fit = item.imageFit ?? item.imageObjectFit ?? "cover";
  const frame: React.CSSProperties = {
    borderRadius: item.imageBorderRadius ?? 8,
    border: (item.imageBorderWidth ?? 0) > 0 ? `${item.imageBorderWidth}px solid ${item.imageBorderColor || "var(--border)"}` : undefined,
  };

  if (!item.imageUrl) {
    if (collapsed) {
      return <div className="flex h-full items-center justify-center opacity-30"><ImageIcon size={20} /></div>;
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-4 text-[var(--text-muted)]">
        <ImageIcon size={24} />
        {!isFinished && <>
          <input
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none text-center placeholder:text-[var(--text-muted)]"
            placeholder="Paste image URL…"
            onBlur={(e) => { if (e.target.value) upd({ imageUrl: e.target.value }); }}
          />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            <Upload size={14} /> {uploading ? "Uploading…" : "Upload from file"}
          </button>
        </>}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: item.imageBorderRadius ?? 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.imageCaption ?? ""} className="h-full w-full" style={{ objectFit: fit, ...frame }} />
      {item.imageCaption && (
        <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">{item.imageCaption}</div>
      )}
    </div>
  );
}

export function ImageStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const { identity } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const fit = item.imageFit ?? item.imageObjectFit ?? "cover";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    upd({ imageUrl: await readImageToUrl(file, identity.userId) });
    setUploading(false);
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Source</p>
        <input
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Image URL…"
          value={item.imageUrl?.startsWith("data:") ? "" : (item.imageUrl ?? "")}
          onChange={(e) => upd({ imageUrl: e.target.value || undefined })}
        />
        <div className="flex gap-1.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50">
            <Upload size={11} /> {uploading ? "Uploading…" : item.imageUrl ? "Replace" : "Upload"}
          </button>
          {item.imageUrl && (
            <button onClick={() => upd({ imageUrl: "" })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] transition-colors hover:text-red-400">Clear</button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Fit</p>
        <div className="flex gap-1">
          {(["cover", "contain", "fill"] as const).map((f) => (
            <button key={f} onClick={() => upd({ imageFit: f })}
              className={cn("flex-1 rounded border px-2 py-1.5 capitalize transition-colors", fit === f ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]")}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Frame</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <span className="w-14 text-[var(--text-muted)]">Radius</span>
            <input type="range" min={0} max={32} value={item.imageBorderRadius ?? 8} onChange={(e) => upd({ imageBorderRadius: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
            <span className="w-6 text-right tabular-nums text-[var(--text-muted)]">{item.imageBorderRadius ?? 8}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-14 text-[var(--text-muted)]">Border</span>
            <input type="range" min={0} max={8} value={item.imageBorderWidth ?? 0} onChange={(e) => upd({ imageBorderWidth: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
            <span className="w-6 text-right tabular-nums text-[var(--text-muted)]">{item.imageBorderWidth ?? 0}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 transition-colors hover:border-[var(--text-muted)]">
            <span className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded border border-white/15" style={{ backgroundColor: item.imageBorderColor || "#2a2b31" }}>
              <input type="color" value={item.imageBorderColor || "#2a2b31"} onChange={(e) => upd({ imageBorderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </span>
            <span className="flex-1 text-[var(--text-secondary)]">Border color</span>
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Caption</p>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Optional caption…"
          value={item.imageCaption ?? ""}
          onChange={(e) => upd({ imageCaption: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

// ─── Graph ────────────────────────────────────────────────────────────────────

const GRAPH_TYPES: { id: BlockItem["graphType"]; label: string; icon: string }[] = [
  { id: "bar",          label: "Bar",          icon: "▊▋▌" },
  { id: "bar-h",        label: "Row",          icon: "▬▬▬" },
  { id: "bar-stacked",  label: "Stacked Bar",  icon: "▊▊▊" },
  { id: "line",         label: "Line",         icon: "╱‾╲" },
  { id: "multiline",    label: "Multi-line",   icon: "≈≈≈" },
  { id: "area",         label: "Area",         icon: "◣◣◣" },
  { id: "area-stacked", label: "Stacked Area", icon: "◢◣◤" },
  { id: "pie",          label: "Pie",          icon: "◕" },
  { id: "donut",        label: "Donut",        icon: "◎" },
  { id: "scatter",      label: "Scatter",      icon: "∴∵∷" },
  { id: "radar",        label: "Radar",        icon: "⬡" },
];

const DEFAULT_GRAPH_DATA: GraphPoint[] = [
  { label: "Jan", value: 40, value2: 24 },
  { label: "Feb", value: 65, value2: 38 },
  { label: "Mar", value: 30, value2: 55 },
  { label: "Apr", value: 80, value2: 41 },
  { label: "May", value: 55, value2: 62 },
];

const TT_STYLE = { background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 };
const AXIS_TICK = { fill: "var(--text-muted)", fontSize: 10 };

function resolveGraphValue(val: string | number): number {
  if (typeof val === "number") return val;
  const str = String(val).trim();
  const n = Number(str);
  if (!isNaN(n) && str !== "") return n;
  try {
    if (!/^[\d\s+\-*/%.(),]+$/.test(str)) return NaN;
    // eslint-disable-next-line no-new-func
    return Number(Function(`"use strict"; return (${str})`)());
  } catch { return NaN; }
}

function GraphItem({ item, collapsed, containerW, containerH, boardId, boxId, extraContextItems }: { item: BlockItem; collapsed?: boolean; containerW?: number; containerH?: number; boardId?: string; boxId?: string; extraContextItems?: ContextMenuEntry[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.offsetWidth || el.getBoundingClientRect().width, h: el.offsetHeight || el.getBoundingClientRect().height });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Also update if container props change (card resize via drag)
  useEffect(() => { if (wrapRef.current) setDims({ w: wrapRef.current.offsetWidth, h: wrapRef.current.offsetHeight }); }, [containerW, containerH]);

  const data = item.graphData ?? DEFAULT_GRAPH_DATA;
  const type = item.graphType ?? "bar";
  const colors = item.graphColors ?? CHART_COLORS;
  const seriesKeys = item.graphSeriesKeys ?? ["value"];
  const showGrid = item.graphShowGrid ?? true;
  const showLegend = item.graphShowLegend ?? false;
  const curve = (item.graphSmooth ?? true) ? "monotone" : "linear";
  const fontFamily = item.graphFontFamily;
  const fontSize = item.graphFontSize ?? 10;
  const fontColor = item.graphFontColor;
  const barRadius = item.graphBarRadius ?? 3;
  const strokeWidth = item.graphStrokeWidth ?? 2;


  // If connected to a table, derive data reactively using subscribe (not useMemo+getState)
  // to avoid the re-render loop that crashed the app before.
  const [tableDerived, setTableDerived] = useState<{ data: GraphPoint[]; seriesKeys: string[] } | null>(null);
  useEffect(() => {
    if (!item.graphTableSourceItemId || !boardId) { setTableDerived(null); return; }
    const compute = () => {
      const state = useBoardStore.getState();
      const board = state.boards.find((b) => b.id === boardId) ?? state.serverBoards[boardId];
      if (!board) { setTableDerived(null); return; }
      const source: BlockItem | undefined = boxId
        ? board.boxes.find((b) => b.id === boxId)?.items.find((i) => i.id === item.graphTableSourceItemId)
        : (board.boardItems ?? []).find((i) => i.id === item.graphTableSourceItemId) as BlockItem | undefined;
      if (!source) { setTableDerived(null); return; }
      const cols: TableColumn[] = source.tableColumns ?? [];
      const rows: TableRow[] = source.tableRows ?? [];
      const nonCheckCols = cols.filter((c) => c.type !== "checkbox");
      const labelColId = item.graphTableLabelColId ?? nonCheckCols[0]?.id;
      const valueColIds = item.graphTableValueColIds?.length ? item.graphTableValueColIds : nonCheckCols.slice(1).map((c) => c.id);
      if (!labelColId || valueColIds.length === 0) { setTableDerived(null); return; }
      const sKeys = valueColIds.map((id) => cols.find((c) => c.id === id)?.name ?? id);
      const points = rows.map((r) => {
        const pt: GraphPoint = { label: String(r.cells[labelColId] ?? "") };
        valueColIds.forEach((colId, idx) => { pt[sKeys[idx]] = Number(r.cells[colId] ?? 0) || 0; });
        return pt;
      });
      setTableDerived({ data: points, seriesKeys: sKeys });
    };
    compute();
    return useBoardStore.subscribe(compute);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.graphTableSourceItemId, item.graphTableLabelColId, (item.graphTableValueColIds ?? []).join(","), boardId, boxId]);

  const safeData = tableDerived
    ? tableDerived.data
    : data.map((r) => {
        const row: GraphPoint = { label: r.label };
        seriesKeys.forEach((k) => { row[k] = resolveGraphValue(r[k] ?? 0); });
        return row;
      });
  const effectiveSeriesKeys = tableDerived ? tableDerived.seriesKeys : seriesKeys;

  const w = dims?.w ?? 300;
  const h = dims?.h ?? (collapsed ? 80 : 220);

  const borderRadius = item.graphBorderRadius ?? 4;
  const bgStyle: React.CSSProperties = {
    width: "100%", height: "100%", minHeight: collapsed ? 80 : 160,
    position: "relative", overflow: "hidden",
    backgroundColor: item.graphBgColor,
    borderRadius,
  };

  const title = item.graphTitle?.trim();

  return (
    <div ref={wrapRef} style={bgStyle} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {item.graphBgImage && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `url(${item.graphBgImage})`,
          backgroundSize: item.graphBgImageSize ?? "cover",
          backgroundPosition: "center",
          opacity: (item.graphBgImageOpacity ?? 80) / 100,
          pointerEvents: "none",
        }} />
      )}
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {title && !collapsed && (
          <div className="px-3 pt-2 pb-0.5 shrink-0 text-[11px] font-semibold text-[var(--text-secondary)] truncate">{title}</div>
        )}
        {dims && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChartRenderer
              type={type} data={safeData} seriesKeys={effectiveSeriesKeys} colors={colors}
              showGrid={showGrid} showLegend={showLegend} curve={curve}
              collapsed={!!collapsed} width={w} height={title && !collapsed ? h - 28 : h}
              fontFamily={fontFamily} fontSize={fontSize} fontColor={fontColor}
              barRadius={barRadius} strokeWidth={strokeWidth}
              showDataLabels={item.graphShowDataLabels}
              xAxisTitle={item.graphXAxisTitle}
              yAxisTitle={item.graphYAxisTitle}
            />
          </div>
        )}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            { label: "Copy data as JSON", icon: <Copy size={14} />, onClick: () => { navigator.clipboard.writeText(JSON.stringify(item.graphData ?? DEFAULT_GRAPH_DATA, null, 2)); } },
          ]}
        />
      )}
    </div>
  );
}

export function GraphStylePanel({ item, upd, boardId, boxId }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; boardId?: string; boxId?: string }) {
  const [tab, setTab] = useState<"type" | "data" | "style">("type");
  const data = item.graphData ?? DEFAULT_GRAPH_DATA;
  const seriesKeys = item.graphSeriesKeys ?? ["value"];

  // Columns from the linked table item — used for column mapping in table source mode
  const tableSourceCols = useMemo(() => {
    if (!item.graphTableSourceItemId || !boardId) return [] as TableColumn[];
    const state = useBoardStore.getState();
    const board = state.boards.find((b) => b.id === boardId) ?? state.serverBoards[boardId];
    if (!board) return [] as TableColumn[];
    const source = boxId
      ? board.boxes.find((b) => b.id === boxId)?.items.find((i) => i.id === item.graphTableSourceItemId)
      : (board.boardItems ?? []).find((i) => i.id === item.graphTableSourceItemId) as BlockItem | undefined;
    return ((source?.tableColumns ?? []) as TableColumn[]).filter((c) => c.type !== "checkbox");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.graphTableSourceItemId, boardId, boxId]);

  // Initialize scatter series when switching to scatter type — avoids calling upd during render
  useEffect(() => {
    if (item.graphType !== "scatter" || (item.graphSeriesKeys?.length ?? 0) >= 2) return;
    const existing = item.graphSeriesKeys ?? [];
    const toAdd = existing.length === 0 ? ["x", "Dataset 1"] : ["Dataset 1"];
    upd({ graphSeriesKeys: [...existing, ...toAdd], graphData: (item.graphData ?? DEFAULT_GRAPH_DATA).map((r) => { const n = { ...r }; toAdd.forEach((k) => { n[k] = 0; }); return n; }) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.graphType]);

  const colors = item.graphColors ?? CHART_COLORS;
  const showGrid = item.graphShowGrid ?? true;
  const showLegend = item.graphShowLegend ?? false;
  const smooth = item.graphSmooth ?? true;
  const type = item.graphType ?? "bar";

  const addRow = () => {
    const row: GraphPoint = { label: `Item ${data.length + 1}` };
    seriesKeys.forEach((k) => { row[k] = 0; });
    upd({ graphData: [...data, row] });
  };
  const updateCell = (ri: number, key: string, val: string | number) =>
    upd({ graphData: data.map((r, i) => i === ri ? { ...r, [key]: val } : r) });
  const removeRow = (ri: number) => upd({ graphData: data.filter((_, i) => i !== ri) });
  const addSeries = () => {
    const key = `value${seriesKeys.length + 1}`;
    if (seriesKeys.includes(key)) return;
    upd({ graphSeriesKeys: [...seriesKeys, key], graphData: data.map((r) => ({ ...r, [key]: 0 })) });
  };
  const removeSeries = (k: string) => {
    if (seriesKeys.length <= 1) return;
    upd({ graphSeriesKeys: seriesKeys.filter((s) => s !== k), graphData: data.map((r) => { const n = { ...r }; delete n[k]; return n; }) });
  };
  const renameSeries = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    upd({
      graphSeriesKeys: seriesKeys.map((s) => s === oldKey ? newKey : s),
      graphData: data.map((r) => { const n: GraphPoint = { label: r.label }; seriesKeys.forEach((s) => { n[s === oldKey ? newKey : s] = r[s] ?? 0; }); return n; }),
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-0.5 p-3 pb-2 shrink-0">
        {(["type","data","style"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 rounded py-1.5 text-[11px] font-medium capitalize transition-colors",
              tab === t ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}>{t}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">

        {/* ── Type ── */}
        {tab === "type" && (
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {GRAPH_TYPES.map((gt) => (
              <button key={gt.id} onClick={() => upd({ graphType: gt.id })}
                className={cn("flex flex-col items-center gap-1 rounded-lg border px-1 py-3 transition-all",
                  type === gt.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                )}>
                <span className="text-xl leading-none">{gt.icon}</span>
                <span className="text-[10px] text-center leading-tight">{gt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Data ── */}
        {tab === "data" && (
          <div className="pt-1">
            {item.graphTableSourceItemId && boardId && (
              <div className="mb-3 rounded-lg border border-[var(--border)] p-2.5 flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Table source</p>
                <p className="text-[11px] text-[var(--text-secondary)]">Live data from linked table.</p>

                {/* Column mapping */}
                {tableSourceCols.length > 0 && (
                  <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-overlay)] p-2">
                    <div>
                      <p className="text-[11px] text-[var(--text-muted)] mb-1">Label column</p>
                      <select
                        value={item.graphTableLabelColId ?? tableSourceCols[0]?.id ?? ""}
                        onChange={(e) => upd({ graphTableLabelColId: e.target.value })}
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                      >
                        {tableSourceCols.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-muted)] mb-1">Value columns</p>
                      <div className="flex flex-col gap-1">
                        {tableSourceCols
                          .filter((c) => c.id !== (item.graphTableLabelColId ?? tableSourceCols[0]?.id))
                          .map((c) => {
                            const selectedIds = item.graphTableValueColIds ?? tableSourceCols.slice(1).map((x) => x.id);
                            const checked = selectedIds.includes(c.id);
                            return (
                              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  className="accent-[var(--accent)]"
                                  onChange={(e) => {
                                    const current = item.graphTableValueColIds ?? tableSourceCols.slice(1).map((x) => x.id);
                                    upd({ graphTableValueColIds: e.target.checked ? [...current, c.id] : current.filter((id) => id !== c.id) });
                                  }}
                                />
                                <span className="text-[11px] text-[var(--text-secondary)]">{c.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    const store = useBoardStore.getState();
                    const patch = {
                      tableChartEnabled: true,
                      tableChartType: item.graphType ?? "bar",
                      tableChartColors: item.graphColors,
                      tableChartShowGrid: item.graphShowGrid ?? true,
                      tableChartShowLegend: item.graphShowLegend ?? false,
                      tableChartSmooth: item.graphSmooth ?? true,
                      tableChartStrokeWidth: item.graphStrokeWidth ?? 2,
                      tableChartBarRadius: item.graphBarRadius ?? 3,
                    };
                    if (boxId) {
                      store.updateItem(boardId, boxId, item.graphTableSourceItemId!, patch);
                      store.removeItem(boardId, boxId, item.id);
                    } else {
                      store.updateBoardItem(boardId, item.graphTableSourceItemId!, patch);
                      store.removeBoardItem(boardId, item.id);
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-left text-[11px] hover:border-[var(--accent)]/50 transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >Merge back into table</button>
                <button
                  onClick={() => upd({ graphTableSourceItemId: undefined, graphTableLabelColId: undefined, graphTableValueColIds: undefined })}
                  className="text-[11px] text-red-400 hover:text-red-300 text-left transition-colors"
                >Disconnect (keep as manual chart)</button>
              </div>
            )}
            {item.graphTableSourceItemId ? null : (() => {
              const cellCls = "border-b border-r border-[var(--border)] py-1.5 px-2";
              const hdrCls = `${cellCls} bg-[var(--surface-overlay)] text-[11px] text-[var(--text-muted)] font-semibold`;
              const valInput = "w-full bg-transparent outline-none text-[var(--text-primary)] text-xs font-mono focus:text-[var(--accent)] transition-colors";
              const lblInput = "w-full bg-transparent outline-none text-[var(--text-secondary)] text-xs";

              /* helper: formula hint */
              const hint = (v: string | number) =>
                typeof v === "string" && /[+\-*/]/.test(v) ? (
                  <span className="text-[10px] font-mono text-[var(--accent)]/70 ml-1 flex-shrink-0">={resolveGraphValue(v)}</span>
                ) : null;

              /* ── PIE / DONUT ── */
              if (type === "pie" || type === "donut") {
                const vKey = seriesKeys[0] ?? "value";
                return (
                  <div className="rounded border border-[var(--border)] overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className={cn(hdrCls, "w-8 text-center")} style={{ borderLeft: "none" }}>●</th>
                          <th className={hdrCls}>Slice</th>
                          <th className={cn(hdrCls, "text-right")}>Value</th>
                          <th className="bg-[var(--surface-overlay)] border-b border-[var(--border)] w-7" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, ri) => (
                          <tr key={ri} className="group hover:bg-white/[0.025] transition-colors">
                            <td className={cn(cellCls, "text-center")}>
                              <label className="relative h-3.5 w-3.5 rounded-full border border-white/20 overflow-hidden cursor-pointer inline-block" style={{ backgroundColor: colors[ri % colors.length] }}>
                                <input type="color" value={colors[ri % colors.length]} onChange={(e) => { const c = [...colors]; c[ri] = e.target.value; upd({ graphColors: c }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                              </label>
                            </td>
                            <td className={cellCls}><input className={lblInput} placeholder="Slice name" value={row.label} onChange={(e) => updateCell(ri, "label", e.target.value)} /></td>
                            <td className={cellCls}>
                              <div className="flex items-center justify-end">
                                <input className={cn(valInput, "text-right")} placeholder="0" value={String(row[vKey] ?? 0)} onChange={(e) => updateCell(ri, vKey, e.target.value)} />
                                {hint(row[vKey] as string)}
                              </div>
                            </td>
                            <td className="border-b border-[var(--border)] px-1">
                              <button onClick={() => removeRow(ri)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-opacity"><Trash2 size={10} /></button>
                            </td>
                          </tr>
                        ))}
                        <tr><td colSpan={4} className="px-2 py-1.5">
                          <button onClick={addRow} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"><Plus size={10} /> Add slice</button>
                        </td></tr>
                      </tbody>
                    </table>
                  </div>
                );
              }

              /* ── SCATTER ── */
              if (type === "scatter") {
                const xKey = seriesKeys[0] ?? "x";
                const yKeys = seriesKeys.length > 1 ? seriesKeys.slice(1) : [];
                if (seriesKeys.length < 2) return null;
                const addDs = () => { const k = `Dataset ${yKeys.length + 2}`; upd({ graphSeriesKeys: [...seriesKeys, k], graphData: data.map((r) => ({ ...r, [k]: 0 })) }); };
                const removeDs = (k: string) => { if (yKeys.length <= 1) return; upd({ graphSeriesKeys: seriesKeys.filter((s) => s !== k), graphData: data.map((r) => { const n={...r}; delete n[k]; return n; }) }); };
                return (
                  <div className="rounded border border-[var(--border)] overflow-x-auto">
                    <table className="w-full text-xs border-collapse" style={{ minWidth: 200 + yKeys.length * 80 }}>
                      <thead>
                        <tr>
                          <th className={cn(hdrCls, "w-6 text-center")}>#</th>
                          <th className={hdrCls}>Label</th>
                          <th className={hdrCls}>
                            <input className="bg-transparent outline-none w-full font-semibold text-[11px] text-[var(--text-muted)]" defaultValue={xKey} onBlur={(e) => renameSeries(xKey, e.target.value || xKey)} />
                            <span className="text-[8px] text-[var(--text-muted)]/50 block font-normal">X axis →</span>
                          </th>
                          {yKeys.map((k, i) => (
                            <th key={k} className={hdrCls}>
                              <div className="flex items-center gap-1">
                                <label className="relative h-2.5 w-2.5 rounded-sm border border-white/20 overflow-hidden flex-shrink-0 cursor-pointer" style={{ backgroundColor: colors[(i+1) % colors.length] }}>
                                  <input type="color" value={colors[(i+1) % colors.length]} onChange={(e) => { const c=[...colors]; c[i+1]=e.target.value; upd({graphColors:c}); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </label>
                                <input className="bg-transparent outline-none flex-1 min-w-0 font-semibold text-[11px] text-[var(--text-muted)]" defaultValue={k} onBlur={(e) => renameSeries(k, e.target.value || k)} />
                                {yKeys.length > 1 && <button onClick={() => removeDs(k)} className="text-[var(--text-muted)] hover:text-red-400 flex-shrink-0"><XIcon size={8} /></button>}
                              </div>
                              <span className="text-[8px] text-[var(--text-muted)]/50 block font-normal">Y axis ↑</span>
                            </th>
                          ))}
                          <th className="bg-[var(--surface-overlay)] border-b border-[var(--border)] w-7 px-1">
                            <button onClick={addDs} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"><Plus size={10} /></button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, ri) => (
                          <tr key={ri} className="group hover:bg-white/[0.025] transition-colors">
                            <td className={cn(cellCls, "text-center text-[11px] text-[var(--text-muted)]")}>{ri+1}</td>
                            <td className={cellCls}><input className={lblInput} placeholder="label" value={row.label} onChange={(e) => updateCell(ri, "label", e.target.value)} /></td>
                            <td className={cellCls}>
                              <div className="flex items-center"><input className={valInput} placeholder="0" value={String(row[xKey] ?? 0)} onChange={(e) => updateCell(ri, xKey, e.target.value)} />{hint(row[xKey] as string)}</div>
                            </td>
                            {yKeys.map((k) => (
                              <td key={k} className={cellCls}>
                                <div className="flex items-center"><input className={valInput} placeholder="0" value={String(row[k] ?? 0)} onChange={(e) => updateCell(ri, k, e.target.value)} />{hint(row[k] as string)}</div>
                              </td>
                            ))}
                            <td className="border-b border-[var(--border)] px-1">
                              <button onClick={() => removeRow(ri)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-opacity"><Trash2 size={10} /></button>
                            </td>
                          </tr>
                        ))}
                        <tr><td colSpan={yKeys.length + 4} className="px-2 py-1.5">
                          <button onClick={addRow} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"><Plus size={10} /> Add point</button>
                        </td></tr>
                      </tbody>
                    </table>
                  </div>
                );
              }

              /* ── STANDARD: bar, line, area, radar ── */
              const catLabel = type === "radar" ? "Axis" : "Category";
              const addBtn = type === "radar" ? "Add axis" : "Add row";
              return (
                <div className="rounded border border-[var(--border)] overflow-x-auto">
                  <table className="w-full text-xs border-collapse" style={{ minWidth: 120 + seriesKeys.length * 80 }}>
                    <thead>
                      <tr>
                        <th className={cn(hdrCls, "w-6 text-center")}>#</th>
                        <th className={hdrCls}>{catLabel}</th>
                        {seriesKeys.map((k, ki) => (
                          <th key={k} className={hdrCls}>
                            <div className="flex items-center gap-1.5">
                              <label className="relative h-2.5 w-2.5 rounded-sm border border-white/20 overflow-hidden flex-shrink-0 cursor-pointer" style={{ backgroundColor: colors[ki % colors.length] }}>
                                <input type="color" value={colors[ki % colors.length]} onChange={(e) => { const c=[...colors]; c[ki]=e.target.value; upd({graphColors:c}); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                              </label>
                              <input className="bg-transparent outline-none flex-1 min-w-0 font-semibold text-[11px] text-[var(--text-muted)]" defaultValue={k} onBlur={(e) => renameSeries(k, e.target.value || k)} />
                              {seriesKeys.length > 1 && <button onClick={() => removeSeries(k)} className="text-[var(--text-muted)] hover:text-red-400 flex-shrink-0"><XIcon size={8} /></button>}
                            </div>
                          </th>
                        ))}
                        <th className="bg-[var(--surface-overlay)] border-b border-[var(--border)] w-7 px-1">
                          <button onClick={addSeries} title="Add series" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"><Plus size={10} /></button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, ri) => (
                        <tr key={ri} className="group hover:bg-white/[0.025] transition-colors">
                          <td className={cn(cellCls, "text-center text-[11px] text-[var(--text-muted)]")}>{ri+1}</td>
                          <td className={cellCls}><input className={lblInput} placeholder="Category" value={row.label} onChange={(e) => updateCell(ri, "label", e.target.value)} /></td>
                          {seriesKeys.map((k) => (
                            <td key={k} className={cellCls}>
                              <div className="flex items-center"><input className={valInput} placeholder="0" value={String(row[k] ?? 0)} onChange={(e) => updateCell(ri, k, e.target.value)} />{hint(row[k] as string)}</div>
                            </td>
                          ))}
                          <td className="border-b border-[var(--border)] px-1">
                            <button onClick={() => removeRow(ri)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-opacity"><Trash2 size={10} /></button>
                          </td>
                        </tr>
                      ))}
                      <tr><td colSpan={seriesKeys.length + 3} className="px-2 py-1.5">
                        <button onClick={addRow} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"><Plus size={10} /> {addBtn}</button>
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Style ── */}

        {tab === "style" && (
          <div className="pt-1 flex flex-col gap-5">

            {/* Title */}
            <div>
              <p className="mb-1.5 text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Title</p>
              <input
                className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors"
                placeholder="Chart title…"
                value={item.graphTitle ?? ""}
                onChange={(e) => upd({ graphTitle: e.target.value || undefined })}
              />
            </div>

            {/* Labels */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Labels</p>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors select-none">
                <input type="checkbox" checked={!!item.graphShowDataLabels} onChange={(e) => upd({ graphShowDataLabels: e.target.checked || undefined })} className="accent-[var(--accent)]" />
                <span className="text-xs text-[var(--text-secondary)]">Show data labels</span>
              </label>
              {type !== "pie" && type !== "donut" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-muted)]">X axis title</span>
                    <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors"
                      placeholder="e.g. Month"
                      value={item.graphXAxisTitle ?? ""}
                      onChange={(e) => upd({ graphXAxisTitle: e.target.value || undefined })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-muted)]">Y axis title</span>
                    <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors"
                      placeholder="e.g. Value"
                      value={item.graphYAxisTitle ?? ""}
                      onChange={(e) => upd({ graphYAxisTitle: e.target.value || undefined })} />
                  </div>
                </div>
              )}
            </div>

            {/* Series colors */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Series colors</p>
                {item.graphColors && (
                  <button onClick={() => upd({ graphColors: undefined })} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Reset</button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {seriesKeys.map((k, ki) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                    <span className="relative h-5 w-5 rounded-full border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: colors[ki % colors.length] }}>
                      <input type="color" value={colors[ki % colors.length]} onChange={(e) => { const c = [...colors]; c[ki] = e.target.value; upd({ graphColors: c }); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">{k}</span>
                    <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">{colors[ki % colors.length]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Background */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Background</p>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.graphBgColor ?? "transparent" }}>
                  <input type="color" value={item.graphBgColor ?? "#1a1b1e"} onChange={(e) => upd({ graphBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-xs text-[var(--text-secondary)]">Background color</span>
                {item.graphBgColor && (
                  <button onClick={() => upd({ graphBgColor: undefined })} className="ml-auto text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>
                )}
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[var(--text-muted)]">Image</label>
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                    placeholder="https://… or upload →"
                    value={item.graphBgImage?.startsWith("data:") ? "" : (item.graphBgImage ?? "")}
                    onChange={(e) => upd({ graphBgImage: e.target.value || undefined })}
                  />
                  <label className="flex items-center justify-center gap-1 cursor-pointer rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors flex-shrink-0">
                    <Upload size={11} />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      applyImageUpload(file, (url) => upd({ graphBgImage: url }));
                      e.target.value = "";
                    }} />
                  </label>
                  {item.graphBgImage && (
                    <button onClick={() => upd({ graphBgImage: undefined })} className="flex-shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors px-1"><XIcon size={11} /></button>
                  )}
                </div>
                {item.graphBgImage?.startsWith("data:") && (
                  <p className="text-[10px] text-[var(--text-muted)]">Local file uploaded</p>
                )}
              </div>
              {item.graphBgImage && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Image opacity</label>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">{item.graphBgImageOpacity ?? 80}%</span>
                  </div>
                  <input type="range" min={5} max={100} value={item.graphBgImageOpacity ?? 80}
                    onChange={(e) => upd({ graphBgImageOpacity: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]" />
                  <div className="flex gap-1.5 mt-0.5">
                    {["cover","contain","auto"].map((s) => (
                      <button key={s} onClick={() => upd({ graphBgImageSize: s })}
                        className={cn("flex-1 rounded py-1 text-[11px] transition-colors",
                          (item.graphBgImageSize ?? "cover") === s ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        )}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Font */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Font</p>
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] text-[var(--text-muted)]">Family</label>
                  <select
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                    value={item.graphFontFamily ?? ""}
                    onChange={(e) => upd({ graphFontFamily: e.target.value || undefined })}
                  >
                    <option value="">Default</option>
                    {["Inter","Roboto","DM Sans","Geist","Space Grotesk","Outfit","Lato","Poppins","JetBrains Mono","Fira Code","IBM Plex Mono","Courier New","Georgia","Times New Roman"].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 w-16">
                  <label className="text-[11px] text-[var(--text-muted)]">Size</label>
                  <input type="number" min={6} max={20}
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                    value={item.graphFontSize ?? 10}
                    onChange={(e) => upd({ graphFontSize: Number(e.target.value) })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.graphFontColor ?? "#888" }}>
                  <input type="color" value={item.graphFontColor ?? "#888888"} onChange={(e) => upd({ graphFontColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-xs text-[var(--text-secondary)]">Label color</span>
                <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">{item.graphFontColor ?? "default"}</span>
              </label>
            </div>

            {/* Chart style */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Chart style</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[var(--text-muted)]">Bar radius</label>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">{item.graphBarRadius ?? 3}px</span>
                </div>
                <input type="range" min={0} max={20} value={item.graphBarRadius ?? 3}
                  onChange={(e) => upd({ graphBarRadius: Number(e.target.value) })}
                  className="w-full accent-[var(--accent)]" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[var(--text-muted)]">Line / area stroke</label>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">{item.graphStrokeWidth ?? 2}px</span>
                </div>
                <input type="range" min={1} max={8} value={item.graphStrokeWidth ?? 2}
                  onChange={(e) => upd({ graphStrokeWidth: Number(e.target.value) })}
                  className="w-full accent-[var(--accent)]" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[var(--text-muted)]">Corner radius</label>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">{item.graphBorderRadius ?? 4}px</span>
                </div>
                <input type="range" min={0} max={24} value={item.graphBorderRadius ?? 4}
                  onChange={(e) => upd({ graphBorderRadius: Number(e.target.value) })}
                  className="w-full accent-[var(--accent)]" />
              </div>
              {[
                { label: "Show grid", key: "graphShowGrid" as const, val: showGrid },
                { label: "Show legend", key: "graphShowLegend" as const, val: showLegend },
                { label: "Smooth curves", key: "graphSmooth" as const, val: smooth },
              ].map(({ label, key, val }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors select-none">
                  <input type="checkbox" checked={val} onChange={(e) => upd({ [key]: e.target.checked })} className="accent-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                </label>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function ChartRenderer({ type, data, seriesKeys, colors, showGrid, showLegend, curve, collapsed, width, height, fontFamily, fontSize, fontColor, barRadius, strokeWidth, showDataLabels, xAxisTitle, yAxisTitle }: {
  type: BlockItem["graphType"];
  data: GraphPoint[];
  seriesKeys: string[];
  colors: string[];
  showGrid: boolean;
  showLegend: boolean;
  curve: "monotone" | "linear";
  collapsed: boolean;
  width: number;
  height: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  barRadius?: number;
  strokeWidth?: number;
  showDataLabels?: boolean;
  xAxisTitle?: string;
  yAxisTitle?: string;
}) {
  const dims = { width, height };
  const tickStyle = { fill: fontColor ?? "var(--text-muted)", fontSize: fontSize ?? 10, fontFamily: fontFamily };
  const tt = collapsed ? undefined : <Tooltip contentStyle={TT_STYLE} />;
  const grid = showGrid && !collapsed ? <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /> : null;
  const legend = showLegend && !collapsed ? <Legend wrapperStyle={{ fontSize: fontSize ?? 10, fontFamily }} /> : null;
  const xAxis = <XAxis dataKey="label" tick={tickStyle} hide={collapsed} label={xAxisTitle && !collapsed ? { value: xAxisTitle, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />;
  const yAxis = <YAxis tick={tickStyle} hide={collapsed} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />;
  const br = barRadius ?? 3;
  const sw = strokeWidth ?? 2;
  const lblStyle = { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)", fontFamily };

  if (type === "bar" || type === "bar-stacked") {
    const stacked = type === "bar-stacked";
    return (
      <BarChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={stacked ? 0 : [br,br,0,0]} stackId={stacked ? "s" : undefined}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Bar>
        ))}
      </BarChart>
    );
  }
  if (type === "bar-h") {
    return (
      <BarChart {...dims} data={data} layout="vertical">
        {grid}
        <XAxis type="number" tick={tickStyle} hide={collapsed} label={xAxisTitle && !collapsed ? { value: xAxisTitle, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        <YAxis type="category" dataKey="label" tick={tickStyle} hide={collapsed} width={40} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        {tt}{legend}
        {seriesKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[0,br,br,0]}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="right" style={lblStyle} />}
          </Bar>
        ))}
      </BarChart>
    );
  }
  if (type === "line" || type === "multiline") {
    return (
      <LineChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Line key={k} type={curve} dataKey={k} stroke={colors[i % colors.length]} strokeWidth={sw} dot={!collapsed}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Line>
        ))}
      </LineChart>
    );
  }
  if (type === "area" || type === "area-stacked") {
    const stacked = type === "area-stacked";
    return (
      <AreaChart {...dims} data={data}>
        {grid}{xAxis}{yAxis}{tt}{legend}
        {seriesKeys.map((k, i) => (
          <Area key={k} type={curve} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.25} strokeWidth={sw} stackId={stacked ? "s" : undefined}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} position="top" style={lblStyle} />}
          </Area>
        ))}
      </AreaChart>
    );
  }
  if (type === "pie" || type === "donut") {
    const inner = type === "donut" ? "45%" : 0;
    return (
      <PieChart {...dims}>
        {tt}{legend}
        <Pie data={data} dataKey={seriesKeys[0] ?? "value"} nameKey="label" cx="50%" cy="50%" innerRadius={inner} outerRadius={collapsed ? "90%" : "75%"}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          {showDataLabels && !collapsed && <LabelList dataKey="label" position="outside" style={lblStyle} />}
        </Pie>
      </PieChart>
    );
  }
  if (type === "scatter") {
    // seriesKeys[0] = shared X axis; seriesKeys[1..n] = one dataset per Y series
    const xKey = seriesKeys[0] ?? "x";
    const yKeys = seriesKeys.length > 1 ? seriesKeys.slice(1) : [seriesKeys[0] ?? "y"];
    const labelStyle = { fontSize: collapsed ? 0 : (fontSize ?? 9), fill: fontColor ?? "var(--text-muted)", fontFamily };
    const xLabel = xAxisTitle ?? xKey;
    return (
      <ScatterChart {...dims}>
        {grid}
        <XAxis dataKey="x" type="number" name={xKey} tick={tickStyle} hide={collapsed} label={collapsed ? undefined : { value: xLabel, position: "insideBottom", offset: -4, style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } }} />
        <YAxis dataKey="y" type="number" tick={tickStyle} hide={collapsed} label={yAxisTitle && !collapsed ? { value: yAxisTitle, angle: -90, position: "insideLeft", style: { fontSize: (fontSize ?? 10) - 1, fill: fontColor ?? "var(--text-muted)" } } : undefined} />
        <ZAxis range={[sw * 20, sw * 20]} />
        {tt}
        {showLegend && !collapsed && <Legend wrapperStyle={{ fontSize: fontSize ?? 10, fontFamily }} />}
        {yKeys.map((yKey, i) => {
          const pts = data.map((r) => ({ x: Number(r[xKey] ?? 0), y: Number(r[yKey] ?? 0), label: r.label }));
          return (
            <Scatter key={yKey} name={yKey} data={pts} fill={colors[i % colors.length]}>
              {showDataLabels && !collapsed && <LabelList dataKey="label" position="top" style={labelStyle} />}
            </Scatter>
          );
        })}
      </ScatterChart>
    );
  }
  if (type === "radar") {
    return (
      <RadarChart {...dims} data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ ...tickStyle, fontSize: collapsed ? 8 : (fontSize ?? 10) }} />
        {tt}{legend}
        {seriesKeys.map((k, i) => (
          <Radar key={k} name={k} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2}>
            {showDataLabels && !collapsed && <LabelList dataKey={k} style={lblStyle} />}
          </Radar>
        ))}
      </RadarChart>
    );
  }
  return (
    <BarChart {...dims} data={data}>
      <Bar dataKey={seriesKeys[0] ?? "value"} fill={colors[0]} />
    </BarChart>
  );
}

// ─── Gaming ───────────────────────────────────────────────────────────────────

// ─── API helpers ──────────────────────────────────────────────────────────────

function extractPath(obj: unknown, path: string): unknown {
  if (!path.trim()) return obj;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc == null) return undefined;
    const arrMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) return (acc as Record<string, unknown[]>)[arrMatch[1]]?.[parseInt(arrMatch[2])];
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

// ─── API Item ─────────────────────────────────────────────────────────────────

function ApiItem({ item, upd, collapsed, isFinished, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; extraContextItems?: ContextMenuEntry[] }) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const doFetch = useCallback(async () => {
    if (!item.apiUrl || isFinished) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setLoading(true); setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      try { if (item.apiHeaders) Object.assign(headers, JSON.parse(item.apiHeaders)); } catch {}
      if (item.apiAuthType === "bearer" && item.apiAuthValue)
        headers["Authorization"] = `Bearer ${item.apiAuthValue}`;
      if (item.apiAuthType === "apikey" && item.apiAuthValue)
        headers[item.apiAuthHeader ?? "X-API-Key"] = item.apiAuthValue;
      if (item.apiAuthType === "basic" && item.apiAuthValue)
        headers["Authorization"] = `Basic ${btoa(`${item.apiAuthUser ?? ""}:${item.apiAuthValue}`)}`;
      const res = await fetch(item.apiUrl, {
        method: item.apiMethod ?? "GET",
        headers,
        body: item.apiMethod !== "GET" && item.apiBody ? item.apiBody : undefined,
        signal,
      });
      if (signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setLastFetched(new Date().toLocaleTimeString());
      // Persist extracted numeric value so widgets can consume it via vars
      const extracted = item.apiResponsePath ? extractPath(json, item.apiResponsePath) : json;
      const num = Number(extracted);
      if (!Number.isNaN(num)) upd({ apiCachedValue: num });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [item.apiUrl, item.apiMethod, item.apiHeaders, item.apiBody, item.apiAuthType, item.apiAuthValue, item.apiAuthHeader, item.apiAuthUser, item.apiResponsePath, isFinished, upd]);

  useEffect(() => {
    if (item.apiUrl && !isFinished) doFetch();
  }, [doFetch, isFinished]);

  useEffect(() => {
    if (!item.apiRefreshInterval || item.apiRefreshInterval <= 0 || isFinished) return;
    const id = setInterval(doFetch, item.apiRefreshInterval * 1000);
    return () => clearInterval(id);
  }, [item.apiRefreshInterval, doFetch, isFinished]);

  const extracted = data != null && item.apiResponsePath ? extractPath(data, item.apiResponsePath) : data;
  const displayMode = item.apiDisplayMode ?? "value";

  if (collapsed) {
    const val = extracted != null ? formatValue(extracted) : null;
    let hostname = "";
    if (item.apiUrl) { try { hostname = new URL(item.apiUrl).hostname; } catch {} }
    return (
      <div className="flex flex-col gap-0.5 min-w-0 px-1 py-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: error ? "#ef4444" : item.apiUrl ? "#22c55e" : "var(--text-muted)" }} />
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{item.apiLabel || "API"}</span>
          {val && <span className="ml-auto text-xs font-mono font-semibold text-[var(--accent)] truncate max-w-[80px]">{val}</span>}
        </div>
        {hostname && <span className="text-[11px] text-[var(--text-muted)] truncate pl-3.5">{hostname}</span>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0 text-xs" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 shrink-0">
        <span className={cn("h-2 w-2 rounded-full flex-shrink-0", loading ? "animate-pulse bg-yellow-400" : error ? "bg-red-400" : data ? "bg-green-400" : "bg-[var(--text-muted)]")} />
        <span className="flex-1 truncate text-[var(--text-muted)] font-mono text-[11px]">{item.apiUrl || "No URL set"}</span>
        <button
          onClick={doFetch}
          disabled={!item.apiUrl || loading}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <RotateCcw size={10} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>

      {/* Response area */}
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400 font-mono">{error}</div>
        )}
        {!error && data == null && !loading && (
          <p className="text-[var(--text-muted)] text-center mt-4">
            {item.apiUrl ? "Press Fetch to load data" : "Configure the API in the panel →"}
          </p>
        )}
        {!error && extracted != null && (
          displayMode === "table" && Array.isArray(extracted) ? (
            <div className="overflow-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>{Object.keys(extracted[0] ?? {}).map(k => (
                    <th key={k} className="border border-[var(--border)] px-2 py-1 text-left text-[var(--text-muted)] bg-[var(--surface-overlay)]">{k}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(extracted as Record<string, unknown>[]).slice(0, 50).map((row, i) => (
                    <tr key={i}>{Object.values(row).map((v, j) => (
                      <td key={j} className="border border-[var(--border)] px-2 py-1 font-mono text-[var(--text-primary)]">{formatValue(v)}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : displayMode === "value" && typeof extracted !== "object" ? (
            <div className="flex flex-col items-center justify-center h-full gap-1">
              {item.apiLabel && <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">{item.apiLabel}</p>}
              <p className="font-mono text-3xl font-bold text-[var(--accent)]">{formatValue(extracted)}</p>
              {lastFetched && <p className="text-[10px] text-[var(--text-muted)]">Updated {lastFetched}</p>}
            </div>
          ) : (
            <pre className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed">{JSON.stringify(extracted, null, 2)}</pre>
          )
        )}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            { label: "Refresh", icon: <RotateCcw size={14} />, onClick: doFetch },
            ...(item.apiUrl ? [{ label: "Copy URL", icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(item.apiUrl!) }] : []),
            ...(data != null ? ["separator" as const, { label: "Copy response", icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(JSON.stringify(data, null, 2)) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ─── API Style Panel ──────────────────────────────────────────────────────────

// Hoisted to module scope so its identity is stable across re-renders. When this
// lived inside ApiStylePanel, every keystroke's onChange re-rendered the panel,
// gave <ApiInput> a new function identity, and React remounted the <input> —
// dropping focus after each character. Keep it out here.
function ApiInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      className={cn("w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)]", mono && "font-mono")}
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    />
  );
}

export function ApiStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const authType = item.apiAuthType ?? "none";
  const method = item.apiMethod ?? "GET";

  const PLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</p>
  );

  const Btn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className={cn("flex-1 rounded py-1 text-[11px] font-medium transition-colors", active ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>{children}</button>
  );

  return (
    <div className="flex flex-col gap-4 p-3 text-xs overflow-y-auto">

      {/* Presets */}
      <section>
        <PLabel>Quick presets</PLabel>
        <div className="flex flex-col gap-1">
          {API_PRESETS.map((p) => (
            <button key={p.id} onClick={() => upd({ apiUrl: p.url, apiMethod: p.method, apiAuthType: p.authType })}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors">
              <span className="flex-1 font-medium text-[var(--text-primary)] text-[11px]">{p.label}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{p.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Request */}
      <section>
        <PLabel>Request</PLabel>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {(["GET","POST","PUT","PATCH","DELETE"] as const).map((m) => (
              <Btn key={m} active={method === m} onClick={() => upd({ apiMethod: m })}>{m}</Btn>
            ))}
          </div>
          <ApiInput value={item.apiUrl ?? ""} onChange={(v) => upd({ apiUrl: v })} placeholder="https://api.example.com/endpoint" mono />
        </div>
      </section>

      {/* Auth */}
      <section>
        <PLabel>Auth</PLabel>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {(["none","bearer","apikey","basic"] as const).map((a) => (
              <Btn key={a} active={authType === a} onClick={() => upd({ apiAuthType: a })}>{a === "none" ? "None" : a === "bearer" ? "Bearer" : a === "apikey" ? "API Key" : "Basic"}</Btn>
            ))}
          </div>
          {authType === "bearer" && <ApiInput value={item.apiAuthValue ?? ""} onChange={(v) => upd({ apiAuthValue: v })} placeholder="Token / OAuth access token" />}
          {authType === "apikey" && (
            <>
              <ApiInput value={item.apiAuthHeader ?? "X-API-Key"} onChange={(v) => upd({ apiAuthHeader: v })} placeholder="Header name (e.g. X-API-Key)" />
              <ApiInput value={item.apiAuthValue ?? ""} onChange={(v) => upd({ apiAuthValue: v })} placeholder="Key value" />
            </>
          )}
          {authType === "basic" && (
            <>
              <ApiInput value={item.apiAuthUser ?? ""} onChange={(v) => upd({ apiAuthUser: v })} placeholder="Username" />
              <ApiInput value={item.apiAuthValue ?? ""} onChange={(v) => upd({ apiAuthValue: v })} placeholder="Password" />
            </>
          )}
        </div>
      </section>

      {/* Body (non-GET) */}
      {method !== "GET" && (
        <section>
          <PLabel>Request body (JSON)</PLabel>
          <textarea
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)] resize-none"
            rows={4}
            value={item.apiBody ?? ""}
            onChange={(e) => upd({ apiBody: e.target.value })}
            placeholder={'{\n  "key": "value"\n}'}
          />
        </section>
      )}

      {/* Extra headers */}
      <section>
        <PLabel>Extra headers (JSON)</PLabel>
        <textarea
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)] resize-none"
          rows={3}
          value={item.apiHeaders ?? ""}
          onChange={(e) => upd({ apiHeaders: e.target.value })}
          placeholder={'{ "Accept": "application/json" }'}
        />
      </section>

      {/* Display */}
      <section>
        <PLabel>Display</PLabel>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {(["value","json","table"] as const).map((m) => (
              <Btn key={m} active={(item.apiDisplayMode ?? "value") === m} onClick={() => upd({ apiDisplayMode: m })}>{m === "value" ? "Value" : m === "json" ? "JSON" : "Table"}</Btn>
            ))}
          </div>
          <ApiInput value={item.apiResponsePath ?? ""} onChange={(v) => upd({ apiResponsePath: v })} placeholder="e.g. data.items[0].name" />
          <p className="text-[10px] text-[var(--text-muted)]">Dot-path to extract a field from the response. Leave blank to use full response.</p>
          <ApiInput value={item.apiLabel ?? ""} onChange={(v) => upd({ apiLabel: v })} placeholder="Label (shown above value)" />
        </div>
      </section>

      {/* Auto-refresh */}
      <section>
        <PLabel>Auto-refresh</PLabel>
        <div className="flex items-center gap-2">
          <input type="number" min={0} value={item.apiRefreshInterval ?? 0}
            onChange={(e) => upd({ apiRefreshInterval: Number(e.target.value) })}
            className="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none text-center"
          />
          <span className="text-[var(--text-muted)]">seconds (0 = manual only)</span>
        </div>
      </section>


    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

const DAY_LABELS_SUN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_LABELS_MON = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_LABELS_SUN_SHORT = ["S","M","T","W","T","F","S"];
const DAY_LABELS_MON_SHORT = ["M","T","W","T","F","S","S"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtTime(t?: string) { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ampm = h >= 12 ? "pm" : "am"; return `${h % 12 || 12}:${String(m).padStart(2,"0")}${ampm}`; }
function todayKey() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; }
function fmtRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── ICS export ────────────────────────────────────────────────────────────────
// buildIcs lives in @/lib/ics (shared with the subscription feed route).

function downloadIcs(events: CalendarEvent[], calName: string): void {
  const blob = new Blob([buildIcs(events, calName)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${calName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "calendar"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function dateLabel(key: string) { const [y,m,d] = key.split("-").map(Number); const dt = new Date(y,m-1,d); return dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }

// ─── RRULE expansion ──────────────────────────────────────────────────────────
// We expand recurring events within a bounded window so a single VEVENT with an
// RRULE (e.g. a weekly stream) yields one occurrence per date, instead of showing
// only its first instance. Standards-only (RFC 5545) — no external library.

const ICS_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // JS getDay() index
const RRULE_WINDOW_BACK_DAYS = 31;   // keep last month's occurrences visible
const RRULE_WINDOW_FWD_DAYS = 400;   // ~13 months ahead
const RRULE_MAX_OCCURRENCES = 400;   // hard cap per event (guards runaway rules)

function icsDateParts(raw: string): { y: number; m: number; d: number } | null {
  const m = raw.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The date of the nth (1-based; negative = from end) `dow` weekday in a month, or null if it doesn't exist. */
function nthWeekdayOfMonth(year: number, month0: number, dow: number, ord: number): Date | null {
  if (ord > 0) {
    const first = new Date(year, month0, 1, 12);
    const offset = (dow - first.getDay() + 7) % 7;
    const day = 1 + offset + (ord - 1) * 7;
    const d = new Date(year, month0, day, 12);
    return d.getMonth() === month0 ? d : null; // ord larger than available weeks
  }
  if (ord < 0) {
    const last = new Date(year, month0 + 1, 0, 12); // last day of month
    const offset = (last.getDay() - dow + 7) % 7;
    const day = last.getDate() - offset - (Math.abs(ord) - 1) * 7;
    return day >= 1 ? new Date(year, month0, day, 12) : null;
  }
  return null;
}

/** All EXDATE date-keys declared in a VEVENT block. */
function collectExdates(block: string): Set<string> {
  const set = new Set<string>();
  const re = /EXDATE[^:]*:([^\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    for (const raw of m[1].split(",")) {
      const p = icsDateParts(raw.trim());
      if (p) set.add(`${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`);
    }
  }
  return set;
}

/**
 * Expand an RRULE into occurrence date-keys (YYYY-MM-DD), including the first,
 * bounded to the display window. Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY with
 * INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY. EXDATEs are removed post-expansion.
 */
function expandRrule(rrule: string, start: { y: number; m: number; d: number }, exdates: Set<string>): string[] {
  const parts: Record<string, string> = {};
  for (const seg of rrule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = (parts.FREQ ?? "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return [ymdKey(new Date(start.y, start.m - 1, start.d, 12))];
  }
  const interval = Math.max(1, parseInt(parts.INTERVAL ?? "1", 10) || 1);
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : undefined;
  const untilP = parts.UNTIL ? icsDateParts(parts.UNTIL) : null;
  const untilMs = untilP ? new Date(untilP.y, untilP.m - 1, untilP.d, 23, 59, 59).getTime() : undefined;
  // BYDAY entries may carry an ordinal prefix (e.g. "3TU" = 3rd Tue, "-1FR" = last Fri).
  const bydayParsed = (parts.BYDAY ? parts.BYDAY.toUpperCase().split(",") : [])
    .map((tok) => {
      const dow = ICS_WEEKDAYS.indexOf(tok.slice(-2));
      const ordStr = tok.slice(0, -2);
      const ord = ordStr ? parseInt(ordStr, 10) : NaN;
      return dow >= 0 ? { dow, ord: Number.isFinite(ord) ? ord : null } : null;
    })
    .filter((x): x is { dow: number; ord: number | null } => x !== null);
  const byMonthDay = parts.BYMONTHDAY ? parts.BYMONTHDAY.split(",").map((n) => parseInt(n, 10)).filter(Number.isFinite) : [];

  const now = Date.now();
  const winStart = now - RRULE_WINDOW_BACK_DAYS * 86400000;
  const winEnd = now + RRULE_WINDOW_FWD_DAYS * 86400000;
  const startDate = new Date(start.y, start.m - 1, start.d, 12);

  const results: string[] = [];
  let produced = 0;
  let guard = 0;
  const GUARD_MAX = 5000;

  // Emit one candidate date; returns false when a stop condition is hit.
  const emit = (d: Date): boolean => {
    const t = d.getTime();
    if (untilMs !== undefined && t > untilMs) return false;
    if (t > winEnd) return false;
    if (count !== undefined && produced >= count) return false;
    produced++;
    const key = ymdKey(d);
    if (t >= winStart && !exdates.has(key) && results.length < RRULE_MAX_OCCURRENCES) results.push(key);
    return true;
  };

  if (freq === "WEEKLY") {
    const targetDows = bydayParsed.length
      ? [...new Set(bydayParsed.map((s) => s.dow))].sort((a, b) => a - b)
      : [startDate.getDay()];
    // Start from the Sunday of the start week; step INTERVAL weeks at a time.
    const weekCursor = new Date(startDate);
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay());
    while (guard++ < GUARD_MAX) {
      let stop = false;
      for (const dow of targetDows) {
        const occ = new Date(weekCursor);
        occ.setDate(occ.getDate() + dow);
        if (occ.getTime() < startDate.getTime()) continue; // before the series start
        if (!emit(occ)) { stop = true; break; }
      }
      if (stop) break;
      weekCursor.setDate(weekCursor.getDate() + 7 * interval);
      if (weekCursor.getTime() > winEnd && (untilMs === undefined || weekCursor.getTime() > untilMs)) break;
    }
  } else if (freq === "MONTHLY" && (bydayParsed.length || byMonthDay.length)) {
    // Positioned days each month: ordinal weekdays (3TU / -1FR), every matching
    // weekday (FR), or fixed month-days (BYMONTHDAY). Candidates per month are
    // sorted so emission stays chronological (COUNT/UNTIL honoured in order).
    let y = start.y;
    let mo = start.m - 1;
    while (guard++ < GUARD_MAX) {
      const cands: Date[] = [];
      if (bydayParsed.length) {
        for (const spec of bydayParsed) {
          if (spec.ord != null) {
            const d = nthWeekdayOfMonth(y, mo, spec.dow, spec.ord);
            if (d) cands.push(d);
          } else {
            const first = new Date(y, mo, 1, 12);
            const off = (spec.dow - first.getDay() + 7) % 7;
            for (let day = 1 + off; new Date(y, mo, day, 12).getMonth() === mo; day += 7) cands.push(new Date(y, mo, day, 12));
          }
        }
      } else {
        for (const dnum of byMonthDay) {
          const d = new Date(y, mo, dnum, 12);
          if (d.getMonth() === mo) cands.push(d);
        }
      }
      const ordered = cands.filter((d) => d.getTime() >= startDate.getTime()).sort((a, b) => a.getTime() - b.getTime());
      let stop = false;
      for (const d of ordered) { if (!emit(d)) { stop = true; break; } }
      if (stop) break;
      mo += interval;
      while (mo > 11) { mo -= 12; y++; }
      const monthStart = new Date(y, mo, 1, 12).getTime();
      if (monthStart > winEnd && (untilMs === undefined || monthStart > untilMs)) break;
    }
  } else {
    // DAILY, YEARLY, and plain MONTHLY (same day-of-month as the start).
    const cursor = new Date(startDate);
    while (guard++ < GUARD_MAX) {
      if (!emit(new Date(cursor))) break;
      if (freq === "DAILY") cursor.setDate(cursor.getDate() + interval);
      else if (freq === "MONTHLY") cursor.setMonth(cursor.getMonth() + interval);
      else cursor.setFullYear(cursor.getFullYear() + interval); // YEARLY
      if (cursor.getTime() > winEnd && (untilMs === undefined || cursor.getTime() > untilMs)) break;
    }
  }
  return results;
}

function parseIcs(text: string, feedId: string, feedColor: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const get = (key: string) => { const m = block.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`)); return m ? m[1].trim() : undefined; };
    const dtstart = get("DTSTART") ?? "";
    if (!dtstart) continue;
    const dateStr = dtstart.replace(/T.*/,"").replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3");
    const timeStr = dtstart.includes("T") ? dtstart.replace(/.*T(\d{2})(\d{2}).*/,"$1:$2") : undefined;
    const dtend = get("DTEND") ?? "";
    const endTimeStr = dtend.includes("T") ? dtend.replace(/.*T(\d{2})(\d{2}).*/,"$1:$2") : undefined;
    const summary = (get("SUMMARY") ?? "Untitled").replace(/\\n/g," ").replace(/\\,/g,",");
    const desc = get("DESCRIPTION")?.replace(/\\n/g,"\n").replace(/\\,/g,",");
    const loc = get("LOCATION")?.replace(/\\,/g,",");
    const uid = get("UID") ?? crypto.randomUUID();
    const base = { title: summary, color: feedColor, startTime: timeStr, endTime: endTimeStr, description: desc, location: loc, feedId, allDay: !dtstart.includes("T") };

    const rrule = get("RRULE");
    const startParts = icsDateParts(dtstart);
    if (rrule && startParts) {
      const exdates = collectExdates(block);
      for (const key of expandRrule(rrule, startParts, exdates)) {
        events.push({ id: `feed-${feedId}-${uid}-${key}`, date: key, ...base });
      }
    } else {
      events.push({ id: `feed-${feedId}-${uid}`, date: dateStr, ...base });
    }
  }
  return events;
}

// Event detail popup
interface EventPopupProps {
  event: CalendarEvent | null;
  date: string | null; // for new event
  accent: string;
  onSave: (ev: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isFinished?: boolean;
  boardId?: string;
  itemId?: string;
}
function EventPopup({ event, date, accent, onSave, onDelete, onClose, isFinished, boardId, itemId }: EventPopupProps) {
  const { identity } = useUser();
  const isNew = !event;
  const [title, setTitle] = useState(event?.title ?? "");
  const [color, setColor] = useState(event?.color ?? accent);
  const [dateVal, setDateVal] = useState(event?.date ?? date ?? "");
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? !event?.startTime);
  const readOnly = !!event?.feedId || isFinished;

  const [remindBusy, setRemindBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const setReminder = async (leadMs: number) => {
    if (!dateVal) return;
    const start = eventStartDate(dateVal, allDay ? undefined : (startTime || undefined));
    const remindAt = new Date(start.getTime() - leadMs);
    if (remindAt.getTime() <= Date.now()) {
      setReminderMsg("That time has already passed");
      setTimeout(() => setReminderMsg(null), 3000);
      return;
    }
    setRemindBusy(true);
    const res = await createReminder({
      userId: identity.userId,
      title: title.trim() || "Event",
      body: `${start.toLocaleString()}${location ? ` · ${location}` : ""}${description ? `\n\n${description}` : ""}`,
      remindAt,
      boardId,
      itemId,
      url: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setRemindBusy(false);
    setReminderMsg(res.ok ? "Reminder set ✓" : "Couldn't set reminder — sign in and try again");
    setTimeout(() => setReminderMsg(null), 3000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!title.trim() || !dateVal) return;
    onSave({ id: event?.id ?? crypto.randomUUID(), date: dateVal, title: title.trim(), color, startTime: allDay ? undefined : startTime || undefined, endTime: allDay ? undefined : endTime || undefined, description: description || undefined, location: location || undefined, allDay, feedId: event?.feedId });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-72 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Color bar */}
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="p-4 flex flex-col gap-3">
          {/* Title */}
          <input
            autoFocus
            readOnly={readOnly}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); }}
            placeholder="Event title…"
            className="w-full text-sm font-semibold bg-transparent border-b border-[var(--border)] pb-1 outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />

          {/* Date */}
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="w-16 text-[var(--text-muted)] shrink-0">Date</span>
            <input type="date" value={dateVal} readOnly={readOnly} onChange={e => setDateVal(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-0.5" />
          </div>

          {/* All day toggle */}
          {!readOnly && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="accent-[var(--accent)]" />
              <span className="text-[var(--text-secondary)]">All day</span>
            </label>
          )}

          {/* Time */}
          {!allDay && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[var(--text-muted)] shrink-0">Time</span>
              <input type="time" value={startTime} readOnly={readOnly} onChange={e => setStartTime(e.target.value)}
                className="flex-1 bg-transparent border border-[var(--border)] rounded px-2 py-0.5 outline-none text-[var(--text-primary)]" />
              <span className="text-[var(--text-muted)]">→</span>
              <input type="time" value={endTime} readOnly={readOnly} onChange={e => setEndTime(e.target.value)}
                className="flex-1 bg-transparent border border-[var(--border)] rounded px-2 py-0.5 outline-none text-[var(--text-primary)]" />
            </div>
          )}

          {/* Location */}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-16 text-[var(--text-muted)] shrink-0">Location</span>
            <input readOnly={readOnly} value={location} onChange={e => setLocation(e.target.value)}
              placeholder={readOnly ? "—" : "Add location…"}
              className="flex-1 bg-transparent border border-[var(--border)] rounded px-2 py-0.5 outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--text-muted)]">Notes</span>
            <textarea readOnly={readOnly} value={description} onChange={e => setDescription(e.target.value)}
              placeholder={readOnly ? "—" : "Add notes…"} rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none" />
          </div>

          {/* Color */}
          {!readOnly && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[var(--text-muted)] shrink-0">Color</span>
              <div className="flex gap-1.5 flex-wrap">
                {["#d59ee8","#e44c4c","#e8a838","#3bba6c","#3b9bba","#9b59b6","#e67e22","#1abc9c"].map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={cn("h-5 w-5 rounded-full border-2 transition-transform", color === c ? "border-white scale-110" : "border-transparent")}
                    style={{ background: c }} />
                ))}
                <span className="relative h-5 w-5 rounded-full border border-white/30 overflow-hidden">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  <span className="absolute inset-0 rounded-full" style={{ background: color }} />
                </span>
              </div>
            </div>
          )}

          {event?.feedId && (
            <p className="text-[10px] text-[var(--text-muted)] italic">From external calendar feed — read only</p>
          )}

          {/* Remind me */}
          {!isNew && dateVal && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Bell size={12} /> Remind me</div>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_LEADS.map(l => (
                  <button key={l.label} disabled={remindBusy} onClick={() => setReminder(l.ms)}
                    className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40">
                    {l.label}
                  </button>
                ))}
              </div>
              {reminderMsg && <p className="text-[11px] text-[var(--text-muted)]">{reminderMsg}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!readOnly && (
              <>
                <button onClick={save} className="flex-1 rounded-lg py-1.5 text-xs font-medium text-white transition-colors" style={{ background: accent }}>
                  {isNew ? "Add event" : "Save"}
                </button>
                {!isNew && (
                  <button onClick={() => { onDelete(event!.id); onClose(); }}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                    Delete
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className={cn("rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors", readOnly && "flex-1")}>
              {readOnly ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarItem({ item, upd, boardId, boxId, collapsed, isFinished, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; boardId?: string; boxId?: string; collapsed?: boolean; isFinished?: boolean; extraContextItems?: ContextMenuEntry[] }) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const today = new Date();
  const view = item.calendarView ?? "month";
  const mondayFirst = item.calendarFirstDayMonday ?? false;
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewWeekStart, setViewWeekStart] = useState(() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (mondayFirst ? (dow === 0 ? 6 : dow - 1) : dow));
    return d;
  });
  const [popup, setPopup] = useState<{ event: CalendarEvent | null; date: string | null } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const accent = item.calendarAccentColor ?? "#d59ee8";
  const todayColor = item.calendarTodayColor ?? accent;
  const showWeekends = item.calendarShowWeekends !== false;
  const fontFamily = item.calendarFontFamily;
  const fontSize = item.calendarFontSize ?? 11;
  const fontColor = item.calendarFontColor;
  const br = item.calendarBorderRadius ?? 0;

  const localEvents: CalendarEvent[] = item.calendarEvents ?? [];
  const feedEvents: CalendarEvent[] = item.calendarFeedEvents ?? [];

  // Auto-refresh external feeds: sync stale ones on mount, then on an interval.
  // A live ref keeps the interval merging against the latest item/upd. Only the
  // primary (expanded) render drives sync so collapsed pins don't double-fetch.
  const feedSyncRef = useRef({ item, upd });
  feedSyncRef.current = { item, upd };
  useEffect(() => {
    if (collapsed) return;
    const hasEnabled = (item.calendarFeeds ?? []).some(f => f.enabled);
    if (!hasEnabled) return;
    const run = () => {
      const it = feedSyncRef.current.item;
      const stale = (it.calendarFeeds ?? []).filter(f => f.enabled && (!f.lastSyncedAt || Date.now() - f.lastSyncedAt > FEED_REFRESH_MS));
      if (stale.length) void syncFeedsBatch(stale, it.calendarFeedEvents ?? [], it.calendarFeeds ?? [], feedSyncRef.current.upd);
    };
    run();
    const id = setInterval(run, FEED_REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, collapsed]);

  // Migrate legacy single-link fields into the array format on the fly
  const links: TableLink[] = useMemo(() => {
    const arr = item.calendarLinkedTables ?? [];
    if (arr.length > 0) return arr;
    // Legacy migration: if old fields are set, surface as a single link
    if (item.calendarLinkedTableId && item.calendarLinkedDateCol && item.calendarLinkedTitleCol) {
      return [{ id: "legacy", tableId: item.calendarLinkedTableId, dateCol: item.calendarLinkedDateCol, titleCol: item.calendarLinkedTitleCol, colorCol: item.calendarLinkedColorCol, color: accent }];
    }
    return [];
  }, [item.calendarLinkedTables, item.calendarLinkedTableId, item.calendarLinkedDateCol, item.calendarLinkedTitleCol, item.calendarLinkedColorCol, accent]);

  // Return all linked source items as a stable map (sourceId → item ref)
  const linkedSourceItems = useBoardStore(useShallow(s => {
    if (!boardId || links.length === 0) return {} as Record<string, BlockItem>;
    const board = s.boards.find(b => b.id === boardId) ?? s.serverBoards[boardId];
    if (!board) return {} as Record<string, BlockItem>;
    // Sources live alongside the calendar: its block's items when inside a block,
    // otherwise the board's canvas-level items when the calendar sits on the board.
    const pool: BlockItem[] = boxId
      ? (board.boxes.find(b => b.id === boxId)?.items ?? [])
      : (board.boardItems ?? []);
    const result: Record<string, BlockItem> = {};
    for (const lk of links) {
      const src = pool.find(i => i.id === lk.tableId);
      if (src) result[lk.tableId] = src;
    }
    return result;
  }));

  const linkedSourceEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];
    for (const lk of links) {
      const src = linkedSourceItems[lk.tableId];
      if (!src) continue;
      const fallback = lk.color ?? accent;
      const kind = lk.kind ?? "table";

      if (kind === "kanban") {
        const doneColIds = new Set((src.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS).filter(c => c.isDone).map(c => c.id));
        for (const card of src.kanbanCards ?? []) {
          if (!card.due) continue;
          const done = doneColIds.has(card.columnId);
          events.push({
            id: `linked-${lk.tableId}-${card.id}`,
            date: card.due,
            title: `${done ? "✓ " : ""}${card.text || "(untitled)"}`,
            color: card.color || fallback,
            description: card.description,
            feedId: `kanban:${lk.tableId}`,
          });
        }
        continue;
      }

      if (kind === "list") {
        for (const entry of src.listItems ?? []) {
          if (!entry.due) continue;
          events.push({
            id: `linked-${lk.tableId}-${entry.id}`,
            date: entry.due,
            title: `${entry.checked ? "✓ " : ""}${htmlToPlainText(entry.text) || "(untitled)"}`,
            color: fallback,
            feedId: `list:${lk.tableId}`,
          });
        }
        continue;
      }

      const rows = src.tableRows ?? [];
      for (const r of rows) {
        const rawDate = r.cells[lk.dateCol] as string | undefined;
        if (!rawDate) continue;
        // Accept YYYY-MM-DD (date input) or try to parse other formats
        let dateStr = "";
        if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
          dateStr = rawDate.slice(0, 10);
        } else {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString().slice(0, 10);
        }
        if (!dateStr) continue;
        const rawTitle = r.cells[lk.titleCol] as string | undefined;
        const rawColor = lk.colorCol ? (r.cells[lk.colorCol] as string | undefined) : undefined;
        events.push({
          id: `linked-${lk.tableId}-${r.id}`,
          date: dateStr,
          title: rawTitle || "(untitled)",
          color: rawColor || fallback,
          feedId: `table:${lk.tableId}`,
        });
      }
    }
    return events;
  }, [links, linkedSourceItems, accent]);

  const allEvents = [...localEvents, ...feedEvents, ...linkedSourceEvents];

  const eventsOnDate = (key: string) => allEvents.filter(e => e.date === key).sort((a,b) => (a.startTime ?? "00:00").localeCompare(b.startTime ?? "00:00"));

  const tKey = todayKey();
  const isToday = (key: string) => key === tKey;

  const saveEvent = (ev: CalendarEvent) => {
    if (ev.feedId) return;
    const existing = localEvents.find(e => e.id === ev.id);
    if (existing) upd({ calendarEvents: localEvents.map(e => e.id === ev.id ? ev : e) });
    else upd({ calendarEvents: [...localEvents, ev] });
    setPopup(null);
  };
  const deleteEvent = (id: string) => upd({ calendarEvents: localEvents.filter(e => e.id !== id) });

  const navPrev = () => {
    if (view === "month") { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }
    else if (view === "week") { setViewWeekStart(d => { const nd = new Date(d); nd.setDate(nd.getDate()-7); return nd; }); }
    else { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }
  };
  const navNext = () => {
    if (view === "month") { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }
    else if (view === "week") { setViewWeekStart(d => { const nd = new Date(d); nd.setDate(nd.getDate()+7); return nd; }); }
    else { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (mondayFirst ? (dow === 0 ? 6 : dow - 1) : dow));
    setViewWeekStart(d);
  };

  const navLabel = () => {
    if (view === "week") {
      const end = new Date(viewWeekStart); end.setDate(end.getDate()+6);
      return `${MONTH_NAMES_SHORT[viewWeekStart.getMonth()]} ${viewWeekStart.getDate()} – ${viewWeekStart.getMonth() !== end.getMonth() ? MONTH_NAMES_SHORT[end.getMonth()]+" " : ""}${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  };

  const dayKey = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

  // Upcoming for collapsed
  const upcoming = [...allEvents].filter(e => e.date >= tKey).sort((a,b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")).slice(0,4);

  if (collapsed) {
    return (
      <div className="flex flex-col gap-1" style={{ fontFamily, fontSize, color: fontColor ?? undefined }}>
        {upcoming.length === 0
          ? <span className="text-xs text-[var(--text-muted)]">No upcoming events</span>
          : upcoming.map(e => (
            <div key={e.id} className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: e.color ?? accent }} />
              <span className="text-xs truncate text-[var(--text-primary)]">{e.title}</span>
              {e.startTime && <span className="text-[10px] text-[var(--text-muted)] shrink-0">{fmtTime(e.startTime)}</span>}
              <span className="ml-auto text-[11px] text-[var(--text-muted)] flex-shrink-0">{e.date.slice(5)}</span>
            </div>
          ))
        }
      </div>
    );
  }

  // ── Month view ──
  const dayLabels = mondayFirst ? DAY_LABELS_MON : DAY_LABELS_SUN;
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let startDow = firstOfMonth.getDay();
  if (mondayFirst) startDow = (startDow + 6) % 7;
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) { const d = i - startDow + 1; cells.push(d >= 1 && d <= daysInMonth ? d : null); }
  const isWeekendCell = (i: number) => { const dow = i % 7; return mondayFirst ? dow >= 5 : dow === 0 || dow === 6; };
  const colCount = showWeekends ? 7 : 5;
  const visibleDayLabels = showWeekends ? dayLabels : dayLabels.filter((_,i) => !(mondayFirst ? i >= 5 : i === 0 || i === 6));
  const visibleCells = showWeekends ? cells.map((d,i) => ({d,i})) : cells.map((d,i) => ({d,i})).filter(({i}) => !isWeekendCell(i));

  // ── Week view ──
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) { const d = new Date(viewWeekStart); d.setDate(d.getDate()+i); weekDays.push(d); }
  const visibleWeekDays = showWeekends ? weekDays : weekDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6);

  // ── Agenda view ──
  const agendaStart = new Date(viewYear, viewMonth, 1);
  const agendaEnd = new Date(viewYear, viewMonth + 1, 0);
  const agendaDays: string[] = [];
  for (let d = new Date(agendaStart); d <= agendaEnd; d.setDate(d.getDate()+1)) agendaDays.push(dayKey(new Date(d)));
  const agendaEvents = agendaDays.map(k => ({ key: k, events: eventsOnDate(k) })).filter(x => x.events.length > 0);

  const containerStyle: React.CSSProperties = { fontFamily: fontFamily ?? "inherit", fontSize, color: fontColor ?? "var(--text-primary)", borderRadius: br };

  const CellBg = ({ weekend }: { weekend?: boolean }) => {
    const bgImg = weekend ? (item.calendarWeekendBgImage ?? item.calendarCellBgImage) : item.calendarCellBgImage;
    const bgSize = weekend ? (item.calendarWeekendBgImageSize ?? item.calendarCellBgImageSize ?? "cover") : (item.calendarCellBgImageSize ?? "cover");
    const bgOpacity = weekend ? (item.calendarWeekendBgImageOpacity ?? item.calendarCellBgImageOpacity ?? 100) : (item.calendarCellBgImageOpacity ?? 100);
    if (!bgImg) return null;
    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${bgImg})`, backgroundSize: bgSize, backgroundPosition: "center", opacity: bgOpacity / 100, pointerEvents: "none" }} />
    );
  };

  return (
    <div className="relative flex h-full flex-col select-none overflow-hidden" style={containerStyle} onClick={() => setShowDatePicker(false)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* Background */}
      {item.calendarBgColor && <div style={{ position:"absolute", inset:0, zIndex:0, backgroundColor: item.calendarBgColor, borderRadius: br, opacity: (item.calendarBgOpacity??100)/100, pointerEvents:"none" }} />}
      {item.calendarBgImage && <div style={{ position:"absolute", inset:0, zIndex:0, backgroundImage:`url(${item.calendarBgImage})`, backgroundSize: item.calendarBgImageSize??"cover", backgroundPosition:"center", borderRadius: br, opacity:(item.calendarBgImageOpacity??100)/100, pointerEvents:"none" }} />}

      {/* Popup */}
      {popup && <EventPopup event={popup.event} date={popup.date} accent={accent} onSave={saveEvent} onDelete={deleteEvent} onClose={() => setPopup(null)} isFinished={isFinished} boardId={boardId} itemId={item.id} />}

      {/* Month/year picker — rendered at container level to escape nav overflow:hidden */}
      {showDatePicker && (
        <div className="absolute top-9 left-1/2 -translate-x-1/2 z-[60] rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl p-3 w-56" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setViewYear(y => y - 1)} className="rounded p-1 hover:bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">‹</button>
            <span className="font-semibold text-sm text-[var(--text-primary)]">{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="rounded p-1 hover:bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">›</button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES_SHORT.map((m, mi) => (
              <button key={m} onClick={() => { setViewMonth(mi); setShowDatePicker(false); }}
                className={cn("rounded py-1 text-xs transition-colors", viewMonth === mi ? "text-white font-semibold" : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)]")}
                style={viewMonth === mi ? { background: accent } : {}}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div className="relative flex items-center gap-1 px-2 py-1.5 shrink-0 border-b border-[var(--border)] overflow-hidden" style={{ zIndex:1, background: item.calendarHeaderBgColor ?? "transparent" }}>
        {item.calendarHeaderBgImage && <div style={{ position:"absolute", inset:0, zIndex:0, backgroundImage:`url(${item.calendarHeaderBgImage})`, backgroundSize: item.calendarHeaderBgImageSize ?? "cover", backgroundPosition:"center", opacity:(item.calendarHeaderBgImageOpacity??100)/100, pointerEvents:"none" }} />}
        <button onClick={navPrev} className="relative z-[1] rounded p-1 hover:bg-[var(--surface-overlay)] transition-colors text-sm leading-none" style={{ color: fontColor ? fontColor+"99" : "var(--text-muted)" }}>‹</button>
        <button onClick={navNext} className="relative z-[1] rounded p-1 hover:bg-[var(--surface-overlay)] transition-colors text-sm leading-none" style={{ color: fontColor ? fontColor+"99" : "var(--text-muted)" }}>›</button>
        <div className="relative z-[1] flex-1 flex justify-center">
          <button onClick={e => { e.stopPropagation(); setShowDatePicker(v => !v); }}
            className="font-semibold rounded px-2 py-0.5 hover:bg-[var(--surface-overlay)] transition-colors flex items-center gap-1"
            style={{ color: fontColor ?? "var(--text-primary)" }}>
            {navLabel()} <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
          </button>
        </div>
        <button onClick={goToday} className="relative z-[1] rounded px-1.5 py-0.5 text-[10px] border transition-colors" style={{ color: fontColor ? fontColor+"99" : "var(--text-muted)", borderColor: fontColor ? fontColor+"30" : "var(--border)" }}>Today</button>
        {/* View switcher */}
        <div className="relative z-[1] flex rounded border overflow-hidden text-[10px]" style={{ borderColor: fontColor ? fontColor+"30" : "var(--border)" }}>
          {(["month","week","agenda"] as const).map(v => (
            <button key={v} onClick={() => upd({ calendarView: v })}
              className="px-1.5 py-0.5 capitalize transition-colors"
              style={view === v ? { background: accent, color: "#fff" } : { color: fontColor ? fontColor+"80" : "var(--text-muted)" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Month ── */}
      {view === "month" && (() => {
        const numWeeks = visibleCells.length / colCount;
        const rowTemplate = `auto repeat(${numWeeks}, 1fr)`;
        const sepColor = `color-mix(in srgb, ${fontColor ?? "#ffffff"} 12%, transparent)`;
        return (
          <div className="relative flex-1 min-h-0" style={{ zIndex: 1 }}>
            <div className="h-full grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)`, gridTemplateRows: rowTemplate }}>
              {/* Day-of-week headers */}
              {visibleDayLabels.map((l, hi) => (
                <div key={l} className="flex items-center justify-center py-1 font-semibold uppercase tracking-wide"
                  style={{ fontSize: fontSize - 2, color: fontColor ? fontColor+"99" : "var(--text-muted)", borderRight: hi < colCount - 1 ? `1px solid ${sepColor}` : undefined, borderBottom: `1px solid ${sepColor}`, background: item.calendarHeaderBgColor ?? "transparent" }}>
                  {l}
                </div>
              ))}
              {/* Day cells */}
              {visibleCells.map(({ d, i }) => {
                const key = d ? `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}` : `empty-${i}`;
                const dayEvs = d ? eventsOnDate(key) : [];
                const weekend = isWeekendCell(i);
                const col = (i % colCount);
                const isLastCol = col === colCount - 1;
                const row = Math.floor(i / colCount);
                const isLastRow = row === numWeeks - 1;
                return (
                  <div key={key}
                    className={cn("relative flex flex-col overflow-hidden cursor-pointer group/day transition-colors", !d && "pointer-events-none")}
                    style={{
                      background: d ? (weekend && item.calendarWeekendBgColor ? item.calendarWeekendBgColor : (item.calendarCellBgColor ?? "transparent")) : "transparent",
                      opacity: d ? 1 : 0,
                      borderRight: !isLastCol ? `1px solid ${sepColor}` : undefined,
                      borderBottom: !isLastRow ? `1px solid ${sepColor}` : undefined,
                    }}
                    onClick={() => { if (!d || isFinished) return; setPopup({ event: null, date: key }); }}
                  >
                    {d && <CellBg weekend={weekend} />}
                    {d && (
                      <>
                        <div className="relative z-[1] flex items-center justify-between px-1 pt-0.5 shrink-0">
                          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full font-medium"
                            style={{ fontSize: fontSize - 1, background: isToday(key) ? todayColor : "transparent", color: isToday(key) ? "#fff" : (fontColor ?? "var(--text-secondary)") }}>
                            {d}
                          </span>
                          {!isFinished && <span className="opacity-0 group-hover/day:opacity-100 transition-opacity" style={{ fontSize: 12, color: accent, lineHeight: 1 }}>+</span>}
                        </div>
                        <div className="relative z-[1] flex flex-col gap-px px-0.5 pb-0.5 flex-1 overflow-hidden">
                          {dayEvs.slice(0, 3).map(e => (
                            <button key={e.id} onClick={ev => { ev.stopPropagation(); setPopup({ event: e, date: null }); }}
                              className="flex items-center gap-0.5 w-full rounded px-1 text-left leading-tight hover:brightness-110 transition-all truncate shrink-0"
                              style={{ background: (e.color??accent)+"28", color: e.color??accent, fontSize: fontSize - 2, paddingTop: 1, paddingBottom: 1 }}>
                              {e.startTime && <span className="shrink-0" style={{ fontSize: fontSize - 3 }}>{fmtTime(e.startTime)}</span>}
                              <span className="truncate">{e.title}</span>
                            </button>
                          ))}
                          {dayEvs.length > 3 && <span className="shrink-0" style={{ fontSize: fontSize - 3, color: fontColor ? fontColor+"70" : "var(--text-muted)" }}>+{dayEvs.length - 3} more</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Week ── */}
      {view === "week" && (() => {
        const sepColor = `color-mix(in srgb, ${fontColor ?? "#ffffff"} 12%, transparent)`;
        return (
          <div className="relative flex-1 min-h-0" style={{ zIndex: 1 }}>
            <div className="h-full grid" style={{ gridTemplateColumns: `repeat(${visibleWeekDays.length}, 1fr)`, gridTemplateRows: "auto 1fr" }}>
              {/* Headers row */}
              {visibleWeekDays.map((dt, wi) => {
                const key = dayKey(dt);
                const isTod = isToday(key);
                const isLastCol = wi === visibleWeekDays.length - 1;
                return (
                  <div key={`h-${key}`} className="flex flex-col items-center py-1 shrink-0"
                    style={{ background: item.calendarHeaderBgColor ?? "transparent", borderRight: !isLastCol ? `1px solid ${sepColor}` : undefined, borderBottom: `1px solid ${sepColor}` }}>
                    <span style={{ fontSize: fontSize - 2, color: fontColor ? fontColor+"80" : "var(--text-muted)" }}>{DAY_LABELS_SUN_SHORT[dt.getDay()]}</span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold"
                      style={{ fontSize: fontSize + 1, background: isTod ? todayColor : "transparent", color: isTod ? "#fff" : (fontColor ?? "var(--text-primary)") }}>
                      {dt.getDate()}
                    </span>
                  </div>
                );
              })}
              {/* Content row */}
              {visibleWeekDays.map((dt, wi) => {
                const key = dayKey(dt);
                const dayEvs = eventsOnDate(key);
                const isTod = isToday(key);
                const isWknd = dt.getDay() === 0 || dt.getDay() === 6;
                const isLastCol = wi === visibleWeekDays.length - 1;
                return (
                  <div key={`c-${key}`} className="relative flex flex-col overflow-y-auto cursor-pointer group/wday"
                    style={{ background: isWknd && item.calendarWeekendBgColor ? item.calendarWeekendBgColor : (item.calendarCellBgColor ?? "transparent"), borderRight: !isLastCol ? `1px solid ${sepColor}` : undefined }}
                    onClick={() => { if (isFinished) return; setPopup({ event: null, date: key }); }}>
                    <CellBg weekend={isWknd} />
                    <div className="relative z-[1] flex flex-col gap-0.5 p-1">
                      {dayEvs.map(e => (
                        <button key={e.id} onClick={ev => { ev.stopPropagation(); setPopup({ event: e, date: null }); }}
                          className="w-full text-left rounded px-1.5 py-1 leading-tight hover:brightness-110 transition-all"
                          style={{ background: (e.color??accent)+"28", color: e.color??accent, fontSize: fontSize - 1 }}>
                          {e.startTime && <span className="block" style={{ fontSize: fontSize - 2 }}>{fmtTime(e.startTime)}{e.endTime ? ` – ${fmtTime(e.endTime)}` : ""}</span>}
                          <span className="font-medium truncate block">{e.title}</span>
                        </button>
                      ))}
                      {!isFinished && <div className="opacity-0 group-hover/wday:opacity-100 transition-opacity flex justify-center pt-1" style={{ fontSize: fontSize - 1, color: accent }}>+</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Agenda ── */}
      {view === "agenda" && (
        <div className="relative flex-1 overflow-auto p-2 flex flex-col gap-3" style={{ zIndex:1 }}>
          {agendaEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: fontColor ? fontColor+"60" : "var(--text-muted)" }}>
              <span style={{ fontSize: 28 }}>📅</span>
              <span style={{ fontSize }}>No events in {MONTH_NAMES[viewMonth]}</span>
            </div>
          ) : agendaEvents.map(({ key, events: evs }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("font-semibold")} style={{ fontSize: fontSize + 1, color: isToday(key) ? todayColor : (fontColor ?? "var(--text-primary)") }}>{dateLabel(key)}</span>
                {isToday(key) && <span className="rounded-full px-1.5 py-0 text-white text-[10px] font-medium" style={{ background: todayColor }}>Today</span>}
              </div>
              <div className="flex flex-col gap-1 pl-2 border-l-2" style={{ borderColor: accent+"40" }}>
                {evs.map(e => (
                  <button key={e.id} onClick={() => setPopup({ event: e, date: null })}
                    className="flex items-start gap-2 w-full text-left rounded-lg px-2 py-1.5 hover:bg-[var(--surface-overlay)] transition-colors group/ev">
                    <span className="h-2 w-2 rounded-full mt-1 shrink-0" style={{ background: e.color ?? accent }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ fontSize, color: fontColor ?? "var(--text-primary)" }}>{e.title}</p>
                      {(e.startTime || e.location) && (
                        <p style={{ fontSize: fontSize - 1, color: fontColor ? fontColor+"80" : "var(--text-muted)" }}>
                          {e.startTime && fmtTime(e.startTime)}{e.endTime && ` – ${fmtTime(e.endTime)}`}{e.location && ` · ${e.location}`}
                        </p>
                      )}
                      {e.description && <p className="truncate" style={{ fontSize: fontSize - 1, color: fontColor ? fontColor+"60" : "var(--text-muted)" }}>{e.description}</p>}
                    </div>
                    {!isFinished && !e.feedId && <span className="opacity-0 group-hover/ev:opacity-100 text-red-400 text-xs transition-opacity" onClick={ev => { ev.stopPropagation(); deleteEvent(e.id); }}>✕</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!isFinished && (
            <button onClick={() => setPopup({ event: null, date: tKey })} className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-1" style={{ fontSize }}>
              <Plus size={12} /> Add event
            </button>
          )}
        </div>
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            { label: "Go to today", icon: <CalendarDays size={14} />, onClick: goToday },
            ...(!isFinished && localEvents.length > 0 ? ["separator" as const, { label: "Clear all events", icon: <Trash2 size={14} />, danger: true, onClick: () => upd({ calendarEvents: [] }) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ─── Calendar feed fetching + syncing ─────────────────────────────────────────

const FEED_REFRESH_MS = 30 * 60 * 1000; // auto-refresh cadence & staleness threshold

/** Fetch an iCal feed's raw text — direct first, CORS proxy as fallback. */
async function fetchFeedText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (r.ok) return await r.text();
  } catch { /* fall through to proxy */ }
  const r = await fetch(`/api/proxy-ical?url=${encodeURIComponent(url)}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

/**
 * Sync a set of feeds in one batch and write results with a single `upd`, so
 * concurrent per-feed writes can't clobber each other. Successful feeds get fresh
 * events + lastSyncedAt; failed feeds keep their cached events + record lastError.
 */
async function syncFeedsBatch(
  targets: CalendarFeed[],
  baseEvents: CalendarEvent[],
  baseFeeds: CalendarFeed[],
  upd: (p: Partial<BlockItem>) => void,
): Promise<void> {
  const feeds = targets.filter(f => f.enabled);
  if (!feeds.length) return;
  const outcomes = await Promise.all(feeds.map(async (f) => {
    try { return { id: f.id, events: parseIcs(await fetchFeedText(f.url), f.id, f.color), error: undefined as string | undefined }; }
    catch (e) { return { id: f.id, events: null as CalendarEvent[] | null, error: e instanceof Error ? e.message : "Failed" }; }
  }));

  const syncedIds = new Set(feeds.map(f => f.id));
  let events = baseEvents.filter(e => !syncedIds.has(e.feedId ?? ""));
  for (const o of outcomes) {
    events = o.events ? [...events, ...o.events] : [...events, ...baseEvents.filter(e => e.feedId === o.id)];
  }
  const now = Date.now();
  const feedsNext = baseFeeds.map((f) => {
    const o = outcomes.find(x => x.id === f.id);
    if (!o) return f;
    return o.error ? { ...f, lastError: o.error } : { ...f, lastSyncedAt: now, lastError: undefined };
  });
  upd({ calendarFeedEvents: events, calendarFeeds: feedsNext });
}

// ─── Calendar Style Panel ─────────────────────────────────────────────────────

function useCalendarFeedSync(item: BlockItem, upd: (p: Partial<BlockItem>) => void) {
  const feeds: CalendarFeed[] = item.calendarFeeds ?? [];
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const syncFeed = useCallback(async (feed: CalendarFeed) => {
    setSyncing(s => ({ ...s, [feed.id]: true }));
    setErrors(e => { const n = { ...e }; delete n[feed.id]; return n; });
    try {
      const text = await fetchFeedText(feed.url);
      const parsed = parseIcs(text, feed.id, feed.color);
      const otherEvents = (item.calendarFeedEvents ?? []).filter(e => e.feedId !== feed.id);
      const feedsNext = (item.calendarFeeds ?? []).map(f => f.id === feed.id ? { ...f, lastSyncedAt: Date.now(), lastError: undefined } : f);
      upd({ calendarFeedEvents: [...otherEvents, ...parsed], calendarFeeds: feedsNext });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      setErrors(e => ({ ...e, [feed.id]: msg }));
      const feedsNext = (item.calendarFeeds ?? []).map(f => f.id === feed.id ? { ...f, lastError: msg } : f);
      upd({ calendarFeeds: feedsNext });
    } finally {
      setSyncing(s => ({ ...s, [feed.id]: false }));
    }
  }, [feeds, item.calendarFeedEvents, item.calendarFeeds, upd]);

  return { syncing, errors, syncFeed };
}

/**
 * Manage a public ICS subscription URL for this calendar (board → .ics). Owners
 * enable a random-token feed external calendar apps can subscribe to; the token
 * is created/revoked via RLS-guarded rows in calendar_subscriptions.
 */
function CalendarSubscribeSection({ boardId, itemId }: { boardId: string; itemId: string }) {
  const { identity } = useUser();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from("calendar_subscriptions").select("token").eq("board_id", boardId).eq("item_id", itemId).maybeSingle()
      .then(({ data }) => { if (active) { setToken((data?.token as string) ?? null); setLoading(false); } });
    return () => { active = false; };
  }, [boardId, itemId]);

  const enable = async () => {
    setBusy(true);
    const { data } = await supabase.from("calendar_subscriptions")
      .insert({ board_id: boardId, item_id: itemId, created_by: identity.userId }).select("token").single();
    if (data?.token) setToken(data.token as string);
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    await supabase.from("calendar_subscriptions").delete().eq("board_id", boardId).eq("item_id", itemId);
    setToken(null);
    setBusy(false);
  };
  const regenerate = async () => {
    setBusy(true);
    await supabase.from("calendar_subscriptions").delete().eq("board_id", boardId).eq("item_id", itemId);
    const { data } = await supabase.from("calendar_subscriptions")
      .insert({ board_id: boardId, item_id: itemId, created_by: identity.userId }).select("token").single();
    setToken((data?.token as string) ?? null);
    setBusy(false);
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const httpsUrl = token ? `${origin}/api/calendar/${token}.ics` : "";
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");

  const copy = () => {
    void navigator.clipboard?.writeText(httpsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Subscribe</p>
      <p className="mb-2 text-[10px] text-[var(--text-muted)]">A live feed URL that stays in sync — add it in Google/Apple/Outlook to see this board&apos;s events on your phone.</p>
      {loading ? (
        <p className="text-[10px] text-[var(--text-muted)]">…</p>
      ) : token ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input readOnly value={httpsUrl} onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)] outline-none" />
            <button onClick={copy} className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="flex items-center gap-2">
            <a href={webcalUrl} className="text-[11px] font-medium text-[var(--accent)] hover:underline">Subscribe in calendar app</a>
            <span className="ml-auto flex gap-2">
              <button onClick={regenerate} disabled={busy} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40">Regenerate</button>
              <button onClick={revoke} disabled={busy} className="text-[10px] text-[var(--text-muted)] hover:text-red-400 disabled:opacity-40">Revoke</button>
            </span>
          </div>
          <p className="text-[10px] text-orange-400/80">Anyone with this link can view the board&apos;s events. Regenerate to invalidate the old URL.</p>
        </div>
      ) : (
        <button onClick={enable} disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--border)] py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40">
          <Link2 size={12} /> Enable subscription URL
        </button>
      )}
    </section>
  );
}

export function CalendarStylePanel({ item, upd, boardId, boxId }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; boardId?: string; boxId?: string }) {
  const events: CalendarEvent[] = item.calendarEvents ?? [];
  const feeds: CalendarFeed[] = item.calendarFeeds ?? [];
  const accent = item.calendarAccentColor ?? "#d59ee8";
  const { syncing, errors, syncFeed } = useCalendarFeedSync(item, upd);
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedColor, setNewFeedColor] = useState("#d59ee8");
  const fileRef = useRef<HTMLInputElement>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);
  const cellBgFileRef = useRef<HTMLInputElement>(null);
  const wkndCellBgFileRef = useRef<HTMLInputElement>(null);

  // All linkable source items in this box (tables, kanbans, lists) — top-level hook
  const linkableItems = useBoardStore(useShallow(s => {
    if (!boardId) return [] as BlockItem[];
    const board = s.boards.find(b => b.id === boardId) ?? s.serverBoards[boardId];
    if (!board) return [] as BlockItem[];
    // In a block: sibling items. On the canvas: the board's other canvas items.
    const pool: BlockItem[] = boxId
      ? (board.boxes.find(b => b.id === boxId)?.items ?? [])
      : (board.boardItems ?? []);
    return pool.filter(i => i.type === "table" || i.type === "kanban" || i.type === "list");
  }));
  const sourceLabel = (i: BlockItem) =>
    i.type === "table" ? `${i.tableTitle || "Untitled table"} (table)`
    : i.type === "kanban" ? `Kanban (${(i.kanbanCards ?? []).length} cards)`
    : `${i.listTitle || "Untitled list"} (list)`;

  // Current multi-link config (migrate legacy single-link on the fly)
  const links: TableLink[] = useMemo(() => {
    const arr = item.calendarLinkedTables ?? [];
    if (arr.length > 0) return arr;
    if (item.calendarLinkedTableId && item.calendarLinkedDateCol && item.calendarLinkedTitleCol) {
      return [{ id: "legacy", tableId: item.calendarLinkedTableId, dateCol: item.calendarLinkedDateCol, titleCol: item.calendarLinkedTitleCol, colorCol: item.calendarLinkedColorCol, color: accent }];
    }
    return [];
  }, [item.calendarLinkedTables, item.calendarLinkedTableId, item.calendarLinkedDateCol, item.calendarLinkedTitleCol, item.calendarLinkedColorCol, accent]);

  const updLinks = (next: TableLink[]) => upd({ calendarLinkedTables: next, calendarLinkedTableId: undefined, calendarLinkedDateCol: undefined, calendarLinkedTitleCol: undefined, calendarLinkedColorCol: undefined });
  const addLink = () => updLinks([...links, { id: crypto.randomUUID(), tableId: "", dateCol: "", titleCol: "", color: accent }]);
  const removeLink = (id: string) => updLinks(links.filter(l => l.id !== id));
  const patchLink = (id: string, patch: Partial<TableLink>) => updLinks(links.map(l => l.id === id ? { ...l, ...patch } : l));

  const addFeed = () => {
    if (!newFeedUrl.trim()) return;
    const feed: CalendarFeed = { id: crypto.randomUUID(), name: newFeedName.trim() || "Calendar", url: newFeedUrl.trim(), color: newFeedColor, enabled: true };
    const updated = [...feeds, feed];
    upd({ calendarFeeds: updated });
    setNewFeedUrl(""); setNewFeedName("");
    syncFeed(feed);
  };

  const removeFeed = (id: string) => {
    upd({ calendarFeeds: feeds.filter(f => f.id !== id), calendarFeedEvents: (item.calendarFeedEvents ?? []).filter(e => e.feedId !== id) });
  };

  const handleBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    applyImageUpload(file, (url) => upd({ calendarBgImage: url }));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">

      {/* Linked items */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Linked Items</p>
          {boardId && linkableItems.length > 0 && (
            <button onClick={addLink}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-[var(--accent)] text-white hover:opacity-80 transition-opacity">
              <Plus size={9} /> Add link
            </button>
          )}
        </div>
        <p className="mb-2 text-[10px] text-[var(--text-muted)]">Show table rows, kanban cards, and list entries with due dates as calendar events. Sources must live {boxId ? "in the same block" : "on the board"} as the calendar.</p>
        {!boardId ? (
          <p className="text-[10px] text-orange-400/80">Item linking is unavailable here.</p>
        ) : linkableItems.length === 0 ? (
          <p className="text-[10px] text-orange-400/80">No table, kanban, or list items {boxId ? "in this block" : "on the board"} yet. Add one first.</p>
        ) : links.length === 0 ? (
          <button onClick={addLink}
            className="w-full rounded border border-dashed border-[var(--border)] py-2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors">
            + Link an item
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            {links.map((lk, idx) => {
              const linkedSource = linkableItems.find(t => t.id === lk.tableId);
              const linkKind = lk.kind ?? "table";
              const linkedTable = linkKind === "table" ? linkedSource : undefined;
              const cols = linkedTable?.tableColumns ?? [];
              const dateCols = cols.filter(c => c.type === "date" || c.type === "text");
              const textCols = cols.filter(c => c.type === "text" || c.type === "select");
              const colorCols = cols.filter(c => c.type === "text" || c.type === "select");
              const dueCount = linkedSource && linkKind === "kanban"
                ? (linkedSource.kanbanCards ?? []).filter(c => c.due).length
                : linkedSource && linkKind === "list"
                  ? (linkedSource.listItems ?? []).filter(e => e.due).length
                  : 0;
              return (
                <div key={lk.id} className="rounded-lg border border-[var(--border)] p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold shrink-0">#{idx + 1}</span>
                    <select value={lk.tableId}
                      onChange={e => {
                        const src = linkableItems.find(t => t.id === e.target.value);
                        patchLink(lk.id, { tableId: e.target.value, kind: (src?.type as SourceLink["kind"]) ?? "table", dateCol: "", titleCol: "", colorCol: undefined });
                      }}
                      className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none">
                      <option value="">— Pick item —</option>
                      {linkableItems.map(t => <option key={t.id} value={t.id}>{sourceLabel(t)}</option>)}
                    </select>
                    <button onClick={() => removeLink(lk.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"><XIcon size={11} /></button>
                  </div>
                  {linkedSource && linkKind !== "table" && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-10 shrink-0 text-[11px]">Color</span>
                        <input type="color" value={lk.color ?? accent} onChange={e => patchLink(lk.id, { color: e.target.value })}
                          title="Event color" className="h-6 w-6 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5" />
                        <span className="text-[10px] text-[var(--text-muted)]">{linkKind === "kanban" ? "Cards keep their own color if set" : "Applied to all entries"}</span>
                      </div>
                      <p className={cn("text-[10px]", dueCount > 0 ? "text-green-400/80" : "text-[var(--text-muted)]")}>
                        {dueCount > 0
                          ? `✓ ${dueCount} ${linkKind === "kanban" ? "card(s)" : "entr(ies)"} with a due date`
                          : `No due dates set yet — ${linkKind === "kanban" ? "add one from a card's edit dialog" : "use the calendar button on a list row"}`}
                      </p>
                    </>
                  )}
                  {linkedTable && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-10 shrink-0 text-[11px]">Date</span>
                        <select value={lk.dateCol} onChange={e => patchLink(lk.id, { dateCol: e.target.value })}
                          className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none">
                          <option value="">— Pick —</option>
                          {dateCols.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-10 shrink-0 text-[11px]">Title</span>
                        <select value={lk.titleCol} onChange={e => patchLink(lk.id, { titleCol: e.target.value })}
                          className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none">
                          <option value="">— Pick —</option>
                          {textCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-10 shrink-0 text-[11px]">Color</span>
                        <select value={lk.colorCol ?? ""} onChange={e => patchLink(lk.id, { colorCol: e.target.value || undefined })}
                          className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none">
                          <option value="">— None —</option>
                          {colorCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input type="color" value={lk.color ?? accent} onChange={e => patchLink(lk.id, { color: e.target.value })}
                          title="Fallback color" className="h-6 w-6 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5" />
                      </div>
                      {lk.dateCol && lk.titleCol && (
                        <p className="text-[10px] text-green-400/80">✓ {(linkedTable.tableRows ?? []).length} row(s)</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* External Calendars */}
      <section>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">External Calendars</p>
        <p className="mb-2 text-[10px] text-[var(--text-muted)]">Paste a public iCal (.ics) URL — works with Google Calendar, Apple Calendar, Outlook, and any iCal source.</p>

        {feeds.map(f => (
          <div key={f.id} className="mb-2 rounded-lg border border-[var(--border)] p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: f.color }} />
              <span className="flex-1 font-medium text-[var(--text-primary)] truncate">{f.name}</span>
              <button onClick={() => syncFeed(f)} disabled={syncing[f.id]}
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 text-[10px]">
                {syncing[f.id] ? "⟳" : "↻"} Sync
              </button>
              <button onClick={() => removeFeed(f.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] truncate">{f.url}</p>
            {(errors[f.id] || f.lastError) && <p className="text-[10px] text-red-400">{errors[f.id] ?? f.lastError}</p>}
            {(item.calendarFeedEvents ?? []).filter(e => e.feedId === f.id).length > 0 && (
              <p className="text-[10px] text-[var(--text-muted)]">
                {(item.calendarFeedEvents ?? []).filter(e => e.feedId === f.id).length} events loaded
                {f.lastSyncedAt && <span> · synced {fmtRelativeTime(f.lastSyncedAt)}</span>}
              </p>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[var(--border)] p-2">
          <input value={newFeedName} onChange={e => setNewFeedName(e.target.value)} placeholder="Calendar name"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" />
          <input value={newFeedUrl} onChange={e => setNewFeedUrl(e.target.value)} placeholder="iCal URL (https://…)"
            onKeyDown={e => e.key === "Enter" && addFeed()}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" />
          <div className="flex items-center gap-2">
            <span className="relative h-5 w-5 rounded-full border border-white/20 overflow-hidden shrink-0" style={{ background: newFeedColor }}>
              <input type="color" value={newFeedColor} onChange={e => setNewFeedColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </span>
            <button onClick={addFeed} disabled={!newFeedUrl.trim()}
              className="flex-1 rounded py-1 text-[11px] font-medium text-white disabled:opacity-40 transition-colors" style={{ background: accent }}>
              + Add calendar
            </button>
          </div>
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">How to get your iCal URL ▾</summary>
          <div className="mt-1.5 rounded border border-[var(--border)] p-2 flex flex-col gap-1.5 text-[10px] text-[var(--text-muted)]">
            <p><strong className="text-[var(--text-secondary)]">Google Calendar:</strong> Settings → your calendar → "Secret address in iCal format"</p>
            <p><strong className="text-[var(--text-secondary)]">Apple Calendar:</strong> File → Export, or share a public calendar to get its URL</p>
            <p><strong className="text-[var(--text-secondary)]">Outlook:</strong> Settings → Calendar → Shared calendars → Publish → ICS link</p>
            <p className="text-orange-400/80">Note: Calendar must be public or use a secret key URL. Private calendars require authentication not supported here.</p>
          </div>
        </details>
      </section>

      {/* Export */}
      <section>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Export</p>
        <p className="mb-2 text-[10px] text-[var(--text-muted)]">Download this board&apos;s own events as a .ics file to import into Google, Apple, or Outlook Calendar.</p>
        <button
          onClick={() => downloadIcs(events, "Crecoard Calendar")}
          disabled={events.length === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--border)] py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
        >
          <FileDown size={12} /> Export .ics{events.length > 0 ? ` (${events.length})` : ""}
        </button>
      </section>

      {/* Subscribe (live feed URL) */}
      {boardId && <CalendarSubscribeSection boardId={boardId} itemId={item.id} />}

      {/* Display */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Display</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.calendarFirstDayMonday ?? false} onChange={e => upd({ calendarFirstDayMonday: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Week starts Monday</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.calendarShowWeekends !== false} onChange={e => upd({ calendarShowWeekends: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Show weekends</span>
          </label>
        </div>
      </section>

      {/* Colors */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Colors</p>
        <div className="flex flex-col gap-2">
          {[
            { label: "Accent / today", key: "calendarAccentColor" as const, default: "#d59ee8" },
            { label: "Today highlight", key: "calendarTodayColor" as const, default: accent },
            { label: "Header background", key: "calendarHeaderBgColor" as const, default: "#1e1f24" },
            { label: "Cell background", key: "calendarCellBgColor" as const, default: "#1e1f24" },
            { label: "Weekend background", key: "calendarWeekendBgColor" as const, default: "#1a1b20" },
          ].map(({ label, key, default: def }) => (
            <label key={key} className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
              <div className="flex items-center gap-2">
                <span className="relative h-5 w-5 rounded border border-white/15 overflow-hidden shrink-0" style={{ backgroundColor: (item[key] as string | undefined) ?? def }}>
                  <input type="color" value={(item[key] as string | undefined) ?? def} onChange={e => upd({ [key]: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-[var(--text-secondary)]">{label}</span>
              </div>
              {item[key] && <button onClick={() => upd({ [key]: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
            </label>
          ))}
        </div>
      </section>

      {/* Header image */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Header image</p>
        <div className="flex flex-col gap-1.5">
          <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Image URL…" value={item.calendarHeaderBgImage?.startsWith("data:") ? "" : (item.calendarHeaderBgImage ?? "")}
            onChange={e => upd({ calendarHeaderBgImage: e.target.value || undefined })} />
          <div className="flex gap-1.5">
            <button onClick={() => headerFileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-[var(--border)] py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              <Upload size={10} /> Upload
            </button>
            {item.calendarHeaderBgImage && <button onClick={() => upd({ calendarHeaderBgImage: undefined })} className="rounded border border-[var(--border)] px-2 text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
          </div>
          <input ref={headerFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            applyImageUpload(f, (url) => upd({ calendarHeaderBgImage: url })); e.target.value = "";
          }} />
          {item.calendarHeaderBgImage && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] w-14 shrink-0 text-[11px]">Opacity</span>
                <input type="range" min={0} max={100} value={item.calendarHeaderBgImageOpacity ?? 100} onChange={e => upd({ calendarHeaderBgImageOpacity: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                <span className="w-8 text-right text-[var(--text-muted)] text-[11px]">{item.calendarHeaderBgImageOpacity ?? 100}%</span>
              </div>
              <div className="flex gap-1">
                {(["cover","contain","fill"] as const).map(s => (
                  <button key={s} onClick={() => upd({ calendarHeaderBgImageSize: s })}
                    className={cn("flex-1 rounded py-0.5 text-[10px] border transition-colors", (item.calendarHeaderBgImageSize ?? "cover") === s ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)]")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Cell image */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Cell image</p>
        {([
          { label: "All cells", imgKey: "calendarCellBgImage" as const, sizeKey: "calendarCellBgImageSize" as const, opacityKey: "calendarCellBgImageOpacity" as const, fileRef: cellBgFileRef },
          { label: "Weekend cells", imgKey: "calendarWeekendBgImage" as const, sizeKey: "calendarWeekendBgImageSize" as const, opacityKey: "calendarWeekendBgImageOpacity" as const, fileRef: wkndCellBgFileRef },
        ]).map(({ label, imgKey, sizeKey, opacityKey, fileRef }) => {
          return (
            <div key={imgKey} className="mb-3">
              <p className="text-[10px] text-[var(--text-muted)] mb-1">{label}</p>
              <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] mb-1"
                placeholder="Image URL…" value={item[imgKey]?.startsWith("data:") ? "" : (item[imgKey] ?? "")}
                onChange={e => upd({ [imgKey]: e.target.value || undefined })} />
              <div className="flex gap-1.5 mb-1">
                <button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-[var(--border)] py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  <Upload size={10} /> Upload
                </button>
                {item[imgKey] && <button onClick={() => upd({ [imgKey]: undefined })} className="rounded border border-[var(--border)] px-2 text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                applyImageUpload(f, (url) => upd({ [imgKey]: url })); e.target.value = "";
              }} />
              {item[imgKey] && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)] w-14 shrink-0 text-[11px]">Opacity</span>
                    <input type="range" min={0} max={100} value={item[opacityKey] ?? 100} onChange={e => upd({ [opacityKey]: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                    <span className="w-8 text-right text-[var(--text-muted)] text-[11px]">{item[opacityKey] ?? 100}%</span>
                  </div>
                  <div className="flex gap-1">
                    {(["cover","contain","fill"] as const).map(s => (
                      <button key={s} onClick={() => upd({ [sizeKey]: s })}
                        className={cn("flex-1 rounded py-0.5 text-[10px] border transition-colors", (item[sizeKey] ?? "cover") === s ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)]")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Font */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Font</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FontPicker compact value={item.calendarFontFamily ?? "Inter"} onChange={f => { loadGoogleFont(f); upd({ calendarFontFamily: f }); }} />
            <input type="number" min={8} max={20} value={item.calendarFontSize ?? 11}
              onChange={e => upd({ calendarFontSize: Number(e.target.value) })}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" />
            <span className="text-[11px] text-[var(--text-muted)]">px</span>
          </div>
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/15 overflow-hidden shrink-0" style={{ backgroundColor: item.calendarFontColor ?? "#f2f2f2" }}>
                <input type="color" value={item.calendarFontColor ?? "#f2f2f2"} onChange={e => upd({ calendarFontColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Text color</span>
            </div>
            {item.calendarFontColor && <button onClick={() => upd({ calendarFontColor: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
          </label>
        </div>
      </section>

      {/* Background */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Background</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden shrink-0" style={{ backgroundColor: item.calendarBgColor ?? "transparent" }}>
                <input type="color" value={item.calendarBgColor ?? "#1e1f24"} onChange={e => upd({ calendarBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Fill color</span>
            </div>
            {item.calendarBgColor && <button onClick={() => upd({ calendarBgColor: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
          </label>
          {item.calendarBgColor && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] w-16 shrink-0">Opacity</span>
              <input type="range" min={0} max={100} value={item.calendarBgOpacity ?? 100} onChange={e => upd({ calendarBgOpacity: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="w-8 text-right text-[var(--text-muted)]">{item.calendarBgOpacity ?? 100}%</span>
            </div>
          )}
          <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Wallpaper URL…" value={item.calendarBgImage?.startsWith("data:") ? "" : (item.calendarBgImage ?? "")}
            onChange={e => upd({ calendarBgImage: e.target.value || undefined })} />
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              <Upload size={11} /> Upload
            </button>
            {item.calendarBgImage && <button onClick={() => upd({ calendarBgImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFile} />
          {item.calendarBgImage && (
            <WallpaperEditor url={item.calendarBgImage} size={item.calendarBgImageSize ?? "cover"} position="center" opacity={(item.calendarBgImageOpacity ?? 100) / 100}
              onSizeChange={v => upd({ calendarBgImageSize: v })} onPositionChange={() => {}} onOpacityChange={v => upd({ calendarBgImageOpacity: Math.round(v * 100) })} />
          )}
        </div>
      </section>

      {/* Shape */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Shape</p>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] w-20 shrink-0">Corner radius</span>
          <input type="range" min={0} max={24} value={item.calendarBorderRadius ?? 0} onChange={e => upd({ calendarBorderRadius: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          <span className="w-6 text-right text-[var(--text-muted)]">{item.calendarBorderRadius ?? 0}</span>
        </div>
      </section>

      {/* Events list */}
      <section>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Local events ({events.length})</p>
        {events.length === 0
          ? <p className="text-[var(--text-muted)]">Click a day to add events.</p>
          : (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {[...events].sort((a,b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")).map(e => (
                <div key={e.id} className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: e.color ?? accent }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[var(--text-primary)]">{e.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{e.date}{e.startTime ? ` · ${fmtTime(e.startTime)}` : ""}</p>
                  </div>
                  <button onClick={() => upd({ calendarEvents: events.filter(ev => ev.id !== e.id) })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>
                </div>
              ))}
            </div>
          )
        }
      </section>

    </div>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

const COL_TYPE_ICONS: Record<string, string> = { text: "T", number: "#", checkbox: "☑", select: "▾", date: "📅", url: "🔗", member: "@" };

function idxToColLetter(idx: number): string {
  let result = '';
  let i = idx + 1;
  while (i > 0) {
    result = String.fromCharCode(64 + (i % 26 || 26)) + result;
    i = Math.floor((i - 1) / 26);
  }
  return result;
}
const DEFAULT_COL_TYPES = ["text","number","checkbox","select","date","url","member"] as const;

// ── Formula evaluation engine ─────────────────────────────────────────────────

function colLetterToIndex(s: string): number {
  let n = 0;
  for (const c of s.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function getFormulaCell(ci: number, ri: number, cols: TableColumn[], rows: TableRow[], depth: number): number | string {
  if (depth > 30) return '#CIRC!';
  if (ci < 0 || ci >= cols.length || ri < 0 || ri >= rows.length) return '#REF!';
  const raw = rows[ri].cells[cols[ci].id];
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const s = String(raw ?? '');
  if (s.startsWith('=')) return evalFormula(s.slice(1), cols, rows, depth + 1);
  const n = parseFloat(s);
  return isNaN(n) ? s : n;
}

function expandFormulaRange(token: string, cols: TableColumn[], rows: TableRow[], depth: number): (number | string)[] {
  const r = token.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (r) {
    const c1 = colLetterToIndex(r[1]), r1 = parseInt(r[2]) - 1;
    const c2 = colLetterToIndex(r[3]), r2 = parseInt(r[4]) - 1;
    const vals: (number | string)[] = [];
    for (let ri = Math.min(r1, r2); ri <= Math.max(r1, r2); ri++)
      for (let ci = Math.min(c1, c2); ci <= Math.max(c1, c2); ci++)
        vals.push(getFormulaCell(ci, ri, cols, rows, depth));
    return vals;
  }
  const s = token.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (s) return [getFormulaCell(colLetterToIndex(s[1]), parseInt(s[2]) - 1, cols, rows, depth)];
  return [];
}

function evalFormulaFn(name: string, args: (number | string)[]): number | string {
  const nums = args.map(a => parseFloat(String(a)));
  const validNums = nums.filter(n => !isNaN(n));
  switch (name.toUpperCase()) {
    case 'SUM':         return validNums.reduce((a, b) => a + b, 0);
    case 'AVERAGE': case 'AVG': return validNums.length ? validNums.reduce((a, b) => a + b, 0) / validNums.length : 0;
    case 'COUNT':       return validNums.length;
    case 'COUNTA':      return args.filter(a => String(a).trim() !== '').length;
    case 'MAX':         return validNums.length ? Math.max(...validNums) : 0;
    case 'MIN':         return validNums.length ? Math.min(...validNums) : 0;
    case 'ABS':         return Math.abs(nums[0] || 0);
    case 'ROUND':       return Math.round((nums[0] || 0) * Math.pow(10, nums[1] ?? 0)) / Math.pow(10, nums[1] ?? 0);
    case 'FLOOR':       return Math.floor(nums[0] || 0);
    case 'CEILING': case 'CEIL': return Math.ceil(nums[0] || 0);
    case 'SQRT':        return Math.sqrt(Math.abs(nums[0] || 0));
    case 'POWER':       return Math.pow(nums[0] || 0, nums[1] ?? 1);
    case 'MOD':         return (nums[0] || 0) % (nums[1] || 1);
    case 'INT':         return Math.trunc(nums[0] || 0);
    case 'LEN':         return String(args[0] ?? '').length;
    case 'UPPER':       return String(args[0] ?? '').toUpperCase();
    case 'LOWER':       return String(args[0] ?? '').toLowerCase();
    case 'TRIM':        return String(args[0] ?? '').trim();
    case 'CONCAT': case 'CONCATENATE': return args.map(a => String(a)).join('');
    case 'IF':          return (nums[0] !== 0 && !isNaN(nums[0])) ? (args[1] ?? 0) : (args[2] ?? 0);
    case 'AND':         return validNums.every(n => n !== 0) ? 1 : 0;
    case 'OR':          return validNums.some(n => n !== 0) ? 1 : 0;
    case 'NOT':         return nums[0] !== 0 ? 0 : 1;
    case 'PI':          return Math.PI;
    default:            return '#NAME?';
  }
}

function tokenizeFormula(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < expr.length && expr[j] !== '"') j++;
      tokens.push(expr.slice(i, j + 1)); i = j + 1; continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] ?? ''))) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      tokens.push(expr.slice(i, j)); i = j; continue;
    }
    const two = expr.slice(i, i + 2);
    if (['<>', '<=', '>='].includes(two)) { tokens.push(two); i += 2; continue; }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z]/.test(expr[j])) j++;
      let k = j;
      while (k < expr.length && /\d/.test(expr[k])) k++;
      if (k > j && expr[k] === ':') {
        let m = k + 1;
        while (m < expr.length && /[A-Za-z]/.test(expr[m])) m++;
        while (m < expr.length && /\d/.test(expr[m])) m++;
        tokens.push(expr.slice(i, m)); i = m;
      } else if (k > j) {
        tokens.push(expr.slice(i, k)); i = k;
      } else {
        tokens.push(expr.slice(i, j)); i = j;
      }
      continue;
    }
    tokens.push(ch); i++;
  }
  return tokens;
}

function evalFormula(expr: string, cols: TableColumn[], rows: TableRow[], depth = 0): number | string {
  if (depth > 30) return '#CIRC!';
  try {
    const tokens = tokenizeFormula(expr.trim());
    let pos = 0;
    const cur = () => tokens[pos] ?? '';
    const eat = () => tokens[pos++] ?? '';
    const eatIf = (v: string) => { if (cur() === v) { pos++; return true; } return false; };

    function parseExpr(): number | string { return parseCmp(); }
    function parseCmp(): number | string {
      let l = parseAdd();
      while (['>', '<', '>=', '<=', '=', '<>'].includes(cur())) {
        const op = eat(); const r = parseAdd();
        const ln = Number(l), rn = Number(r);
        if (op === '>') l = ln > rn ? 1 : 0;
        else if (op === '<') l = ln < rn ? 1 : 0;
        else if (op === '>=') l = ln >= rn ? 1 : 0;
        else if (op === '<=') l = ln <= rn ? 1 : 0;
        else if (op === '=') l = (String(l) === String(r)) ? 1 : 0;
        else if (op === '<>') l = (String(l) !== String(r)) ? 1 : 0;
      }
      return l;
    }
    function parseAdd(): number | string {
      let l = parseMul();
      while (['+', '-', '&'].includes(cur())) {
        const op = eat(); const r = parseMul();
        if (op === '&') l = String(l) + String(r);
        else l = op === '+' ? Number(l) + Number(r) : Number(l) - Number(r);
      }
      return l;
    }
    function parseMul(): number | string {
      let l = parseUnary();
      while (['*', '/', '^', '%'].includes(cur())) {
        const op = eat(); const r = parseUnary();
        if (op === '*') l = Number(l) * Number(r);
        else if (op === '/') { if (Number(r) === 0) return '#DIV/0!'; l = Number(l) / Number(r); }
        else if (op === '^') l = Math.pow(Number(l), Number(r));
        else l = Number(l) % Number(r);
      }
      return l;
    }
    function parseUnary(): number | string {
      if (cur() === '-') { eat(); return -Number(parsePrimary()); }
      if (cur() === '+') { eat(); return Number(parsePrimary()); }
      return parsePrimary();
    }
    function parsePrimary(): number | string {
      const t = cur();
      if (!t || t === ')' || t === ',') return 0;
      if (t === '(') { eat(); const v = parseExpr(); eatIf(')'); return v; }
      if (t.startsWith('"')) { eat(); return t.slice(1, t.endsWith('"') ? -1 : undefined); }
      if (/^\d/.test(t) || (t.startsWith('.') && t.length > 1 && /\d/.test(t[1]))) { eat(); return parseFloat(t); }
      if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(t)) {
        eat();
        const vals = expandFormulaRange(t, cols, rows, depth + 1);
        const n = parseFloat(String(vals[0] ?? 0));
        return isNaN(n) ? String(vals[0] ?? '') : n;
      }
      if (/^[A-Z]+\d+$/i.test(t)) {
        eat();
        const m = t.match(/^([A-Z]+)(\d+)$/i)!;
        return getFormulaCell(colLetterToIndex(m[1]), parseInt(m[2]) - 1, cols, rows, depth + 1);
      }
      if (/^[A-Za-z]/.test(t)) {
        eat();
        if (cur() === '(') {
          eat();
          const fnArgs: (number | string)[] = [];
          while (cur() !== ')' && cur() !== '') {
            const tok = cur();
            if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(tok)) {
              eat();
              fnArgs.push(...expandFormulaRange(tok, cols, rows, depth + 1).map(v => {
                const n = parseFloat(String(v)); return isNaN(n) ? v : n;
              }));
            } else {
              fnArgs.push(parseExpr());
            }
            eatIf(',');
          }
          eatIf(')');
          return evalFormulaFn(t, fnArgs);
        }
        const up = t.toUpperCase();
        if (up === 'TRUE') return 1;
        if (up === 'FALSE') return 0;
        if (up === 'PI') return Math.PI;
        return '#NAME?';
      }
      eat(); return 0;
    }

    const result = parseExpr();
    if (typeof result === 'number' && !isFinite(result)) return '#NUM!';
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return msg.startsWith('#') ? msg : '#ERR!';
  }
}

function formatFormulaResult(v: number | string): string {
  if (typeof v === 'number') {
    if (!isFinite(v)) return String(v);
    // Limit to 10 significant figures to avoid float noise
    return parseFloat(v.toPrecision(10)).toString();
  }
  return String(v);
}

function TableCell({ col, value, onChange, isFinished, onKeyDown, fontColor, fontSize, fontFamily, cellKey, onHTMLInput, dismissSel, cols, rows, cellRef, onCellFocus, onCellBlur }: {
  col: TableColumn; value: string | boolean; onChange: (v: string | boolean) => void;
  isFinished?: boolean; onKeyDown?: (e: React.KeyboardEvent) => void;
  fontColor?: string; fontSize?: number; fontFamily?: string;
  cellKey?: string; onHTMLInput?: (el: HTMLDivElement) => void; dismissSel?: () => void;
  cols?: TableColumn[]; rows?: TableRow[];
  cellRef?: string;
  onCellFocus?: (ref: string, formula?: string) => void; onCellBlur?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [memberPickerAt, setMemberPickerAt] = useState<{ x: number; y: number } | null>(null);
  const { members } = useServerBoard();
  const base = "w-full bg-transparent outline-none placeholder:text-[var(--text-muted)]";
  const cellStyle: React.CSSProperties = {
    color: fontColor ?? "var(--text-primary)",
    fontSize: fontSize ?? 12,
    fontFamily: fontFamily ?? "inherit",
  };

  if (col.type === "member") {
    const member = value ? members.find((m) => m.userId === value) : undefined;
    return (
      <>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            if (isFinished) return;
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMemberPickerAt({ x: r.left, y: r.bottom + 4 });
          }}
          className="flex w-full min-w-0 items-center gap-1.5 text-left"
          style={{ ...cellStyle, cursor: isFinished ? "default" : "pointer" }}
        >
          {member ? (
            <>
              <MemberAvatar member={member} size={14} title={member.username} />
              <span className="truncate">{member.username}</span>
            </>
          ) : value ? (
            <span className="italic" style={{ color: "var(--text-muted)" }}>Unknown member</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>{isFinished ? "—" : "Assign…"}</span>
          )}
        </button>
        {memberPickerAt && (
          <MemberPickerPopover
            x={memberPickerAt.x}
            y={memberPickerAt.y}
            assigneeId={(value as string) || undefined}
            onPick={(id) => { onChange(id ?? ""); setMemberPickerAt(null); }}
            onClose={() => setMemberPickerAt(null)}
          />
        )}
      </>
    );
  }

  if (col.type === "checkbox") {
    const checked = !!value;
    return (
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); if (!isFinished) onChange(!checked); }}
        className={cn("flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
          checked ? "border-transparent" : "border-[var(--border)] hover:border-[var(--accent)]")}
        style={checked ? { backgroundColor: "var(--accent)", borderColor: "var(--accent)" } : undefined}
      >
        {checked && <Check size={10} className="text-white" />}
      </button>
    );
  }
  if (col.type === "select") {
    return (
      <select value={value as string} disabled={isFinished} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        style={cellStyle} className={cn(base, "cursor-pointer appearance-none")}>
        {(col.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === "date") {
    return <input type="date" value={value as string} readOnly={isFinished} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} style={cellStyle} className={base} />;
  }

  // Formula detection — works for text and number cells
  const strValue = value as string;
  const isFormula = typeof strValue === 'string' && strValue.startsWith('=');
  const formulaResult = isFormula && cols && rows
    ? formatFormulaResult(evalFormula(strValue.slice(1), cols, rows))
    : null;
  const isErrorResult = formulaResult?.startsWith('#') ?? false;

  // Rich-text contenteditable for non-formula text cells
  if (col.type === "text" && !isFinished && onHTMLInput && !isFormula) {
    return (
      <div
        data-cell-key={cellKey}
        contentEditable
        suppressContentEditableWarning
        className="w-full outline-none"
        style={{ ...cellStyle, wordBreak: "break-word", whiteSpace: "pre-wrap", minHeight: "1em" }}
        onInput={(e) => { dismissSel?.(); onHTMLInput(e.currentTarget as HTMLDivElement); }}
        onKeyDown={onKeyDown}
      />
    );
  }

  // Number, URL, formula cells — plain input with formula display
  // When not focused: show the computed result. When focused/editing: strip the leading = so
  // the cell always shows the expression without the formula-prefix character.
  const displayValue = !focused && formulaResult !== null
    ? formulaResult
    : (isFormula ? strValue.slice(1) : strValue);

  return (
    <div className="relative flex items-center w-full">
      <input
        type={col.type === "url" ? "url" : "text"}
        inputMode={col.type === "number" && !isFormula ? "decimal" : undefined}
        value={displayValue ?? ""}
        readOnly={isFinished}
        onChange={e => {
          const v = e.target.value;
          if (isFormula) {
            // displayValue strips the leading = so re-add it (unless user typed one themselves)
            onChange(v ? (v.startsWith('=') ? v : '=' + v) : '');
          } else if (col.type === "number" && !v.startsWith('=')) {
            // allow partial input while typing (e.g. "-", "1.", "1.0")
            onChange(v);
          } else {
            onChange(v);
          }
        }}
        onFocus={() => {
          setFocused(true);
          onCellFocus?.(cellRef ?? '', isFormula ? strValue : undefined);
        }}
        onBlur={() => {
          setFocused(false);
          onCellBlur?.();
        }}
        onKeyDown={onKeyDown}
        placeholder={col.type === "url" ? "https://…" : col.type === "number" ? "" : ""}
        style={{
          ...cellStyle,
          color: isErrorResult ? "#f87171" : (cellStyle.color),
          fontStyle: isErrorResult ? "italic" : undefined,
        }}
        className={base}
      />
      {isFormula && !focused && !isErrorResult && (
        <span
          title="Formula cell"
          className="absolute right-0 top-0 bottom-0 flex items-center pr-0.5 pointer-events-none"
          style={{ fontSize: 8, color: "var(--accent)", opacity: 0.7 }}
        >
          fx
        </span>
      )}
    </div>
  );
}

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains",     label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "equals",       label: "equals" },
  { value: "not_equals",   label: "not equals" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];
const NUMBER_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals",       label: "=" },
  { value: "not_equals",   label: "≠" },
  { value: "gt",           label: ">" },
  { value: "lt",           label: "<" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];
const CHECKBOX_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals", label: "is" },
];
const SELECT_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals",       label: "is" },
  { value: "not_equals",   label: "is not" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];
function getFilterOps(col: TableColumn | undefined): { value: FilterOp; label: string }[] {
  if (!col) return TEXT_OPS;
  if (col.type === "number") return NUMBER_OPS;
  if (col.type === "checkbox") return CHECKBOX_OPS;
  if (col.type === "select" || col.type === "member") return SELECT_OPS;
  return TEXT_OPS;
}

function FilterPanel({ cols, filters, onChange }: {
  cols: TableColumn[];
  filters: TableFilter[];
  onChange: (f: TableFilter[]) => void;
}) {
  const { members } = useServerBoard();
  const addFilter = () =>
    onChange([...filters, { id: crypto.randomUUID(), colId: cols[0]?.id ?? "", op: "contains", value: "" }]);
  const updateFilter = (id: string, patch: Partial<TableFilter>) =>
    onChange(filters.map(f => f.id === id ? { ...f, ...patch } : f));
  const removeFilter = (id: string) => onChange(filters.filter(f => f.id !== id));

  return (
    <div
      className="absolute top-full right-0 mt-1 z-50 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl p-2.5 flex flex-col gap-2"
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Filters</p>
        {filters.length > 0 && (
          <button onClick={() => onChange([])} className="text-[11px] text-red-400 hover:underline">Clear all</button>
        )}
      </div>
      {filters.length === 0 && (
        <p className="text-[11px] text-[var(--text-muted)] px-1">No active filters.</p>
      )}
      {filters.map(f => {
        const col = cols.find(c => c.id === f.colId);
        const ops = getFilterOps(col);
        const needsValue = f.op !== "is_empty" && f.op !== "is_not_empty";
        return (
          <div key={f.id} className="flex items-start gap-1.5">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div className="flex gap-1">
                <select
                  value={f.colId}
                  onChange={e => updateFilter(f.id, { colId: e.target.value, op: "contains", value: "" })}
                  className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                >
                  {cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                  value={f.op}
                  onChange={e => updateFilter(f.id, { op: e.target.value as FilterOp })}
                  className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                >
                  {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {needsValue && (
                col?.type === "select" ? (
                  <select
                    value={f.value}
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option value="">Any</option>
                    {(col.options ?? []).map(o => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                  </select>
                ) : col?.type === "member" ? (
                  <select
                    value={f.value}
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option value="">Any</option>
                    {members.map(m => <option key={m.userId} value={m.userId.toLowerCase()}>{m.username}</option>)}
                  </select>
                ) : col?.type === "checkbox" ? (
                  <select
                    value={f.value}
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option value="true">Checked</option>
                    <option value="false">Unchecked</option>
                  </select>
                ) : (
                  <input
                    value={f.value}
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    placeholder="Value…"
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                )
              )}
            </div>
            <button
              onClick={() => removeFilter(f.id)}
              className="mt-0.5 shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors p-0.5"
            >
              <XIcon size={12} />
            </button>
          </div>
        );
      })}
      <button
        onClick={addFilter}
        className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:opacity-80 transition-opacity mt-0.5"
      >
        <Plus size={11} /> Add filter
      </button>
    </div>
  );
}

const SUMMARY_FN_OPTIONS: { id: TableColumn["summaryFn"]; label: string; icon: string }[] = [
  { id: "none",            label: "None",           icon: "—"  },
  { id: "count",           label: "Count",          icon: "#"  },
  { id: "sum",             label: "Sum",            icon: "∑"  },
  { id: "avg",             label: "Average",        icon: "x̄"  },
  { id: "min",             label: "Min",            icon: "↓"  },
  { id: "max",             label: "Max",            icon: "↑"  },
  { id: "count_checked",   label: "Count checked",  icon: "✓"  },
  { id: "percent_checked", label: "% checked",      icon: "%"  },
  { id: "count_empty",     label: "Count empty",    icon: "∅"  },
  { id: "count_filled",    label: "Count filled",   icon: "■"  },
];

function computeColSummary(col: TableColumn, rows: TableRow[]): string {
  const fn = col.summaryFn ?? "none";
  if (fn === "none") return "";
  const vals = rows.map(r => r.cells[col.id]);
  if (fn === "count") return String(rows.length);
  if (fn === "count_empty") return String(vals.filter(v => v === "" || v === undefined || v === null || v === false).length);
  if (fn === "count_filled") return String(vals.filter(v => v !== "" && v !== undefined && v !== null && v !== false).length);
  if (fn === "count_checked") return String(vals.filter(v => v === true).length);
  if (fn === "percent_checked") {
    if (rows.length === 0) return "0%";
    return Math.round((vals.filter(v => v === true).length / rows.length) * 100) + "%";
  }
  const nums = vals.map(v => typeof v === "string" ? parseFloat(v) : Number(v)).filter(n => !isNaN(n));
  if (nums.length === 0) return "—";
  if (fn === "sum") { const s = nums.reduce((a, b) => a + b, 0); return String(Math.round(s * 1000) / 1000); }
  if (fn === "avg") { const s = nums.reduce((a, b) => a + b, 0); return String(Math.round(s / nums.length * 100) / 100); }
  if (fn === "min") return String(Math.min(...nums));
  if (fn === "max") return String(Math.max(...nums));
  return "";
}

function TableItem({ item, upd, collapsed, isFinished, boardId, boxId, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; boardId?: string; boxId?: string; extraContextItems?: ContextMenuEntry[] }) {
  const cols: TableColumn[] = item.tableColumns ?? [{ id: "c1", name: "Name", type: "text" }];
  const rows: TableRow[] = item.tableRows ?? [];
  const { members } = useServerBoard();
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  // Human-readable cell value — member cells store userIds; resolve to username for search/sort/export.
  const cellDisplay = useCallback((c: TableColumn, raw: string | boolean | undefined): string => {
    if (typeof raw === "boolean") return raw ? "true" : "false";
    const s = (raw as string) ?? "";
    if (c.type === "member" && s) return memberById.get(s)?.username ?? s;
    return s;
  }, [memberById]);
  const striped = item.tableStriped ?? false;
  const headerColor = item.tableHeaderColor;
  const headerFontColor = item.tableHeaderFontColor;
  const cellBgColor = item.tableCellBgColor;
  const stripedColor = item.tableStripedColor;
  const borderColor = item.tableBorderColor ?? "var(--border)";
  const bw = item.tableBorderWidth ?? 1;
  const br = item.tableBorderRadius ?? 0;
  const fontColor = item.tableFontColor;
  const fontSize = item.tableFontSize ?? 12;
  const fontFamily = item.tableFontFamily;
  const rowH = item.tableRowHeight ?? 28;

  const [splitRatio, setSplitRatio] = useState(item.tableChartSplitRatio ?? 0.5);
  const isDraggingSplit = useRef(false);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ ref: string; formula?: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const cellsReadOnly = isFinished || locked;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TableFilter[]>([]);
  const [sortBy, setSortBy] = useState<{ colId: string; dir: "asc" | "desc" } | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [resizingColId, setResizingColId] = useState<string | null>(null);
  const [summaryPopover, setSummaryPopover] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);
  const colResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { return () => { colResizeCleanupRef.current?.(); }; }, []);

  const startColResize = (e: React.MouseEvent, col: TableColumn) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColId(col.id);
    resizeRef.current = { colId: col.id, startX: e.clientX, startW: col.width ?? 140 };
    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      upd({ tableColumns: cols.map(c => c.id === resizeRef.current!.colId ? { ...c, width: newW } : c) });
    };
    const cleanup = () => {
      setResizingColId(null);
      resizeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      colResizeCleanupRef.current = null;
    };
    const onUp = () => cleanup();
    colResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const updCols = (c: TableColumn[]) => upd({ tableColumns: c });
  const updRows = (r: TableRow[]) => upd({ tableRows: r });

  const addRow = () => {
    const cells: Record<string, string | boolean> = {};
    cols.forEach(c => { cells[c.id] = c.type === "checkbox" ? false : c.type === "select" ? (c.options?.[0] ?? "") : ""; });
    updRows([...rows, { id: crypto.randomUUID(), cells }]);
  };

  const addCol = () => {
    const id = crypto.randomUUID();
    const col: TableColumn = { id, name: "Column", type: "text" };
    updCols([...cols, col]);
    const newRows = rows.map(r => ({ ...r, cells: { ...r.cells, [id]: "" } }));
    updRows(newRows);
  };

  const setCell = (rowId: string, colId: string, v: string | boolean) => {
    updRows(rows.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: v } } : r));
  };

  const deleteRow = (rowId: string) => updRows(rows.filter(r => r.id !== rowId));

  const deleteCol = (colId: string) => {
    updCols(cols.filter(c => c.id !== colId));
    updRows(rows.map(r => { const cells = { ...r.cells }; delete cells[colId]; return { ...r, cells }; }));
  };

  const renameCol = (colId: string, name: string) => updCols(cols.map(c => c.id === colId ? { ...c, name } : c));

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellHTMLRef = useRef<Map<string, string>>(new Map());
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(300);
  const [chartHeight, setChartHeight] = useState(200);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setChartWidth(e.contentRect.width); setChartHeight(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const splitDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { return () => { splitDragCleanupRef.current?.(); }; }, []);

  const startSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSplit.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingSplit.current || !tableContainerRef.current) return;
      const rect = tableContainerRef.current.getBoundingClientRect();
      const ratio = Math.max(0.15, Math.min(0.85, (ev.clientY - rect.top) / rect.height));
      setSplitRatio(ratio);
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      splitDragCleanupRef.current = null;
    };
    const onUp = (ev: MouseEvent) => {
      isDraggingSplit.current = false;
      cleanup();
      if (!tableContainerRef.current) return;
      const rect = tableContainerRef.current.getBoundingClientRect();
      const ratio = Math.max(0.15, Math.min(0.85, (ev.clientY - rect.top) / rect.height));
      upd({ tableChartSplitRatio: ratio });
    };
    splitDragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };


  const chartData = useMemo(() => {
    if (!item.tableChartEnabled) return null;
    const usable = cols.filter((c) => c.type !== "checkbox");
    const labelColId = item.tableChartLabelColId ?? usable[0]?.id;
    const valueColIds = item.tableChartValueColIds?.length
      ? item.tableChartValueColIds
      : usable.slice(1).map((c) => c.id);
    if (!labelColId || valueColIds.length === 0) return null;
    const sKeys = valueColIds.map((id) => cols.find((c) => c.id === id)?.name ?? id);
    const points: GraphPoint[] = rows.map((r) => {
      const pt: GraphPoint = { label: String(r.cells[labelColId] ?? "") };
      valueColIds.forEach((colId, idx) => { pt[sKeys[idx]] = Number(r.cells[colId] ?? 0) || 0; });
      return pt;
    });
    return { points, seriesKeys: sKeys };
  }, [item.tableChartEnabled, item.tableChartLabelColId, item.tableChartValueColIds, cols, rows]);

  const handleCellHTMLChange = useCallback((el: HTMLElement) => {
    const key = el.dataset.cellKey;
    if (!key) return;
    const [rowId, colId] = key.split(":");
    const html = el.innerHTML;
    cellHTMLRef.current.set(key, html);
    updRows(rows.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: html } } : r));
  }, [rows, updRows]);

  // Initialize text cell divs on mount
  useEffect(() => {
    if (!tableContainerRef.current) return;
    for (const row of rows) {
      for (const col of cols) {
        if (col.type !== "text") continue;
        const key = `${row.id}:${col.id}`;
        const el = tableContainerRef.current.querySelector<HTMLElement>(`[data-cell-key="${key}"]`);
        if (el) {
          el.innerHTML = String(row.cells[col.id] ?? "");
          cellHTMLRef.current.set(key, String(row.cells[col.id] ?? ""));
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external changes without disrupting active editing
  useEffect(() => {
    if (!tableContainerRef.current) return;
    for (const row of rows) {
      for (const col of cols) {
        if (col.type !== "text") continue;
        const key = `${row.id}:${col.id}`;
        const el = tableContainerRef.current.querySelector<HTMLElement>(`[data-cell-key="${key}"]`);
        const stored = String(row.cells[col.id] ?? "");
        if (el && document.activeElement !== el && stored !== cellHTMLRef.current.get(key)) {
          el.innerHTML = stored;
          cellHTMLRef.current.set(key, stored);
        }
      }
    }
  }, [rows, cols]);
  const setColType = (colId: string, type: TableColumn["type"]) => {
    updCols(cols.map(c => c.id === colId ? { ...c, type, options: type === "select" && !c.options?.length ? ["Option 1","Option 2"] : c.options } : c));
    updRows(rows.map(r => ({ ...r, cells: { ...r.cells, [colId]: type === "checkbox" ? false : "" } })));
    setColMenu(null);
  };

  const visibleRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        cols.some(c => cellDisplay(c, r.cells[c.id]).toLowerCase().includes(q))
      );
    }
    for (const f of filters) {
      const col = cols.find(c => c.id === f.colId);
      if (!col) continue;
      result = result.filter(r => {
        const raw = r.cells[f.colId];
        const str = typeof raw === "boolean" ? (raw ? "true" : "false") : ((raw as string) ?? "").toLowerCase();
        const fv = f.value.toLowerCase();
        switch (f.op) {
          case "contains":     return str.includes(fv);
          case "not_contains": return !str.includes(fv);
          case "equals":       return str === fv;
          case "not_equals":   return str !== fv;
          case "is_empty":     return !str;
          case "is_not_empty": return !!str;
          case "gt":           return parseFloat(str) > parseFloat(fv);
          case "lt":           return parseFloat(str) < parseFloat(fv);
          default:             return true;
        }
      });
    }
    if (sortBy) {
      const { colId, dir } = sortBy;
      const col = cols.find(c => c.id === colId);
      result = [...result].sort((a, b) => {
        const av = a.cells[colId]; const bv = b.cells[colId];
        if (col?.type === "number") {
          const an = parseFloat(av as string ?? "0");
          const bn = parseFloat(bv as string ?? "0");
          return dir === "asc" ? an - bn : bn - an;
        }
        const as_ = typeof av === "boolean" ? (av ? "1" : "0") : (col ? cellDisplay(col, av) : ((av as string) ?? ""));
        const bs_ = typeof bv === "boolean" ? (bv ? "1" : "0") : (col ? cellDisplay(col, bv) : ((bv as string) ?? ""));
        return dir === "asc" ? as_.localeCompare(bs_) : bs_.localeCompare(as_);
      });
    }
    return result;
  }, [rows, search, filters, sortBy, cols, cellDisplay]);

  const cellBorder = `${bw}px solid ${borderColor}`;

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex gap-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)] pb-1">
          {cols.slice(0, 3).map(c => <span key={c.id} className="flex-1 truncate">{c.name}</span>)}
        </div>
        {rows.slice(0, 3).map(r => (
          <div key={r.id} className="flex gap-2 text-[11px] text-[var(--text-primary)]">
            {cols.slice(0, 3).map(c => (
              <span key={c.id} className="flex-1 truncate">
                {c.type === "checkbox" ? (r.cells[c.id] ? "✓" : "—") : cellDisplay(c, r.cells[c.id]) || "—"}
              </span>
            ))}
          </div>
        ))}
        {rows.length > 3 && <span className="text-[10px] text-[var(--text-muted)]">+{rows.length - 3} more rows</span>}
      </div>
    );
  }

  const showTitle = item.tableShowTitle !== false && (item.tableTitle || !isFinished);

  return (
    <div ref={tableContainerRef} className="relative flex h-full flex-col overflow-hidden" style={{ borderRadius: br }}
      onClick={() => { setColMenu(null); setShowFilterPanel(false); setShowSortPanel(false); setSummaryPopover(null); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Background layers */}
      {item.tableBgColor && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundColor: item.tableBgColor, borderRadius: br, opacity: (item.tableBgOpacity ?? 100) / 100, pointerEvents: "none" }} />
      )}
      {item.tableBgImage && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${item.tableBgImage})`, backgroundSize: item.tableBgImageSize ?? "cover", backgroundPosition: "center", borderRadius: br, opacity: (item.tableBgImageOpacity ?? 100) / 100, pointerEvents: "none" }} />
      )}

      {/* Table content — split height when chart is embedded, full height otherwise */}
      <div className="flex flex-col overflow-hidden min-h-0" style={
        item.tableChartEnabled && chartData
          ? { flex: `0 0 calc(${splitRatio * 100}% - 5px)` }
          : { flex: 1 }
      }>

      {/* Title */}
      {showTitle && (
        <div className="relative shrink-0 px-3 pt-2 pb-1" style={{ zIndex: 1 }}>
          {isFinished ? (
            item.tableTitle && <p style={{ fontFamily: fontFamily ?? "inherit", fontSize: (fontSize ?? 12) + 2, color: fontColor ?? "var(--text-primary)", fontWeight: 600 }}>{item.tableTitle}</p>
          ) : (
            <input
              value={item.tableTitle ?? ""}
              onChange={e => upd({ tableTitle: e.target.value })}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Table title…"
              className="w-full bg-transparent outline-none font-semibold placeholder:text-[var(--text-muted)] placeholder:opacity-40"
              style={{ fontFamily: fontFamily ?? "inherit", fontSize: (fontSize ?? 12) + 2, color: fontColor ?? "var(--text-primary)" }}
            />
          )}
        </div>
      )}

      {/* Search + Filter + Sort toolbar */}
      <div
        className="relative shrink-0 px-2 py-1.5 flex items-center gap-1.5 border-b border-[var(--border)]"
        style={{ zIndex: 2 }}
        onClick={e => e.stopPropagation()}
      >
        {searchOpen ? (
          <div className="flex-1 flex items-center gap-1.5 rounded bg-[var(--surface-overlay)] px-2 py-1 min-w-0">
            <Search size={11} className="shrink-0 text-[var(--text-muted)]" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              placeholder="Search…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={() => { setSearch(""); setSearchOpen(false); }}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <XIcon size={10} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
            className={cn(
              "flex items-center justify-center rounded p-1.5 transition-colors shrink-0",
              search ? "text-[var(--accent)] bg-[var(--accent)]/15" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)]"
            )}
            title="Search rows"
          >
            <Search size={13} />
          </button>
        )}
        {/* Sort button */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowSortPanel(v => !v); setShowFilterPanel(false); }}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors shrink-0",
              sortBy ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)]"
            )}
          >
            <ArrowUpDown size={11} />
            {sortBy ? (cols.find(c => c.id === sortBy.colId)?.name ?? "Sort") : "Sort"}
            {sortBy && <span className="text-[10px] ml-0.5">{sortBy.dir === "asc" ? "↑" : "↓"}</span>}
          </button>
          {showSortPanel && (
            <div
              className="absolute top-full right-0 mt-1 z-50 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl p-2 flex flex-col gap-0.5"
              onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] px-1 mb-1">Sort by</p>
              {cols.map(c => (
                <button key={c.id}
                  onClick={() => {
                    setSortBy(prev => {
                      if (prev?.colId === c.id) return prev.dir === "asc" ? { colId: c.id, dir: "desc" } : null;
                      return { colId: c.id, dir: "asc" };
                    });
                    setShowSortPanel(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded px-2 py-1 text-[11px] transition-colors hover:bg-[var(--surface-overlay)]",
                    sortBy?.colId === c.id ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {sortBy?.colId === c.id && <span className="shrink-0 text-[10px]">{sortBy.dir === "asc" ? "↑ A→Z" : "↓ Z→A"}</span>}
                </button>
              ))}
              {sortBy && (
                <button
                  onClick={() => { setSortBy(null); setShowSortPanel(false); }}
                  className="flex items-center gap-1 mt-1 px-2 py-1 text-[11px] text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  <XIcon size={10} /> Clear sort
                </button>
              )}
            </div>
          )}
        </div>
        {/* Filter button */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowFilterPanel(v => !v); setShowSortPanel(false); }}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors shrink-0",
              filters.length > 0 ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)]"
            )}
          >
            <Filter size={11} />
            Filter
            {filters.length > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--accent)] text-white w-4 h-4 text-[10px] flex items-center justify-center shrink-0 leading-none">
                {filters.length}
              </span>
            )}
          </button>
          {showFilterPanel && (
            <FilterPanel cols={cols} filters={filters} onChange={setFilters} />
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {filters.length > 0 && (
        <div
          className="relative shrink-0 px-2 py-1 flex flex-wrap gap-1 border-b border-[var(--border)]"
          style={{ zIndex: 2 }}
          onClick={e => e.stopPropagation()}
        >
          {filters.map(f => {
            const col = cols.find(c => c.id === f.colId);
            const op = getFilterOps(col).find(o => o.value === f.op);
            const hasValue = f.op !== "is_empty" && f.op !== "is_not_empty";
            return (
              <span key={f.id} className="flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--accent)]">
                <span className="font-medium">{col?.name ?? "?"}</span>
                <span className="opacity-60">{op?.label}</span>
                {hasValue && f.value && <span className="font-semibold">"{f.value}"</span>}
                <button
                  onClick={() => setFilters(filters.filter(fi => fi.id !== f.id))}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--accent)]/20 transition-colors"
                >
                  <XIcon size={8} />
                </button>
              </span>
            );
          })}
          {filters.length > 1 && (
            <button onClick={() => setFilters([])} className="text-[11px] text-[var(--text-muted)] hover:text-red-400 px-1 transition-colors">
              Clear all
            </button>
          )}
        </div>
      )}

      {activeCell && (
        <div className="relative shrink-0 flex items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-overlay)]" style={{ zIndex: 2 }}>
          <span className="shrink-0 px-2 py-1 text-[11px] font-mono font-semibold text-[var(--text-secondary)] border-r border-[var(--border)] select-none min-w-[2.5rem] text-center">{activeCell.ref || "–"}</span>
          {activeCell.formula != null && (
            <>
              <span className="shrink-0 px-1.5 text-[10px] font-semibold text-[var(--accent)] select-none border-r border-[var(--border)] py-1">fx</span>
              <span className="flex-1 min-w-0 px-2 py-1 text-[11px] text-[var(--text-primary)] font-mono truncate">
                {activeCell.formula.startsWith('=') ? activeCell.formula.slice(1) : activeCell.formula}
              </span>
            </>
          )}
        </div>
      )}
      <div className="relative flex-1 overflow-auto" style={{ zIndex: 1 }}>
        <table className="border-collapse" style={{
          tableLayout: "fixed",
          width: Math.max(cols.reduce((s, c) => s + (c.width ?? 140), 0) + (isFinished ? 0 : 44), 0),
          minWidth: "100%",
        }}>
          <thead>
            <tr style={{ background: headerColor ?? "var(--surface-overlay)" }}>
              {cols.map((col, ci) => (
                <th key={col.id} style={{ borderRight: resizingColId === col.id ? "2px solid var(--accent)" : cellBorder, borderBottom: cellBorder, color: headerFontColor ?? "var(--text-secondary)", fontFamily: fontFamily ?? "inherit", fontSize: (fontSize ?? 12) - 1, width: col.width ?? 140, minWidth: 60 }} className="relative px-2 py-1.5 text-left font-semibold group/th">
                  <div
                    className="flex items-center gap-1 cursor-pointer select-none overflow-hidden"
                    onClick={e => { if (!isFinished && editingCol !== col.id) { e.stopPropagation(); setColMenu(v => v === col.id ? null : col.id); } }}
                  >
                    <span className="text-[10px] opacity-50 shrink-0">{COL_TYPE_ICONS[col.type]}</span>
                    {editingCol === col.id ? (
                      <input autoFocus value={col.name}
                        onChange={e => renameCol(col.id, e.target.value)}
                        onBlur={() => setEditingCol(null)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingCol(null); }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-transparent outline-none font-semibold"
                        style={{ color: headerFontColor ?? "var(--text-primary)", fontFamily: fontFamily ?? "inherit", fontSize: (fontSize ?? 12) - 1 }}
                      />
                    ) : (
                      <span className="flex-1 truncate">{col.name}</span>
                    )}
                    {sortBy?.colId === col.id && (
                      <button
                        onClick={e => { e.stopPropagation(); setSortBy(prev => prev?.dir === "asc" ? { colId: col.id, dir: "desc" } : null); }}
                        className="shrink-0 text-[var(--accent)] hover:opacity-60 transition-opacity"
                      >
                        {sortBy.dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      </button>
                    )}
                    {!isFinished && !sortBy?.colId && <span className="text-[10px] opacity-0 group-hover/th:opacity-40 transition-opacity shrink-0">▾</span>}
                    {!isFinished && sortBy?.colId !== col.id && sortBy?.colId && <span className="text-[10px] opacity-40 shrink-0">▾</span>}
                  </div>
                  {/* Column resize handle — blue pill indicator */}
                  {!isFinished && (
                    <div
                      onMouseDown={e => startColResize(e, col)}
                      onDoubleClick={e => { e.stopPropagation(); upd({ tableColumns: cols.map(c => c.id === col.id ? { ...c, width: 140 } : c) }); }}
                      onClick={e => e.stopPropagation()}
                      className="absolute top-0 right-0 h-full w-3 cursor-col-resize z-10 flex items-center justify-end pr-px group/resize"
                    >
                      <div className={cn(
                        "rounded-full transition-all duration-150",
                        resizingColId === col.id
                          ? "w-0.5 h-full bg-[var(--accent)] opacity-100"
                          : "w-0.5 h-[55%] bg-[var(--accent)] opacity-0 group-hover/resize:opacity-50"
                      )} />
                    </div>
                  )}
                  {colMenu === col.id && (
                    <div className="absolute top-full left-0 z-50 mt-0.5 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg p-1" onClick={e => e.stopPropagation()}>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type</p>
                      {DEFAULT_COL_TYPES.map(t => (
                        <button key={t} onClick={() => setColType(col.id, t)}
                          className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors hover:bg-[var(--surface-overlay)]", col.type === t ? "text-[var(--accent)]" : "text-[var(--text-secondary)]")}>
                          <span className="w-4 text-center">{COL_TYPE_ICONS[t]}</span>{t}
                        </button>
                      ))}
                      <hr className="my-1 border-[var(--border)]" />
                      <button onClick={e => { e.stopPropagation(); setColMenu(null); setEditingCol(col.id); }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors">
                        ✏️ Rename
                      </button>
                      {col.type === "select" && (
                        <div className="px-2 py-1 flex flex-col gap-1">
                          <p className="text-[10px] text-[var(--text-muted)] mb-0.5">Options</p>
                          {(col.options ?? []).map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1">
                              <input
                                value={opt}
                                onChange={e => {
                                  const opts = [...(col.options ?? [])];
                                  opts[oi] = e.target.value;
                                  updCols(cols.map(c => c.id === col.id ? { ...c, options: opts } : c));
                                }}
                                onClick={e => e.stopPropagation()}
                                className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                              />
                              <button
                                onClick={e => { e.stopPropagation(); const opts = (col.options ?? []).filter((_, i) => i !== oi); updCols(cols.map(c => c.id === col.id ? { ...c, options: opts } : c)); }}
                                className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"
                              ><XIcon size={10} /></button>
                            </div>
                          ))}
                          <button
                            onClick={e => { e.stopPropagation(); const opts = [...(col.options ?? []), "Option " + ((col.options?.length ?? 0) + 1)]; updCols(cols.map(c => c.id === col.id ? { ...c, options: opts } : c)); }}
                            className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:opacity-80 transition-opacity mt-0.5"
                          ><Plus size={10} /> Add option</button>
                        </div>
                      )}
                      {cols.length > 1 && (
                        <button onClick={() => { deleteCol(col.id); setColMenu(null); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">
                          🗑 Delete column
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}
              {!isFinished && (
                <th style={{ borderBottom: cellBorder }} className="px-1">
                  <button onClick={addCol} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-base leading-none">+</button>
                </th>
              )}
              {!isFinished && <th style={{ borderBottom: cellBorder }} className="w-5" />}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={cols.length + (isFinished ? 0 : 2)} style={{ padding: "32px 0", textAlign: "center" }}>
                  {rows.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 20, opacity: 0.18 }}>⬚</div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>No rows yet</p>
                      {!isFinished && (
                        <button onClick={addRow} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                          + Add first row
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 16, opacity: 0.22 }}>⌕</div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>No rows match</p>
                      <button
                        onClick={() => { setSearch(""); setFilters([]); setSearchOpen(false); }}
                        style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}
            {visibleRows.map((row, ri) => {
              const rowBg = striped && ri % 2 === 1 ? (stripedColor ?? "var(--surface-overlay)") : (cellBgColor ?? "transparent");
              return (
                <tr key={row.id} className="group/row" style={{ background: rowBg, height: rowH }}>
                  {cols.map((col, ci) => {
                    const ref = `${idxToColLetter(ci)}${ri + 1}`;
                    return (
                      <td key={col.id} title={ref} style={{ borderRight: cellBorder, borderBottom: cellBorder, paddingLeft: 8, paddingRight: 8, textAlign: col.type === "checkbox" ? "center" : undefined }}>
                        <TableCell col={col} value={row.cells[col.id] ?? (col.type === "checkbox" ? false : "")}
                          key={`${row.id}:${col.id}:${String(row.cells[col.id] ?? '').startsWith('=') ? 'f' : 'v'}`}
                          onChange={v => setCell(row.id, col.id, v)} isFinished={cellsReadOnly}
                          fontColor={fontColor} fontSize={fontSize} fontFamily={fontFamily}
                          cellKey={`${row.id}:${col.id}`}
                          onHTMLInput={(el) => handleCellHTMLChange(el)}
                          cols={cols} rows={rows}
                          cellRef={ref}
                          onCellFocus={(r, f) => setActiveCell({ ref: r, formula: f })}
                          onCellBlur={() => setActiveCell(null)}
                          onKeyDown={e => { if (e.key === "Tab" && col.id === cols[cols.length-1].id) { e.preventDefault(); if (ri === visibleRows.length - 1) addRow(); } }}
                        />
                      </td>
                    );
                  })}
                  {!isFinished && <td style={{ borderBottom: cellBorder }} />}
                  {!isFinished && (
                    <td style={{ borderBottom: cellBorder }} className="w-5">
                      <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-red-400 text-[11px]">✕</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {item.tableShowSummary && (
            <tfoot>
              <tr style={{ background: headerColor ?? "var(--surface-overlay)" }}>
                {cols.map((col) => {
                  const fn = col.summaryFn ?? "none";
                  const value = computeColSummary(col, visibleRows);
                  return (
                    <td
                      key={col.id}
                      style={{ borderRight: cellBorder, borderTop: `2px solid ${borderColor}`, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, position: "relative", cursor: isFinished ? "default" : "pointer" }}
                      className="group/sum"
                      onClick={e => { if (isFinished) return; e.stopPropagation(); setSummaryPopover(v => v === col.id ? null : col.id); }}
                    >
                      {fn !== "none" ? (
                        <span className="font-mono font-semibold tabular-nums" style={{ fontSize: (fontSize ?? 12) - 1, color: "var(--accent)" }}>{value}</span>
                      ) : (
                        <span className="font-mono text-[var(--text-muted)] opacity-0 group-hover/sum:opacity-30 transition-opacity select-none" style={{ fontSize: (fontSize ?? 12) - 1 }}>∑</span>
                      )}
                      {summaryPopover === col.id && (
                        <div
                          className="absolute bottom-full left-0 z-50 mb-1 w-44 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl p-1"
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                        >
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Aggregation</p>
                          {SUMMARY_FN_OPTIONS.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => {
                                upd({ tableColumns: cols.map(c => c.id === col.id ? { ...c, summaryFn: opt.id } : c) });
                                setSummaryPopover(null);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors hover:bg-[var(--surface-overlay)]",
                                fn === opt.id ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
                              )}
                            >
                              <span className="w-4 text-center font-mono shrink-0 text-[11px]">{opt.icon}</span>
                              {opt.label}
                              {fn === opt.id && <Check size={10} className="ml-auto shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
                {!isFinished && <td style={{ borderTop: `2px solid ${borderColor}` }} />}
                {!isFinished && <td style={{ borderTop: `2px solid ${borderColor}` }} className="w-5" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="relative shrink-0 flex items-center" style={{ borderTop: cellBorder, zIndex: 1 }}>
        {!isFinished && (
          <button
            onClick={addRow}
            style={{ fontFamily: fontFamily ?? "inherit", fontSize: fontSize ?? 12, color: fontColor ?? "var(--text-muted)" }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-[var(--surface-overlay)] transition-colors"
          >
            <Plus size={11} /> Add row
          </button>
        )}
        {(search || filters.length > 0) && (
          <span className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] shrink-0">
            {visibleRows.length} / {rows.length} rows
          </span>
        )}
      </div>
      </div>{/* end table content wrapper */}

      {/* Chart — split mode: divider + panel below table */}
      {item.tableChartEnabled && chartData && (
        <>
          <div
            onMouseDown={startSplitDrag}
            className="group relative shrink-0 flex items-center justify-center cursor-row-resize select-none"
            style={{ flex: "0 0 10px", zIndex: 3 }}
          >
            <div className="w-full h-px bg-[var(--border)] group-hover:bg-[var(--accent)] transition-colors" />
            <div className="absolute px-2 py-0.5 rounded bg-[var(--surface-overlay)] border border-[var(--border)] group-hover:border-[var(--accent)] transition-colors" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
              <div className="w-8 h-0.5 rounded bg-[var(--text-muted)] group-hover:bg-[var(--accent)] transition-colors" />
            </div>
          </div>
          <div ref={chartContainerRef} className="group relative overflow-hidden min-h-0"
            style={{ flex: `0 0 calc(${(1 - splitRatio) * 100}% - 5px)`, backgroundColor: item.tableChartBgColor ?? "transparent" }}>
            {item.tableChartTitle && (
              <p className="absolute top-1 left-0 right-0 text-center text-[11px] font-semibold pointer-events-none" style={{ color: item.tableChartFontColor ?? "var(--text-muted)", fontFamily: item.tableChartFontFamily }}>
                {item.tableChartTitle}
              </p>
            )}
            {boardId && !isFinished && (
              <button
                title="Detach chart"
                onMouseDown={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const store = useBoardStore.getState();
                  const chartProps = {
                    type: "graph" as const,
                    graphTableSourceItemId: item.id,
                    graphType: (item.tableChartType ?? "bar") as BlockItem["graphType"],
                    graphColors: item.tableChartColors,
                    graphShowGrid: item.tableChartShowGrid ?? true,
                    graphShowLegend: item.tableChartShowLegend ?? true,
                    graphSmooth: item.tableChartSmooth ?? true,
                    graphStrokeWidth: item.tableChartStrokeWidth ?? 2,
                    graphBarRadius: item.tableChartBarRadius ?? 3,
                  };
                  if (boxId) {
                    store.addItem(boardId, boxId, chartProps as Omit<BlockItem, "id">);
                  } else {
                    const bi = item as BlockItem & { boardX?: number; boardY?: number; boardW?: number; boardH?: number; zIndex?: number };
                    store.addBoardItem(boardId, {
                      ...chartProps,
                      boardX: (bi.boardX ?? 0) + (bi.boardW ?? 300) + 20,
                      boardY: bi.boardY ?? 0,
                      boardW: bi.boardW ?? 300,
                      boardH: bi.boardH ?? 200,
                      zIndex: (bi.zIndex ?? 0) + 1,
                    } as Omit<BoardLevelItem, "id">);
                  }
                  upd({ tableChartEnabled: false });
                }}
                className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-[var(--surface-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                <ExternalLink size={11} />
              </button>
            )}
            <ChartRenderer
              type={(item.tableChartType ?? "bar") as BlockItem["graphType"]}
              data={chartData.points} seriesKeys={chartData.seriesKeys}
              colors={item.tableChartColors ?? CHART_COLORS}
              showGrid={item.tableChartShowGrid ?? true} showLegend={item.tableChartShowLegend ?? true}
              curve={item.tableChartSmooth !== false ? "monotone" : "linear"}
              collapsed={false} width={chartWidth || 300} height={chartHeight || 200}
              fontFamily={item.tableChartFontFamily} fontSize={item.tableChartFontSize ?? 10}
              fontColor={item.tableChartFontColor} barRadius={item.tableChartBarRadius ?? 3}
              strokeWidth={item.tableChartStrokeWidth ?? 2}
              showDataLabels={item.tableChartShowDataLabels}
              xAxisTitle={item.tableChartXAxisTitle} yAxisTitle={item.tableChartYAxisTitle}
            />
          </div>
        </>
      )}


      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            // Block-level items injected from BoardItemWidget (canvas-level tables only)
            ...(extraContextItems && extraContextItems.length > 0
              ? [...extraContextItems, "separator" as const]
              : []),
            // Table-specific items
            ...(isFinished ? [
              { label: locked ? "Unlock editing" : "Lock editing", icon: locked ? <LockOpen size={14} /> : <Lock size={14} />, onClick: () => setLocked(v => !v) },
              "separator" as const,
            ] : []),
            {
              label: "Copy as CSV",
              icon: <FileDown size={14} />,
              onClick: () => {
                const header = cols.map(c => c.name).join(",");
                const body = rows.map(r => cols.map(c => {
                  const v = cellDisplay(c, r.cells[c.id]);
                  return v.includes(",") ? `"${v}"` : v;
                }).join(",")).join("\n");
                navigator.clipboard.writeText(header + "\n" + body);
              },
            },
            "separator" as const,
            {
              label: "Clear all cells",
              icon: <Square size={14} />,
              danger: true,
              onClick: () => upd({ tableRows: rows.map(r => ({ ...r, cells: Object.fromEntries(cols.map(c => [c.id, c.type === "checkbox" ? false : ""])) })) }),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Table Style Panel ────────────────────────────────────────────────────────

export function TableStylePanel({ item, upd, boardId, boxId }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; boardId?: string; boxId?: string }) {
  const cols: TableColumn[] = item.tableColumns ?? [];
  const rows: TableRow[] = item.tableRows ?? [];
  const hasBorder = (item.tableBorderWidth ?? 1) > 0;
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => upd({ tableBgImage: url }));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">

      {/* Title */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title</p>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input type="checkbox" checked={item.tableShowTitle !== false} onChange={e => upd({ tableShowTitle: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-[var(--text-secondary)]">Show title</span>
        </label>
        {item.tableShowTitle !== false && (
          <input
            value={item.tableTitle ?? ""}
            onChange={e => upd({ tableTitle: e.target.value })}
            placeholder="Enter title…"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        )}
      </section>

      {/* Summary row */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Summary row</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={item.tableShowSummary ?? false} onChange={e => upd({ tableShowSummary: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-[var(--text-secondary)]">Show summary row</span>
        </label>
        {item.tableShowSummary && (
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Click any cell in the summary row to set its aggregation (Sum, Avg, Count…)</p>
        )}
      </section>

      {/* Background */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Background</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableBgColor ?? "transparent" }}>
                <input type="color" value={item.tableBgColor ?? "#1e1f24"} onChange={e => upd({ tableBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Fill color</span>
            </div>
            {item.tableBgColor && <button onClick={() => upd({ tableBgColor: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
          </label>
          {item.tableBgColor && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] w-16 shrink-0">Opacity</span>
              <input type="range" min={0} max={100} value={item.tableBgOpacity ?? 100}
                onChange={e => upd({ tableBgOpacity: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="w-8 text-right text-[var(--text-muted)]">{item.tableBgOpacity ?? 100}%</span>
            </div>
          )}
          {/* Wallpaper */}
          <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Wallpaper URL…" value={item.tableBgImage?.startsWith("data:") ? "" : (item.tableBgImage ?? "")}
            onChange={e => upd({ tableBgImage: e.target.value || undefined })} />
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              <Upload size={11} /> Upload
            </button>
            {item.tableBgImage && <button onClick={() => upd({ tableBgImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {item.tableBgImage && (
            <WallpaperEditor
              url={item.tableBgImage}
              size={item.tableBgImageSize ?? "cover"}
              position="center"
              opacity={item.tableBgImageOpacity !== undefined ? item.tableBgImageOpacity / 100 : 1}
              onSizeChange={v => upd({ tableBgImageSize: v })}
              onPositionChange={() => {}}
              onOpacityChange={v => upd({ tableBgImageOpacity: Math.round(v * 100) })}
            />
          )}
        </div>
      </section>

      {/* Font */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Font</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FontPicker compact value={item.tableFontFamily ?? "Inter"} onChange={f => { loadGoogleFont(f); upd({ tableFontFamily: f }); }} />
            <input type="number" min={8} max={72} value={item.tableFontSize ?? 12}
              onChange={e => upd({ tableFontSize: Number(e.target.value) })}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" title="Font size" />
            <span className="text-[11px] text-[var(--text-muted)]">px</span>
          </div>
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/15 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableFontColor ?? "#f2f2f2" }}>
                <input type="color" value={item.tableFontColor ?? "#f2f2f2"} onChange={e => upd({ tableFontColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Cell text color</span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{item.tableFontColor ?? "default"}</span>
          </label>
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/15 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableHeaderFontColor ?? "#a0a0a0" }}>
                <input type="color" value={item.tableHeaderFontColor ?? "#a0a0a0"} onChange={e => upd({ tableHeaderFontColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Header text color</span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{item.tableHeaderFontColor ?? "default"}</span>
          </label>
        </div>
      </section>

      {/* Rows */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Rows</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)] w-20 shrink-0">Row height</span>
            <input type="number" min={20} max={80} value={item.tableRowHeight ?? 28}
              onChange={e => upd({ tableRowHeight: Number(e.target.value) })}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" />
            <span className="text-[11px] text-[var(--text-muted)]">px</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.tableStriped ?? false} onChange={e => upd({ tableStriped: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Striped rows</span>
          </label>
          {item.tableStriped && (
            <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
              <div className="flex items-center gap-2">
                <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableStripedColor ?? "#ffffff10" }}>
                  <input type="color" value={item.tableStripedColor ?? "#2a2b30"} onChange={e => upd({ tableStripedColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-[var(--text-secondary)]">Stripe color</span>
              </div>
            </label>
          )}
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableCellBgColor ?? "transparent" }}>
                <input type="color" value={item.tableCellBgColor ?? "#1e1f24"} onChange={e => upd({ tableCellBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Cell background</span>
            </div>
            {item.tableCellBgColor && <button onClick={() => upd({ tableCellBgColor: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
          </label>
          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableHeaderColor ?? "#2a2b30" }}>
                <input type="color" value={item.tableHeaderColor ?? "#2a2b30"} onChange={e => upd({ tableHeaderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="text-[var(--text-secondary)]">Header background</span>
            </div>
            {item.tableHeaderColor && <button onClick={() => upd({ tableHeaderColor: undefined })} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><XIcon size={11} /></button>}
          </label>
        </div>
      </section>

      {/* Border */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Grid lines</p>
          <button onClick={() => upd({ tableBorderWidth: hasBorder ? 0 : 1, tableBorderColor: item.tableBorderColor ?? "#ffffff20" })}
            className={cn("rounded px-2 py-0.5 text-[11px] transition-colors border", hasBorder ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>
            {hasBorder ? "On" : "Off"}
          </button>
        </div>
        {hasBorder && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] w-12 shrink-0">Width</span>
              <input type="range" min={1} max={6} value={item.tableBorderWidth ?? 1}
                onChange={e => upd({ tableBorderWidth: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="w-6 text-right text-[var(--text-muted)]">{item.tableBorderWidth ?? 1}px</span>
            </div>
            <label className="flex items-center justify-between gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
              <div className="flex items-center gap-2">
                <span className="relative h-5 w-5 rounded border border-white/15 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableBorderColor ?? "#ffffff20" }}>
                  <input type="color" value={item.tableBorderColor ?? "#ffffff20"} onChange={e => upd({ tableBorderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </span>
                <span className="text-[var(--text-secondary)]">Line color</span>
              </div>
            </label>
          </div>
        )}
      </section>

      {/* Shape */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Shape</p>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] w-20 shrink-0">Corner radius</span>
          <input type="range" min={0} max={24} value={item.tableBorderRadius ?? 0}
            onChange={e => upd({ tableBorderRadius: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          <span className="w-6 text-right text-[var(--text-muted)]">{item.tableBorderRadius ?? 0}</span>
        </div>
      </section>

      {/* Columns info */}
      <section>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Columns ({cols.length}) · {rows.length} rows</p>
        <p className="text-[10px] text-[var(--text-muted)]">Double-click a column header to rename. Click ▾ to change type or delete.</p>
      </section>

      {/* Session log preset */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Presets</p>
        <button
          onClick={() => upd({
            tableColumns: [
              { id: nanoid(), name: "Time",     type: "text"     },
              { id: nanoid(), name: "Tag",       type: "select",  options: ["Work", "Break", "Note", "Milestone"] },
              { id: nanoid(), name: "Notes",     type: "text"     },
              { id: nanoid(), name: "Duration",  type: "text"     },
              { id: nanoid(), name: "Done",      type: "checkbox" },
            ],
            tableRows: [{ id: nanoid(), cells: {} }],
            tableTitle: "Session Log",
            tableShowTitle: true,
          })}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-left text-[11px] hover:border-[var(--accent)]/50 transition-colors"
        >
          <span className="block font-semibold text-[var(--text-primary)]">Session Log</span>
          <span className="block text-[11px] text-[var(--text-muted)]">Time · Tag · Notes · Duration · Done</span>
        </button>
      </section>

      {/* Chart */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Chart</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={!!item.tableChartEnabled} onChange={e => upd({ tableChartEnabled: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[11px] text-[var(--text-secondary)]">Show</span>
          </label>
        </div>
        {item.tableChartEnabled && (() => {
          const usable = cols.filter((c) => c.type !== "checkbox");
          const labelColId = item.tableChartLabelColId ?? usable[0]?.id;
          const valueColIds = item.tableChartValueColIds?.length ? item.tableChartValueColIds : usable.slice(1).map((c) => c.id);
          const chartColors = item.tableChartColors ?? CHART_COLORS;
          const inputCls = "w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";
          return (
            <div className="flex flex-col gap-4">

              {/* Extract chart */}
              {boardId && boxId && (
                <div>
                  <p className="text-[11px] text-[var(--text-muted)] mb-1.5 font-medium">As block item</p>
                  <button
                    onClick={() => {
                      useBoardStore.getState().addItem(boardId, boxId, {
                        type: "graph",
                        graphTableSourceItemId: item.id,
                        graphType: (item.tableChartType ?? "bar") as BlockItem["graphType"],
                        graphColors: item.tableChartColors,
                        graphShowGrid: item.tableChartShowGrid ?? true,
                        graphShowLegend: item.tableChartShowLegend ?? true,
                        graphSmooth: item.tableChartSmooth ?? true,
                        graphStrokeWidth: item.tableChartStrokeWidth ?? 2,
                        graphBarRadius: item.tableChartBarRadius ?? 3,
                      } as Omit<BlockItem, "id">);
                      upd({ tableChartEnabled: false });
                    }}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-left text-[11px] hover:border-[var(--accent)]/50 transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Extract chart → new block item
                  </button>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">Creates a standalone chart item in this block, linked to the table data.</p>
                </div>
              )}

              {/* Chart type */}
              <div>
                <p className="text-[11px] text-[var(--text-muted)] mb-1.5">Type</p>
                <div className="grid grid-cols-4 gap-1">
                  {GRAPH_TYPES.filter(gt => gt.id !== "scatter").map((gt) => (
                    <button key={gt.id} onClick={() => upd({ tableChartType: gt.id })}
                      className={cn("flex flex-col items-center gap-0.5 rounded border px-1 py-2 text-[10px] transition-all",
                        (item.tableChartType ?? "bar") === gt.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                      )}>
                      <span className="text-base leading-none">{gt.icon}</span>
                      <span className="leading-tight text-center">{gt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Data mapping */}
              {usable.length > 1 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-[var(--text-muted)] font-medium">Data</p>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wide">Label column</p>
                    <div className="flex flex-wrap gap-1">
                      {usable.map((c) => (
                        <button key={c.id} onClick={() => upd({ tableChartLabelColId: c.id, tableChartValueColIds: undefined })}
                          className={cn("px-2 py-0.5 rounded text-[11px] border transition-colors", labelColId === c.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          )}>{c.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wide">Value columns</p>
                    <div className="flex flex-wrap gap-1">
                      {usable.filter((c) => c.id !== labelColId).map((c) => {
                        const checked = valueColIds.includes(c.id);
                        return (
                          <button key={c.id}
                            onClick={() => { const next = checked ? valueColIds.filter((id) => id !== c.id) : [...valueColIds, c.id]; if (next.length > 0) upd({ tableChartValueColIds: next }); }}
                            className={cn("px-2 py-0.5 rounded text-[11px] border transition-colors", checked
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            )}>{c.name}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Series colors */}
              <div>
                <p className="text-[11px] text-[var(--text-muted)] mb-1.5 font-medium">Series colors</p>
                <div className="flex flex-col gap-1.5">
                  {valueColIds.map((colId, i) => {
                    const col = cols.find((c) => c.id === colId);
                    return (
                      <label key={colId} className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                        <span className="relative h-5 w-5 rounded-full border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: chartColors[i % chartColors.length] }}>
                          <input type="color" value={chartColors[i % chartColors.length]} onChange={(e) => { const c = [...chartColors]; c[i] = e.target.value; upd({ tableChartColors: c }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">{col?.name ?? colId}</span>
                        <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">{chartColors[i % chartColors.length]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Titles */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[var(--text-muted)] font-medium">Labels</p>
                <input className={inputCls} placeholder="Chart title…" value={item.tableChartTitle ?? ""} onChange={e => upd({ tableChartTitle: e.target.value || undefined })} onMouseDown={e => e.stopPropagation()} />
                <div className="flex gap-2">
                  <input className={cn(inputCls, "flex-1")} placeholder="X axis label…" value={item.tableChartXAxisTitle ?? ""} onChange={e => upd({ tableChartXAxisTitle: e.target.value || undefined })} onMouseDown={e => e.stopPropagation()} />
                  <input className={cn(inputCls, "flex-1")} placeholder="Y axis label…" value={item.tableChartYAxisTitle ?? ""} onChange={e => upd({ tableChartYAxisTitle: e.target.value || undefined })} onMouseDown={e => e.stopPropagation()} />
                </div>
              </div>

              {/* Font */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[var(--text-muted)] font-medium">Font</p>
                <div className="flex items-center gap-2">
                  <FontPicker compact value={item.tableChartFontFamily ?? "Inter"} onChange={f => { loadGoogleFont(f); upd({ tableChartFontFamily: f }); }} />
                  <input type="number" min={8} max={20} value={item.tableChartFontSize ?? 10}
                    onChange={e => upd({ tableChartFontSize: Number(e.target.value) })}
                    onMouseDown={e => e.stopPropagation()}
                    className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs outline-none" />
                  <span className="text-[11px] text-[var(--text-muted)]">px</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                  <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableChartFontColor ?? "#888888" }}>
                    <input type="color" value={item.tableChartFontColor ?? "#888888"} onChange={e => upd({ tableChartFontColor: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">Axis / label color</span>
                  {item.tableChartFontColor && <button onClick={() => upd({ tableChartFontColor: undefined })} className="ml-auto text-[var(--text-muted)] hover:text-red-400"><XIcon size={11} /></button>}
                </label>
              </div>

              {/* Background */}
              <div>
                <p className="text-[11px] text-[var(--text-muted)] mb-1.5 font-medium">Background</p>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors">
                  <span className="relative h-5 w-5 rounded border border-white/20 overflow-hidden flex-shrink-0" style={{ backgroundColor: item.tableChartBgColor ?? "transparent" }}>
                    <input type="color" value={item.tableChartBgColor ?? "#1a1b1e"} onChange={e => upd({ tableChartBgColor: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">Chart background</span>
                  {item.tableChartBgColor && <button onClick={() => upd({ tableChartBgColor: undefined })} className="ml-auto text-[var(--text-muted)] hover:text-red-400"><XIcon size={11} /></button>}
                </label>
              </div>

              {/* Stroke / radius */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[var(--text-muted)] font-medium">Shape</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">Bar radius</span>
                  <input type="range" min={0} max={16} value={item.tableChartBarRadius ?? 3} onChange={e => upd({ tableChartBarRadius: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-6 text-right text-[11px] text-[var(--text-muted)]">{item.tableChartBarRadius ?? 3}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">Stroke width</span>
                  <input type="range" min={1} max={8} value={item.tableChartStrokeWidth ?? 2} onChange={e => upd({ tableChartStrokeWidth: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-6 text-right text-[11px] text-[var(--text-muted)]">{item.tableChartStrokeWidth ?? 2}</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["tableChartShowGrid", "Grid lines", item.tableChartShowGrid ?? true],
                  ["tableChartShowLegend", "Legend", item.tableChartShowLegend ?? true],
                  ["tableChartShowDataLabels", "Data labels", !!item.tableChartShowDataLabels],
                  ["tableChartSmooth", "Smooth curves", item.tableChartSmooth !== false],
                ] as [keyof BlockItem, string, boolean][]).map(([key, label, val]) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-[var(--border)] px-2.5 py-2 hover:border-[var(--text-muted)] transition-colors select-none">
                    <input type="checkbox" checked={val} onChange={e => upd({ [key]: e.target.checked })} className="accent-[var(--accent)]" />
                    <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
                  </label>
                ))}
              </div>

            </div>
          );
        })()}
      </section>

      {/* Collaboration */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Collaboration</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!item.tableCollabEnabled}
            onChange={(e) => upd({ tableCollabEnabled: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-[var(--text-secondary)]">Shared table (real-time)</span>
        </label>
        {item.tableCollabEnabled && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] pl-5">
            <Users size={10} />
            <span>Connect Supabase to enable live row sync.</span>
          </div>
        )}
      </section>

    </div>
  );
}

// ─── Custom Widget ────────────────────────────────────────────────────────────

function WidgetItem({ item, upd, vars, collapsed, isFinished, extraContextItems, boardId, boxId, canInteract }: {
  item: BlockItem;
  upd: (p: Partial<BlockItem>) => void;
  vars: Record<string, number>;
  collapsed?: boolean;
  isFinished?: boolean;
  extraContextItems?: ContextMenuEntry[];
  boardId?: string;
  boxId?: string; // "" for canvas-level widgets (BoardItemWidget convention)
  canInteract?: boolean;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [tab, setTab] = useState<"preview" | "code" | "perms">("preview");
  const [draft, setDraft] = useState(item.widgetCode ?? DEFAULT_WIDGET_CODE);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { members, serverId } = useServerBoard();
  const { broadcastOp } = useCollab();
  // Viewer-privilege principle: the widget can never do what the viewing user
  // couldn't do by hand — mutations require the viewer's own edit rights.
  const canEditBoard = useCanEditBoard();
  const apiLimiterRef = useRef(new RateLimiter(20, 10));
  // Live refs so the mount-once message listener never acts on stale props
  const liveRef = useRef({ upd, isFinished, item, members, broadcastOp, boardId, boxId, canEditBoard, canInteract, serverId });
  liveRef.current = { upd, isFinished, item, members, broadcastOp, boardId, boxId, canEditBoard, canInteract, serverId };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (stateDebounceRef.current) clearTimeout(stateDebounceRef.current);
    };
  }, []);

  // Plugin API dispatcher — every call is validated here before touching the app.
  // See lib/widgetApi.ts for the protocol and docs/widget-api.md for the reference.
  const handleApiCall = (data: { id?: unknown; method?: unknown; args?: unknown }) => {
    const id = (typeof data.id === "string" || typeof data.id === "number") ? data.id : "";
    const respond = (ok: boolean, payload?: unknown, error?: string, code?: WidgetApiErrorCode) => {
      const msg: WidgetApiResponse = { type: "plancraft-api-result", id, ok, apiVersion: WIDGET_API_VERSION, data: payload, error, code };
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
    };
    const method = typeof data.method === "string" ? data.method : "";
    if (!(method in METHOD_PERMISSIONS)) { respond(false, undefined, `Unknown method: ${method}`, "UNKNOWN_METHOD"); return; }
    if (!apiLimiterRef.current.allow()) { respond(false, undefined, "Rate limit exceeded", "RATE_LIMITED"); return; }

    const live = liveRef.current;
    const required = METHOD_PERMISSIONS[method];
    const granted = new Set(live.item.widgetPermissions ?? []);
    if (required && !granted.has(required)) {
      respond(false, undefined, `Permission "${required}" not granted — a board editor can enable it in this widget's Permissions tab`, "PERMISSION_DENIED");
      return;
    }

    const store = useBoardStore.getState();
    const board = store.boards.find((b) => b.id === live.boardId) ?? (live.boardId ? store.serverBoards[live.boardId] : undefined);
    if (!board || !live.boardId) { respond(false, undefined, "No board context", "NO_CONTEXT"); return; }
    const inBox = !!live.boxId;
    const args = (data.args && typeof data.args === "object" ? data.args : {}) as Record<string, unknown>;
    // Mutations run as the viewing user — read-only viewers' widgets can't change the board.
    const viewerCanMutate = live.canEditBoard && !live.isFinished;

    switch (method) {
      case "system.getInfo": {
        respond(true, {
          apiVersion: WIDGET_API_VERSION,
          container: inBox ? "box" : "canvas",
          permissions: [...granted],
          canEdit: viewerCanMutate,
          isFinished: !!live.isFinished,
          boardKind: live.serverId ? "server" : "personal",
        });
        return;
      }
      case "self.getRect": {
        if (inBox) {
          const box = board.boxes.find((b) => b.id === live.boxId);
          if (!box) { respond(false, undefined, "Own block not found", "NOT_FOUND"); return; }
          respond(true, { x: box.x, y: box.y, width: box.width, height: box.height, container: "box" });
        } else {
          const bi = board.boardItems?.find((i) => i.id === live.item.id);
          if (!bi) { respond(false, undefined, "Own item not found", "NOT_FOUND"); return; }
          respond(true, { x: bi.boardX, y: bi.boardY, width: bi.boardW, height: bi.boardH, container: "canvas" });
        }
        return;
      }
      case "self.move": {
        if (live.isFinished) { respond(false, undefined, "Board is locked", "BOARD_LOCKED"); return; }
        if (!live.canEditBoard) { respond(false, undefined, "The viewing user can't edit this board", "VIEWER_FORBIDDEN"); return; }
        const x = clampCoord(args.x); const y = clampCoord(args.y);
        if (x === null || y === null) { respond(false, undefined, "x and y must be finite numbers", "INVALID_ARGS"); return; }
        if (inBox) {
          store.moveBox(live.boardId, live.boxId!, x, y);
          live.broadcastOp({ op: "moveBox", boardId: live.boardId, boxId: live.boxId!, x, y });
        } else {
          store.moveBoardItem(live.boardId, live.item.id, x, y);
        }
        respond(true, { x, y });
        return;
      }
      case "self.resize": {
        if (live.isFinished) { respond(false, undefined, "Board is locked", "BOARD_LOCKED"); return; }
        if (!live.canEditBoard) { respond(false, undefined, "The viewing user can't edit this board", "VIEWER_FORBIDDEN"); return; }
        const w = clampSize(args.width); const h = clampSize(args.height);
        if (w === null || h === null) { respond(false, undefined, "width and height must be finite numbers", "INVALID_ARGS"); return; }
        if (inBox) {
          store.resizeBox(live.boardId, live.boxId!, w, h);
          live.broadcastOp({ op: "resizeBox", boardId: live.boardId, boxId: live.boxId!, width: w, height: h });
        } else {
          store.updateBoardItem(live.boardId, live.item.id, { boardW: w, boardH: h });
        }
        respond(true, { width: w, height: h });
        return;
      }
      case "board.getRects": {
        const boxes = board.boxes
          .filter((b) => !b.deckOwnerId)
          .slice(0, 200)
          .map((b) => ({ id: b.id, kind: "box", x: b.x, y: b.y, width: b.width, height: b.height, title: b.title, self: inBox && b.id === live.boxId }));
        const canvasItems = (board.boardItems ?? [])
          .slice(0, 200)
          .map((i) => ({ id: i.id, kind: "item", x: i.boardX, y: i.boardY, width: i.boardW, height: i.boardH, title: "", self: !inBox && i.id === live.item.id }));
        respond(true, { rects: [...boxes, ...canvasItems] });
        return;
      }
      case "members.list": {
        respond(true, {
          members: live.members.slice(0, 500).map((m) => ({
            userId: m.userId, username: m.username, avatar: m.avatar, role: m.role, online: m.online,
          })),
        });
        return;
      }
    }
  };

  // Wallpaper mode: forward globally-polled cursor positions into the iframe as
  // { type: "plancraft-cursor", x, y, inside } (widget-relative coords). This is
  // how hover interactivity works on the desktop — no real input ever arrives.
  useEffect(() => {
    const onCursor = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      const el = iframeRef.current;
      if (!el || !d) return;
      const r = el.getBoundingClientRect();
      el.contentWindow?.postMessage({
        type: "plancraft-cursor",
        x: d.x - r.left,
        y: d.y - r.top,
        inside: d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom,
      }, "*");
    };
    window.addEventListener("crecoard-wallpaper-cursor", onCursor);
    return () => window.removeEventListener("crecoard-wallpaper-cursor", onCursor);
  }, []);

  // Widget → parent messages. State saves ({ type: "plancraft-save-state", state })
  // land in item.widgetState — sandboxed widgets (opaque origin) have no
  // localStorage, so this bridge is their only persistence. API calls
  // ({ type: "plancraft-api", ... }) go through the dispatcher above.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { type?: string; state?: unknown } | null;
      if (!data) return;
      if (data.type === "plancraft-api") {
        handleApiCall(data as { id?: unknown; method?: unknown; args?: unknown });
        return;
      }
      if (data.type !== "plancraft-save-state") return;
      const l = liveRef.current;
      if (l.isFinished) return; // locked board = read-only
      // State saves need edit rights OR the item's "interact" permission
      // (so e.g. a pet can be feedable by visitors when the owner allows it).
      if (!l.canEditBoard && l.canInteract === false) return;
      let json: string | undefined;
      try { json = JSON.stringify(data.state); } catch { return; }
      if (json === undefined || json.length > 8192) return; // cap — state lives in the board JSONB
      const state = data.state;
      if (stateDebounceRef.current) clearTimeout(stateDebounceRef.current);
      stateDebounceRef.current = setTimeout(() => liveRef.current.upd({ widgetState: state }), 400);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync draft → store with debounce
  const handleCodeChange = (code: string) => {
    setDraft(code);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => upd({ widgetCode: code }), 600);
  };

  // File-based workflow: build widget.html locally, upload/drop it here (no pasting)
  const codeFileRef = useRef<HTMLInputElement>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const flashCodeMsg = (msg: string) => {
    setCodeMsg(msg);
    setTimeout(() => setCodeMsg(null), 3000);
  };
  const loadCodeFile = (file: File) => {
    if (file.size > 262_144) { flashCodeMsg("File too large (max 256 KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!text.trim()) { flashCodeMsg("File is empty"); return; }
      handleCodeChange(text);
      flashCodeMsg(`Loaded ${file.name}`);
      setTab("preview");
    };
    reader.readAsText(file);
  };
  const downloadCode = () => {
    const blob = new Blob([draft], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "widget.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Send vars whenever they change or iframe (re)loads
  const sendVars = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "plancraft-vars", vars },
      "*"
    );
  };

  // Replay persisted state into the iframe on load
  const sendState = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "plancraft-state", state: item.widgetState ?? null },
      "*"
    );
  };

  useEffect(() => { sendVars(); }, [vars]); // eslint-disable-line react-hooks/exhaustive-deps

  const srcDoc = item.widgetCode ?? DEFAULT_WIDGET_CODE;

  if (collapsed) {
    return (
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="w-full border-none rounded"
        style={{ height: "100%", pointerEvents: "none" }}
        onLoad={() => { sendVars(); sendState(); }}
      />
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* Tab bar */}
      {!isFinished && (
        <div
          className="flex flex-shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-1"
          style={{ background: "var(--surface-overlay)" }}
        >
          {(["preview", "code", "perms"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {t === "code" ? "< Code >" : t === "perms" ? "Permissions" : "Preview"}
            </button>
          ))}
          <button
            onClick={() => codeFileRef.current?.click()}
            title="Upload an .html file as this widget's code"
            className="ml-1 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Upload size={11} /> Upload
          </button>
          <button
            onClick={downloadCode}
            title="Download the current code as widget.html"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FileDown size={11} /> Download
          </button>
          <input
            ref={codeFileRef}
            type="file"
            accept=".html,.htm,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) loadCodeFile(f); }}
          />
          <span className="ml-auto text-[11px] text-[var(--text-muted)]">
            {codeMsg ?? ((item.widgetPermissions?.length ?? 0) > 0 ? `${item.widgetPermissions!.length} permission(s)` : "HTML · CSS · JS")}
          </span>
        </div>
      )}

      {/* Content */}
      {!isFinished && tab === "perms" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3" style={{ background: "var(--surface)" }}>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Grant this widget access to the plugin API. Permissions travel with the item when shared —
            installers are asked to approve them before they take effect.
          </p>
          {WIDGET_PERMISSIONS.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent)]"
                checked={(item.widgetPermissions ?? []).includes(p.id)}
                onChange={(e) => {
                  const cur = new Set(item.widgetPermissions ?? []);
                  if (e.target.checked) cur.add(p.id); else cur.delete(p.id);
                  upd({ widgetPermissions: [...cur] });
                }}
              />
              <span className="flex flex-col">
                <span className="text-xs font-medium text-[var(--text-primary)]">{p.label}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{p.description}</span>
              </span>
            </label>
          ))}
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">Developer reference: docs/widget-api.md</p>
        </div>
      ) : tab === "preview" || isFinished ? (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="flex-1 w-full border-none min-h-0"
          style={{ display: "block" }}
          onLoad={() => {
            sendVars();
            sendState();
            const doc = iframeRef.current?.contentDocument;
            if (!doc) return;
            doc.addEventListener("contextmenu", (e: MouseEvent) => {
              e.preventDefault();
              const el = iframeRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              setCtxMenu({ x: rect.left + e.clientX, y: rect.top + e.clientY });
            });
          }}
        />
      ) : (
        <textarea
          value={draft}
          onChange={(e) => handleCodeChange(e.target.value)}
          spellCheck={false}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files?.[0];
            if (f) loadCodeFile(f);
          }}
          placeholder="Paste widget code, or drop an .html file here…"
          className="flex-1 w-full min-h-0 resize-none outline-none p-3 font-mono text-[11px] leading-relaxed"
          style={{
            background: "var(--surface)",
            color: "var(--text-primary)",
            tabSize: 2,
          }}
          onKeyDown={(e) => {
            // Tab key inserts spaces instead of changing focus
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = draft.substring(0, start) + "  " + draft.substring(end);
              setDraft(next);
              setTimeout(() => { el.selectionStart = el.selectionEnd = start + 2; }, 0);
            }
          }}
        />
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            { label: tab === "code" ? "Switch to preview" : "Switch to code", icon: <Code2 size={14} />, onClick: () => setTab(t => t === "code" ? "preview" : "code") },
            // UI hook: widgets listening for { type: "plancraft-ui", event: "settings" } open their own settings view
            { label: "Widget settings", icon: <Pencil size={14} />, onClick: () => { setTab("preview"); iframeRef.current?.contentWindow?.postMessage({ type: "plancraft-ui", event: "settings" }, "*"); } },
            { label: "Copy code", icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(draft) },
            ...(!isFinished ? ["separator" as const, { label: "Reset to default", icon: <RotateCcw size={14} />, danger: true, onClick: () => handleCodeChange(DEFAULT_WIDGET_CODE) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ─── Playlist ─────────────────────────────────────────────────────────────────


// ─── Multi-platform embed resolver ───────────────────────────────────────────
// resolveEmbed & friends live in lib/playlist so the global PlayerHost (which
// owns the actual media elements — playback survives board switches) shares them.

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform];
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: color ? color + "25" : "var(--surface-overlay)", color: color ?? "var(--text-muted)" }}
    >
      {platform}
    </span>
  );
}

// ─── Animations (shared) ──────────────────────────────────────────────────────

export { ITEM_ANIM_CLASS } from "@/lib/animSpec";
const ANIM_SPEED_DUR: Record<string, string> = { slow: "1.1s", normal: "0.6s", fast: "0.35s" };

export function itemAnimStyle(speed?: string): React.CSSProperties {
  return { "--cr-dur": ANIM_SPEED_DUR[speed ?? "normal"] } as React.CSSProperties;
}

/** Text-item animation preset picker (shared by the text style panels). */
export function TextAnimationSection({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const { serverId } = useServerBoard();
  const [studioOpen, setStudioOpen] = useState(false);
  const presets: { v: BlockItem["textAnimation"] | undefined; label: string }[] = [
    { v: undefined, label: "None" }, { v: "fade", label: "Fade in" }, { v: "rise", label: "Rise" },
    { v: "wipe", label: "Wipe" }, { v: "pulse", label: "Pulse" }, { v: "float", label: "Float" },
    { v: "glitch", label: "Glitch" }, { v: "breathe", label: "Breathe" }, { v: "rainbow", label: "Rainbow" },
  ];
  const cur = item.textAnimation;
  return (
    <div className="px-4 py-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Animation</p>
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((pr) => (
          <button key={pr.label} onClick={() => upd({ textAnimation: pr.v })}
            className={cn("rounded border px-2 py-1.5 text-[11px] transition-colors",
              cur === pr.v ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40")}>
            {pr.label}
          </button>
        ))}
        <button onClick={() => setStudioOpen(true)}
          className={cn("rounded border px-2 py-1.5 text-[11px] transition-colors",
            cur === "custom" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40")}>
          {cur === "custom" ? (item.textAnimationCustom?.name ?? "Custom") : "Custom…"}
        </button>
      </div>
      {studioOpen && (
        <AnimationStudio serverId={serverId} initial={cur === "custom" ? item.textAnimationCustom : undefined}
          onApply={(spec: AnimSpec) => { upd({ textAnimation: "custom", textAnimationCustom: spec }); setStudioOpen(false); }}
          onClose={() => setStudioOpen(false)} />
      )}
      {cur && cur !== "custom" && (
        <div className="mt-2 flex gap-1.5">
          {(["slow", "normal", "fast"] as const).map((sp) => (
            <button key={sp} onClick={() => upd({ textAnimationSpeed: sp === "normal" ? undefined : sp })}
              className={cn("flex-1 rounded border px-2 py-1 text-[11px] capitalize transition-colors",
                (item.textAnimationSpeed ?? "normal") === sp ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]")}>
              {sp}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Fade, Rise and Wipe play once; the rest loop. Skipped for viewers with reduced motion enabled.</p>
    </div>
  );
}

/** Entrance-effect picker — works for every item type (shown in item settings panels). */
export function ItemEntranceSection({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const { serverId } = useServerBoard();
  const [studioOpen, setStudioOpen] = useState(false);
  const presets: { v: BlockItem["itemEntrance"] | undefined; label: string }[] = [
    { v: undefined, label: "None" }, { v: "fade", label: "Fade" }, { v: "scale", label: "Scale" }, { v: "rise", label: "Rise" },
  ];
  return (
    <div className="border-t border-[var(--border)] px-4 py-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Entrance</p>
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((pr) => (
          <button key={pr.label} onClick={() => upd({ itemEntrance: pr.v })}
            className={cn("rounded border px-1 py-1.5 text-[11px] transition-colors",
              item.itemEntrance === pr.v ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40")}>
            {pr.label}
          </button>
        ))}
      </div>
      <button onClick={() => setStudioOpen(true)}
        className={cn("mt-1.5 w-full rounded border px-2 py-1.5 text-[11px] transition-colors",
          item.itemEntrance === "custom" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40")}>
        {item.itemEntrance === "custom" ? (item.itemEntranceCustom?.name ?? "Custom") : "Custom / library…"}
      </button>
      {studioOpen && (
        <AnimationStudio serverId={serverId} initial={item.itemEntrance === "custom" ? item.itemEntranceCustom : undefined}
          onApply={(spec: AnimSpec) => { upd({ itemEntrance: "custom", itemEntranceCustom: spec }); setStudioOpen(false); }}
          onClose={() => setStudioOpen(false)} />
      )}
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Plays once when the item appears on screen.</p>
    </div>
  );
}

function PlaylistItem({ item, upd, boardId, boxId, collapsed, isFinished, canInteract, extraContextItems }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; boardId: string; boxId: string; collapsed?: boolean; isFinished?: boolean; canInteract?: boolean; extraContextItems?: ContextMenuEntry[] }) {
  // Playlists stay interactive even on a finished board — people keep adding songs
  // to a shared queue — so add/remove are intentionally not gated on isFinished.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const tracks = item.playlistTracks ?? [];
  const currentIdx = Math.min(item.playlistCurrentIndex ?? 0, Math.max(0, tracks.length - 1));
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [showVol, setShowVol] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);

  // Reset on mount too: React StrictMode (dev) double-invokes effects (mount →
  // cleanup → mount), and without this the cleanup would leave the ref stuck at
  // false, freezing async UI like the playlist "Importing…" spinner.
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const currentTrack = tracks[currentIdx] ?? null;
  const embed = currentTrack ? resolveEmbed(currentTrack.url, !!item.playlistAutoplay) : null;

  const vol = item.playlistVolume ?? 80;

  // ── Granular per-function permissions (item.perms.fns — see lib/playlist) ──
  const { serverId, viewerRole, viewerRoleIds, isDraftMode } = useServerBoard();
  const canFn = (fn: string) => roleAllowed(viewerRole, viewerRoleIds, item.perms?.fns?.[fn]);
  const canPlayback = canFn("playback");
  const canQueueAdd = canFn("queue-add");
  const canQueueRemove = canFn("queue-remove");
  const canImport = canFn("import");
  const canVolume = canFn("volume");
  const canModes = canFn("modes");
  const canHost = canFn("session-host");

  // ── Live session (server boards): host broadcasts track/play/position ──────
  const session = usePlayerSession(serverId, item.id);
  // While listening to someone else's session, playback follows the host.
  const playbackLocked = session.joined && !session.isHost;
  const canPlaybackUI = canPlayback && !playbackLocked;

  // ── Shared live queue (server boards): tracks added outside draft editing are
  //    stored as contributions (durable + realtime-synced to every viewer) and
  //    merged into the local store copy so playback/sessions see one list.
  //    Draft item writes stay the owner's curated base list.
  const contribCtx = useBoardContributions();
  const { identity } = useUser();
  const canEditQueueBase = useCanEditBoard(); // owner/admin
  useEffect(() => {
    if (!serverId) return;
    return contribCtx.loadAndSubscribe(item.id, boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, item.id, boardId]);
  const contributions = serverId ? (contribCtx.contributionsByItem[item.id] ?? []) : [];
  const contribTracksJson = JSON.stringify(
    contributions
      .filter((c) => c.kind === "track" && c.approved)
      .map((c) => {
        try {
          const d = JSON.parse(c.content) as { url?: string; title?: string };
          if (!d.url) return null;
          return { id: `c-${c.id}`, url: d.url, title: d.title || "Track", contribId: c.id, addedBy: c.authorName, authorId: c.authorId };
        } catch { return null; }
      })
      .filter(Boolean)
  );
  useEffect(() => {
    if (!serverId) return;
    const contribTracks = JSON.parse(contribTracksJson) as PlaylistTrack[];
    const cur = item.playlistTracks ?? [];
    const merged = [...cur.filter((t) => !t.contribId), ...contribTracks];
    if (merged.length === cur.length && merged.every((t, i) => t.id === cur[i]?.id)) return;
    upd({ playlistTracks: merged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contribTracksJson, serverId, item.playlistTracks]);
  /** Adds go into the item only when curating the draft; everywhere else they're contributions. */
  const addsAreContributions = !!serverId && !(canEditQueueBase && isDraftMode);
  /** Moderator adds skip the approval queue; member adds honor the item setting. */
  const addApproved = !item.requireContributionApproval || canEditQueueBase;
  // Tracks awaiting approval — shown only to moderators and their author, and
  // kept OUT of the playable queue so live-session track indexes stay aligned
  // across viewers until approval.
  const pendingTracks: PlaylistTrack[] = !serverId ? [] : contributions
    .filter((c) => c.kind === "track" && !c.approved && (canEditQueueBase || c.authorId === identity.userId))
    .flatMap((c): PlaylistTrack[] => {
      try {
        const d = JSON.parse(c.content) as { url?: string; title?: string };
        if (!d.url) return [];
        return [{ id: `p-${c.id}`, url: d.url, title: d.title || "Track", contribId: c.id, addedBy: c.authorName, authorId: c.authorId }];
      } catch { return []; }
    });

  // ── Global player claim: media lives in PlayerHost so playback survives board
  //    switches; this item registers its embed slot and PlayerHost pins over it.
  const playerKey = playerKeyOf(boardId, boxId ?? "", item.id);
  const activeClaimKey = usePlayerStore((s) =>
    s.claim ? playerKeyOf(s.claim.boardId, s.claim.boxId, s.claim.itemId) : null);
  const playerPlaying = usePlayerStore((s) => s.playing);
  const ownsPlayer = activeClaimKey === playerKey;
  const playingElsewhere = !ownsPlayer && activeClaimKey !== null && playerPlaying === true;
  const claimShape = { boardId, boxId: boxId ?? "", itemId: item.id, canPlayback, canVolume };
  const claimSelf = (opts?: { steal?: boolean; userIntent?: boolean }) =>
    usePlayerStore.getState().claimPlayer(claimShape, opts);

  // Host: push state immediately on local track/play changes (heartbeat covers drift)
  useEffect(() => {
    if (session.isHost) announceSessionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isHost, currentIdx, playerPlaying]);

  const hasPlayableEmbed = !!embed && embed.kind !== "link";
  useEffect(() => {
    // claim if free/idle so simply opening the board pins the player here
    if (hasPlayableEmbed && !collapsed) claimSelf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayableEmbed, collapsed, playerKey]);
  // Playlists stay interactive on finished boards (canInteract bakes isFinished
  // in upstream, but the interact wall is skipped when finished — mirror that
  // here or the pinned player would get pointer-events:none and eat no clicks).
  const slotInteractive = canInteract !== false || !!isFinished;
  const accent = item.playlistAccentColor || "var(--accent)";
  const showList = item.playlistShowList !== false;
  const volSupported = !embed || embed.kind === "audio" || embed.platform === "YouTube" || embed.platform === "SoundCloud";
  const layout = item.playlistLayout ?? (item.playlistCompact ? "minimal" : "stack");
  const br = item.playlistBorderRadius ?? 0;
  const bw = item.playlistBorderWidth ?? 0;
  const bc = item.playlistBorderColor ?? "#ffffff";
  const hasBg = !!(item.playlistBgColor || item.playlistBgGradient);
  const blur = item.playlistBgBlur ?? 0;
  // blur applied directly to bg layers (backdrop-filter breaks inside CSS transforms)
  const blurFilter = blur > 0 ? `blur(${blur}px)` : undefined;
  const bgLayerStyle: React.CSSProperties = hasBg ? {
    background: item.playlistBgGradient
      ? `linear-gradient(${item.playlistBgGradientAngle ?? 135}deg, ${item.playlistBgColor ?? "#1a1a2e"}, ${item.playlistBgGradientTo ?? "#000000"})`
      : item.playlistBgColor,
    opacity: (item.playlistBgOpacity ?? 100) / 100,
    filter: blurFilter,
    // expand beyond bounds so blur edge-fade is hidden
    inset: blur > 0 ? -blur * 1.5 : 0,
  } : {};
  const containerStyle: React.CSSProperties = {
    border: bw > 0 ? `${bw}px solid ${bc}` : undefined,
    borderRadius: br > 0 ? br : undefined,
  };

  // (Volume/YouTube/SoundCloud bridges live in PlayerHost — it owns the media.)

  // Resolve artwork URL for "artwork" layout
  useEffect(() => {
    if (!currentTrack) { setArtworkUrl(null); return; }
    const staticUrl = getStaticThumbnail(currentTrack.url);
    if (staticUrl) { setArtworkUrl(staticUrl); return; }
    let cancelled = false;
    fetch(`/api/thumbnail?url=${encodeURIComponent(currentTrack.url)}`)
      .then((r) => r.json())
      .then((d: { thumbnail?: string | null }) => { if (!cancelled) setArtworkUrl(d.thumbnail ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrack?.url]);

  const goNext = () => {
    if (tracks.length === 0 || !canPlaybackUI) return;
    claimSelf({ steal: true, userIntent: true });
    const next = advancePlaylistIndex(item, 1);
    upd({ playlistCurrentIndex: next ?? Math.min(currentIdx + 1, tracks.length - 1) });
  };

  const goPrev = () => {
    if (tracks.length === 0 || !canPlaybackUI) return;
    claimSelf({ steal: true, userIntent: true });
    const next = advancePlaylistIndex(item, -1);
    upd({ playlistCurrentIndex: next ?? 0 });
  };

  const goTo = (idx: number) => {
    if (!canPlaybackUI) return;
    claimSelf({ steal: true, userIntent: true });
    upd({ playlistCurrentIndex: idx });
  };

  const addTrack = () => {
    const url = urlInput.trim();
    if (!url) return;
    const detected = resolveEmbed(url, false);
    const title = titleInput.trim() || detected.platform + " track";
    if (addsAreContributions) {
      void contribCtx.addContribution(item.id, boardId, JSON.stringify({ url, title }), { kind: "track", approved: addApproved });
    } else {
      const track: PlaylistTrack = { id: nanoid(), url, title };
      // keep the curated base list ahead of contributed tracks
      upd({ playlistTracks: [...tracks.filter((t) => !t.contribId), track, ...tracks.filter((t) => t.contribId)] });
    }
    setUrlInput("");
    setTitleInput("");
  };

  const removeTrack = (id: string) => {
    const t = tracks.find((x) => x.id === id);
    if (t?.contribId) {
      if (t.authorId === identity.userId) void contribCtx.removeOwn(t.contribId, item.id);
      else if (canEditQueueBase) void contribCtx.moderateRemove(t.contribId, item.id);
      return;
    }
    const newTracks = tracks.filter((x) => x.id !== id);
    upd({ playlistTracks: newTracks, playlistCurrentIndex: Math.min(currentIdx, Math.max(0, newTracks.length - 1)) });
  };

  /** Snapshot tracks are removable only where edits are durable (draft / personal). */
  const canRemoveTrack = (t: PlaylistTrack) =>
    canQueueRemove && (t.contribId
      ? (t.authorId === identity.userId || canEditQueueBase)
      : (!serverId || (canEditQueueBase && isDraftMode)));

  // Detect importable playlist URLs (YouTube only for now)
  const importInfo = useMemo(() => {
    const u = urlInput.trim();
    if (!u) return null;
    const ytList = u.match(/youtube\.com\/(?:playlist\?|watch\?[^#]*)list=([A-Za-z0-9_-]+)/);
    if (ytList) return { platform: "YouTube" as const, id: ytList[1] };
    return null;
  }, [urlInput]);

  const handleImportPlaylist = async () => {
    if (!importInfo) return;
    setImporting(true);
    setImportError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(`/api/import-playlist?platform=${importInfo.platform.toLowerCase()}&id=${importInfo.id}`, { signal: ctrl.signal });
      const data: { tracks?: { title: string; url: string }[]; error?: string } = await res.json();
      if (!mountedRef.current) return;
      if (data.error) { setImportError(data.error); return; }
      const newTracks: PlaylistTrack[] = (data.tracks ?? []).map((t) => ({ id: nanoid(), url: t.url, title: t.title }));
      if (addsAreContributions) {
        for (const t of newTracks) {
          void contribCtx.addContribution(item.id, boardId, JSON.stringify({ url: t.url, title: t.title }), { kind: "track", approved: addApproved });
        }
      } else {
        upd({ playlistTracks: [...tracks.filter((t) => !t.contribId), ...newTracks, ...tracks.filter((t) => t.contribId)] });
      }
      setUrlInput("");
      setTitleInput("");
    } catch (e) {
      if (!mountedRef.current) return;
      setImportError(e instanceof DOMException && e.name === "AbortError"
        ? "Import timed out — check your YouTube API key and try again"
        : "Failed to reach import API");
    } finally {
      clearTimeout(timer);
      if (mountedRef.current) setImporting(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex items-center gap-2">
        <Music size={13} className="text-[var(--text-muted)]" />
        <span className="text-sm text-[var(--text-secondary)] truncate">{currentTrack?.title ?? "No tracks"}</span>
        {tracks.length > 1 && canPlaybackUI && (
          <div className="flex gap-1 ml-auto">
            <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><SkipBack size={11} /></button>
            <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><SkipForward size={11} /></button>
          </div>
        )}
      </div>
    );
  }

  // ── Shared sub-renders ──────────────────────────────────────────────────────

  const embedEl = !embed ? (
    <div className="w-full h-full flex items-center justify-center bg-black/20 rounded-lg">
      <div className="text-center">
        <Music size={28} className="text-[var(--text-muted)] mx-auto mb-1 opacity-40" />
        <p className="text-[11px] text-[var(--text-muted)]">Add a track below</p>
      </div>
    </div>
  ) : embed.kind === "iframe" || embed.kind === "audio" ? (
    // Slot for the global PlayerHost: when this item owns the player, the real
    // media (living in PlayerHost so it survives board switches) is pinned
    // exactly over this div. Otherwise offer to take the player over.
    ownsPlayer ? (
      // PlayerHost pins the real media over this div — it finds the slot by
      // querying this attribute directly (a store registry raced hydration).
      <div data-player-slot={playerKey} data-slot-interactive={slotInteractive ? "1" : "0"} className="w-full h-full bg-black" />
    ) : (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/30 rounded-lg py-3">
        <Music size={22} className="text-[var(--text-muted)] opacity-50" />
        {playingElsewhere && (
          <p className="text-[11px] text-[var(--text-muted)] text-center px-3">Another playlist is playing</p>
        )}
        {canPlaybackUI && (
          <button
            onClick={() => claimSelf({ steal: true, userIntent: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accent }}>
            <Play size={11} /> Play here
          </button>
        )}
      </div>
    )
  ) : (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 py-4">
      <PlatformBadge platform={embed.platform} />
      <p className="text-[11px] text-[var(--text-muted)] text-center px-4">{embed.platform} doesn't support embedding.</p>
      <a href={embed.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
        style={{ backgroundColor: accent }}>
        <ExternalLink size={11} /> Open in {embed.platform}
      </a>
    </div>
  );

  const transportEl = tracks.length > 0 ? (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {canPlaybackUI && (
          <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0">
            <SkipBack size={14} />
          </button>
        )}
        <div className="flex-1 min-w-0 text-center">
          <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{currentTrack?.title}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{currentIdx + 1} / {tracks.length} · {embed?.platform}</p>
        </div>
        {canPlaybackUI && (
          <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0">
            <SkipForward size={14} />
          </button>
        )}
        {canModes && (<>
          <button onClick={() => upd({ playlistLoop: !item.playlistLoop })} title="Loop"
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={item.playlistLoop ? { color: accent } : { color: "var(--text-muted)" }}>
            <Repeat size={12} />
          </button>
          <button onClick={() => upd({ playlistShuffle: !item.playlistShuffle })} title="Shuffle"
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={item.playlistShuffle ? { color: accent } : { color: "var(--text-muted)" }}>
            <Shuffle size={12} />
          </button>
        </>)}
        {canVolume && (
          <button
            onClick={() => volSupported && setShowVol((v) => !v)}
            title={volSupported ? "Volume" : `${embed?.platform} doesn't expose a volume API — use its built-in controls`}
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: !volSupported ? "var(--text-muted)" : showVol ? accent : "var(--text-muted)", opacity: volSupported ? 1 : 0.4, cursor: volSupported ? "pointer" : "not-allowed" }}>
            {vol === 0 ? <VolumeX size={12} /> : vol < 50 ? <Volume1 size={12} /> : <Volume2 size={12} />}
          </button>
        )}
      </div>
      {showVol && volSupported && canVolume && (
        <div className="flex items-center gap-2">
          <VolumeX size={10} className="shrink-0 text-[var(--text-muted)]" />
          <input type="range" min={0} max={100} value={vol}
            onChange={(e) => upd({ playlistVolume: Number(e.target.value) })}
            className="flex-1 h-1 cursor-pointer" style={{ accentColor: accent }} />
          <Volume2 size={10} className="shrink-0 text-[var(--text-muted)]" />
          <span className="text-[10px] text-[var(--text-muted)] w-6 text-right tabular-nums">{vol}%</span>
        </div>
      )}
      {/* Live session row — server boards only */}
      {serverId && (session.active || canHost) && (
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          {session.active ? (
            <>
              <span className="flex items-center gap-1 font-semibold shrink-0" style={{ color: accent }}>
                <Radio size={10} /> LIVE
              </span>
              <span className="truncate text-[var(--text-muted)]">
                {session.isHost ? "you're hosting" : session.hostName || "session"} · {session.participants} in
              </span>
              <span className="ml-auto" />
              {session.joined ? (
                <button onClick={session.leave}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  {session.isHost ? "End" : "Leave"}
                </button>
              ) : (
                <button onClick={() => session.join(claimShape, canHost)}
                  className="shrink-0 rounded px-2 py-0.5 text-white font-medium hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: accent }}>
                  Join
                </button>
              )}
            </>
          ) : (
            <button onClick={() => session.start(claimShape)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Start a synced listening session — everyone who joins hears the same thing">
              <Radio size={10} /> Go live
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  const trackListEl = (showList || pendingTracks.length > 0) ? (
    <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0">
      {showList && tracks.map((track, i) => {
        const trackEmbed = resolveEmbed(track.url, false);
        const active = i === currentIdx;
        return (
          <div key={track.id}
            className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors", canPlaybackUI && "cursor-pointer", !active && canPlaybackUI && "hover:bg-white/5")}
            style={active ? { backgroundColor: accent + "25" } : undefined}
            onClick={() => goTo(i)}>
            <span className="text-[11px] tabular-nums w-4 shrink-0 text-center" style={{ color: active ? accent : "var(--text-muted)" }}>{i + 1}</span>
            <PlatformBadge platform={trackEmbed.platform} />
            <span className={cn("flex-1 text-[11px] truncate", active ? "font-medium" : "text-[var(--text-secondary)]")} style={active ? { color: accent } : undefined}
              title={track.addedBy ? `Added by ${track.addedBy}` : undefined}>{track.title}</span>
            {canRemoveTrack(track) && (
              <button onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-muted)] hover:text-red-400 transition-all">
                <XIcon size={10} />
              </button>
            )}
          </div>
        );
      })}
      {pendingTracks.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Pending approval · {pendingTracks.length}
          </p>
          {pendingTracks.map((t) => (
            <div key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 opacity-80">
              <PlatformBadge platform={resolveEmbed(t.url, false).platform} />
              <span className="flex-1 text-[11px] truncate text-[var(--text-secondary)]" title={t.addedBy ? `Added by ${t.addedBy}` : undefined}>
                {t.title}
                {t.addedBy && <span className="text-[var(--text-muted)]"> · {t.addedBy}</span>}
              </span>
              {canEditQueueBase && t.contribId && (
                <button onClick={() => void contribCtx.setApproved(t.contribId!, item.id, true)} title="Approve"
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-green-400 transition-colors">
                  <Check size={11} />
                </button>
              )}
              {t.contribId && (t.authorId === identity.userId || canEditQueueBase) && (
                <button onClick={() => {
                  if (t.authorId === identity.userId) void contribCtx.removeOwn(t.contribId!, item.id);
                  else void contribCtx.moderateRemove(t.contribId!, item.id);
                }} title="Reject"
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-red-400 transition-colors">
                  <XIcon size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const addTrackEl = !canQueueAdd ? null : (
    <div className="shrink-0 border-t border-white/10 pt-2 flex flex-col gap-1.5">
      <input value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setImportError(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") addTrack(); }}
        placeholder="Paste a YouTube URL…"
        className="rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" />
      <div className="flex gap-1.5">
        <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTrack(); }}
          placeholder="Title (optional)"
          className="flex-1 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" />
        <button onClick={addTrack} className="shrink-0 rounded-lg px-2.5 text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: accent }}>
          <Plus size={12} />
        </button>
      </div>
      {/* Playlist import button */}
      {importInfo && canImport && (
        <button
          onClick={handleImportPlaylist}
          disabled={importing}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-600/15 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-600/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {importing
            ? "Importing…"
            : <><Music size={11} /> Import all videos from {importInfo.platform} playlist</>}
        </button>
      )}
      {importError && <p className="text-[11px] text-red-400">{importError === "YOUTUBE_API_KEY not configured" ? "Add YOUTUBE_API_KEY to your .env to enable playlist import" : importError}</p>}
      {urlInput && !importInfo && (() => {
        const preview = resolveEmbed(urlInput, false);
        return (
          <p className="text-[11px] text-[var(--text-muted)]">
            Detected: <span style={{ color: PLATFORM_COLORS[preview.platform] ?? "var(--text-secondary)" }}>{preview.platform}</span>
            {preview.isPlaylist && " playlist"}
            {preview.kind === "link" && " · will open in new tab"}
          </p>
        );
      })()}
    </div>
  );

  // ── Layout assembly ─────────────────────────────────────────────────────────

  let inner: React.ReactNode;

  if (layout === "card") {
    // Embed fills box; frosted-glass transport + tracklist overlaid at bottom
    inner = (
      <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden bg-black">
        <div className="absolute inset-0">{embedEl}</div>
        <div className="absolute bottom-0 left-0 right-0 p-2 flex flex-col gap-1.5"
          style={{ backdropFilter: "blur(18px) saturate(1.4)", background: "rgba(0,0,0,0.6)" }}>
          {transportEl}
          {trackListEl && <div className="max-h-28 overflow-y-auto">{trackListEl}</div>}
          {addTrackEl}
        </div>
      </div>
    );
  } else if (layout === "side") {
    // Embed on left, controls + list on right
    inner = (
      <div className="flex flex-1 min-h-0 gap-2">
        <div className="w-[45%] shrink-0 rounded-lg overflow-hidden bg-black">
          {embedEl}
        </div>
        <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
          {transportEl && <div className="shrink-0">{transportEl}</div>}
          {trackListEl}
          {addTrackEl}
        </div>
      </div>
    );
  } else if (layout === "minimal") {
    // Controls + list only, no embed
    inner = (
      <>
        {transportEl && <div className="shrink-0">{transportEl}</div>}
        {trackListEl}
        {addTrackEl}
      </>
    );
  } else if (layout === "artwork") {
    // Full-bleed album art with scrim overlay at bottom
    const platformColor = embed ? (PLATFORM_COLORS[embed.platform] ?? "#1db954") : "#1db954";
    inner = (
      <div className="flex flex-col h-full gap-1.5">
        <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden"
          style={{ background: artworkUrl ? "black" : `linear-gradient(135deg, ${platformColor}33, ${platformColor}11)` }}>
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setArtworkUrl(null)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Music size={40} style={{ color: platformColor, opacity: 0.3 }} />
            </div>
          )}
          {/* gradient scrim */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.3) 45%, transparent 100%)",
          }} />
          {/* overlay controls */}
          <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-1 flex flex-col gap-1.5">
            {currentTrack && (
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white truncate leading-tight">{currentTrack.title}</p>
                {embed?.platform && (
                  <p className="text-[10px] font-medium truncate" style={{ color: platformColor }}>{embed.platform}</p>
                )}
              </div>
            )}
            {tracks.length > 0 && transportEl && (
              <div className="[&_button]:text-white [&_input[type='range']]:opacity-90 [&_button:hover]:opacity-70">
                {transportEl}
              </div>
            )}
          </div>
        </div>
        {addTrackEl && <div className="shrink-0">{addTrackEl}</div>}
      </div>
    );
  } else {
    // stack (default): embed on top, controls below, then list
    const embedWrapper = !embed ? (
      <div className="shrink-0 rounded-lg overflow-hidden bg-black/20" style={{ aspectRatio: "16/9" }}>{embedEl}</div>
    ) : embed.kind === "iframe" ? (
      <div className="shrink-0 rounded-lg overflow-hidden bg-black"
        style={embed.fixedHeight ? { height: embed.fixedHeight } : { aspectRatio: embed.aspectRatio ?? "16/9" }}>
        {embedEl}
      </div>
    ) : embed.kind === "audio" ? (
      <div className="shrink-0 rounded-lg overflow-hidden bg-[var(--surface-overlay)] p-2" style={{ height: 56 }}>{embedEl}</div>
    ) : (
      <div className="shrink-0 rounded-lg bg-[var(--surface-overlay)]" style={{ minHeight: 80 }}>{embedEl}</div>
    );
    inner = (
      <>
        {embedWrapper}
        {transportEl && <div className="shrink-0">{transportEl}</div>}
        {trackListEl}
        {addTrackEl}
      </>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden" style={containerStyle} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* BG: image layer */}
      {item.playlistBgImage && (
        <div aria-hidden style={{
          position: "absolute",
          inset: blur > 0 ? -blur * 1.5 : 0,
          zIndex: 0, pointerEvents: "none",
          backgroundImage: `url(${item.playlistBgImage})`,
          backgroundSize: "cover", backgroundPosition: "center",
          opacity: (item.playlistBgImageOpacity ?? 100) / 100,
          filter: blurFilter,
        }} />
      )}
      {/* BG: color / gradient layer */}
      {hasBg && (
        <div aria-hidden style={{
          position: "absolute", zIndex: 1, pointerEvents: "none",
          ...bgLayerStyle,
        }} />
      )}
      {/* Content */}
      <div className={cn("relative flex flex-col h-full gap-2", layout !== "card" && "p-1.5")} style={{ zIndex: 2 }}>
        {inner}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            ...(tracks.length > 0 ? [{ label: "Clear queue", icon: <Trash2 size={14} />, danger: true, onClick: () => upd({ playlistTracks: [] }) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ── Layout icon thumbnails for PlaylistStylePanel ─────────────────────────────
function PlaylistLayoutIcon({ layout }: { layout: string }) {
  if (layout === "stack") return (
    <svg viewBox="0 0 28 20" fill="none" className="w-7 h-5">
      <rect x="1" y="1" width="26" height="10" rx="1.5" fill="currentColor" opacity=".35"/>
      <rect x="1" y="13" width="26" height="2.5" rx="1" fill="currentColor" opacity=".6"/>
      <rect x="1" y="16.5" width="18" height="2.5" rx="1" fill="currentColor" opacity=".4"/>
    </svg>
  );
  if (layout === "card") return (
    <svg viewBox="0 0 28 20" fill="none" className="w-7 h-5">
      <rect x="1" y="1" width="26" height="18" rx="1.5" fill="currentColor" opacity=".2"/>
      <rect x="1" y="13" width="26" height="6" rx="1.5" fill="currentColor" opacity=".55"/>
      <rect x="3" y="14.5" width="10" height="1.5" rx=".75" fill="currentColor" opacity=".9"/>
      <rect x="3" y="17" width="7" height="1.5" rx=".75" fill="currentColor" opacity=".6"/>
    </svg>
  );
  if (layout === "side") return (
    <svg viewBox="0 0 28 20" fill="none" className="w-7 h-5">
      <rect x="1" y="1" width="11" height="18" rx="1.5" fill="currentColor" opacity=".35"/>
      <rect x="14" y="1" width="13" height="3" rx="1" fill="currentColor" opacity=".6"/>
      <rect x="14" y="6" width="13" height="2.5" rx="1" fill="currentColor" opacity=".4"/>
      <rect x="14" y="10" width="9" height="2.5" rx="1" fill="currentColor" opacity=".3"/>
    </svg>
  );
  if (layout === "artwork") return (
    <svg viewBox="0 0 28 20" fill="none" className="w-7 h-5">
      <rect x="1" y="1" width="26" height="19" rx="1.5" fill="currentColor" opacity=".18"/>
      {/* big square album art */}
      <rect x="3" y="2.5" width="22" height="12" rx="1" fill="currentColor" opacity=".38"/>
      {/* music note inside */}
      <rect x="11" y="5.5" width="1.5" height="4.5" rx=".75" fill="currentColor" opacity=".7"/>
      <rect x="11" y="5.5" width="4" height="1.5" rx=".75" fill="currentColor" opacity=".7"/>
      <circle cx="11.75" cy="10.2" r="1.2" fill="currentColor" opacity=".7"/>
      {/* scrim bar at bottom of art */}
      <rect x="1" y="12" width="26" height="8" rx="0" fill="currentColor" opacity=".3"/>
      {/* track name line */}
      <rect x="3" y="13.5" width="12" height="1.5" rx=".75" fill="currentColor" opacity=".85"/>
      {/* controls row */}
      <circle cx="5" cy="17.5" r="1.1" fill="currentColor" opacity=".6"/>
      <circle cx="9" cy="17.5" r="1.1" fill="currentColor" opacity=".6"/>
      <circle cx="13" cy="17.5" r="1.1" fill="currentColor" opacity=".6"/>
    </svg>
  );
  // minimal
  return (
    <svg viewBox="0 0 28 20" fill="none" className="w-7 h-5">
      <rect x="1" y="5" width="26" height="3" rx="1.5" fill="currentColor" opacity=".6"/>
      <rect x="1" y="10" width="26" height="2.5" rx="1" fill="currentColor" opacity=".4"/>
      <rect x="1" y="14" width="18" height="2.5" rx="1" fill="currentColor" opacity=".3"/>
    </svg>
  );
}

export function PlaylistStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const [openPicker, setOpenPicker] = useState<"accent" | "bg" | "bgGradTo" | "border" | null>(null);
  const bgImgFileRef = useRef<HTMLInputElement>(null);
  const accent = item.playlistAccentColor || "var(--accent)";
  const layout = item.playlistLayout ?? (item.playlistCompact ? "minimal" : "stack");

  const LAYOUTS = [
    { value: "stack",   label: "Stack"   },
    { value: "card",    label: "Card"    },
    { value: "side",    label: "Side"    },
    { value: "minimal", label: "Minimal" },
    { value: "artwork", label: "Art"     },
  ] as const;

  const SLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</p>
  );

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">

      {/* Title */}
      <section>
        <SLabel>Title</SLabel>
        <input value={item.playlistTitle ?? ""} onChange={(e) => upd({ playlistTitle: e.target.value })}
          placeholder="My Study Playlist"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50" />
      </section>

      {/* Layout */}
      <section>
        <SLabel>Layout</SLabel>
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUTS.map(({ value, label }) => (
            <button key={value} onClick={() => upd({ playlistLayout: value, playlistCompact: value === "minimal" ? true : false })}
              className={cn("flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors", layout === value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40")}>
              <PlaylistLayoutIcon layout={value} />
              <span className="text-[10px]">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={item.playlistShowList !== false} onChange={(e) => upd({ playlistShowList: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Show track list</span>
          </label>
        </div>
      </section>

      {/* Playback */}
      <section>
        <SLabel>Playback</SLabel>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!item.playlistLoop} onChange={(e) => upd({ playlistLoop: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Loop playlist</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!item.playlistShuffle} onChange={(e) => upd({ playlistShuffle: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Shuffle</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!item.playlistAutoplay} onChange={(e) => upd({ playlistAutoplay: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Autoplay on switch</span>
          </label>
        </div>
      </section>

      {/* Member additions (server boards) */}
      <section>
        <SLabel>Added tracks</SLabel>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!item.requireContributionApproval} onChange={(e) => upd({ requireContributionApproval: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-[var(--text-secondary)]">Require approval for member-added tracks</span>
        </label>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Pending tracks are only visible to admins and their author until approved.</p>
      </section>

      {/* Volume */}
      <section>
        <SLabel>Volume</SLabel>
        <div className="flex items-center gap-2">
          <VolumeX size={11} className="shrink-0 text-[var(--text-muted)]" />
          <input type="range" min={0} max={100} value={item.playlistVolume ?? 80}
            onChange={(e) => upd({ playlistVolume: Number(e.target.value) })}
            className="flex-1 h-1 cursor-pointer" style={{ accentColor: accent }} />
          <Volume2 size={11} className="shrink-0 text-[var(--text-muted)]" />
          <span className="tabular-nums w-7 text-right text-[var(--text-muted)]">{item.playlistVolume ?? 80}%</span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-tight">Volume works for YouTube and uploaded audio files.</p>
      </section>

      {/* Background */}
      <section>
        <SLabel>Background</SLabel>
        <div className="flex flex-col gap-3">

          {/* Background image */}
          <div>
            <span className="text-[var(--text-secondary)] mb-1.5 block">Image</span>
            {item.playlistBgImage ? (
              <div className="flex items-center gap-2">
                <div className="w-10 h-7 rounded border border-[var(--border)] bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${item.playlistBgImage})` }} />
                <button onClick={() => upd({ playlistBgImage: undefined })} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">Remove</button>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[var(--text-muted)]">Opacity</span>
                  <input type="range" min={0} max={100} value={item.playlistBgImageOpacity ?? 100}
                    onChange={(e) => upd({ playlistBgImageOpacity: Number(e.target.value) })}
                    className="w-16 h-1 cursor-pointer" style={{ accentColor: accent }} />
                  <span className="tabular-nums w-6 text-right text-[var(--text-muted)]">{item.playlistBgImageOpacity ?? 100}%</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  placeholder="https://… or paste image URL"
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/50"
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) upd({ playlistBgImage: v }); } }}
                  onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v) upd({ playlistBgImage: v }); }}
                />
                <button onClick={() => bgImgFileRef.current?.click()} className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Upload image">
                  <ImageIcon size={12} />
                </button>
                <input ref={bgImgFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  applyImageUpload(f, (url) => upd({ playlistBgImage: url }));
                  e.target.value = "";
                }} />
              </div>
            )}
          </div>

          {/* Color / gradient */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Color</span>
              <div className="flex items-center gap-1.5">
                {item.playlistBgColor && (
                  <button onClick={() => upd({ playlistBgColor: undefined, playlistBgGradient: false })} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
                )}
                <div className="relative">
                  <button className="h-5 w-5 rounded border border-[var(--border)]"
                    style={{ background: item.playlistBgColor || "transparent", backgroundImage: item.playlistBgColor ? undefined : "linear-gradient(45deg,#888 25%,transparent 25%,transparent 75%,#888 75%),linear-gradient(45deg,#888 25%,transparent 25%,transparent 75%,#888 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0,3px 3px" }}
                    onClick={() => setOpenPicker(openPicker === "bg" ? null : "bg")} />
                  {openPicker === "bg" && (
                    <div className="absolute right-0 top-7 z-50 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                      <input type="color" value={item.playlistBgColor || "#000000"} onChange={(e) => upd({ playlistBgColor: e.target.value })} className="h-8 w-24 cursor-pointer border-0 p-0" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {item.playlistBgColor && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Opacity</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={0} max={100} value={item.playlistBgOpacity ?? 100}
                      onChange={(e) => upd({ playlistBgOpacity: Number(e.target.value) })}
                      className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
                    <span className="tabular-nums w-6 text-right text-[var(--text-muted)]">{item.playlistBgOpacity ?? 100}%</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!item.playlistBgGradient} onChange={(e) => upd({ playlistBgGradient: e.target.checked })} className="accent-[var(--accent)]" />
                  <span className="text-[var(--text-secondary)]">Gradient</span>
                </label>
                {item.playlistBgGradient && (
                  <div className="flex flex-col gap-2 pl-4 border-l border-[var(--border)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">To color</span>
                      <div className="relative">
                        <button className="h-5 w-5 rounded border border-[var(--border)]"
                          style={{ background: item.playlistBgGradientTo || "#000000" }}
                          onClick={() => setOpenPicker(openPicker === "bgGradTo" ? null : "bgGradTo")} />
                        {openPicker === "bgGradTo" && (
                          <div className="absolute right-0 top-7 z-50 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                            <input type="color" value={item.playlistBgGradientTo || "#000000"} onChange={(e) => upd({ playlistBgGradientTo: e.target.value })} className="h-8 w-24 cursor-pointer border-0 p-0" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Angle</span>
                      <div className="flex items-center gap-1.5">
                        <input type="range" min={0} max={360} value={item.playlistBgGradientAngle ?? 135}
                          onChange={(e) => upd({ playlistBgGradientAngle: Number(e.target.value) })}
                          className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
                        <span className="tabular-nums w-7 text-right text-[var(--text-muted)]">{item.playlistBgGradientAngle ?? 135}°</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Background blur */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Blur</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={0} max={24} value={item.playlistBgBlur ?? 0}
                onChange={(e) => upd({ playlistBgBlur: Number(e.target.value) })}
                className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-6 text-right text-[var(--text-muted)]">{item.playlistBgBlur ?? 0}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section>
        <SLabel>Appearance</SLabel>
        <div className="flex flex-col gap-2">
          {/* Accent color */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Accent color</span>
            <div className="relative">
              <button className="h-5 w-5 rounded border border-[var(--border)]"
                style={{ background: item.playlistAccentColor || "var(--accent)" }}
                onClick={() => setOpenPicker(openPicker === "accent" ? null : "accent")} />
              {openPicker === "accent" && (
                <div className="absolute right-0 top-7 z-50 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                  <input type="color" value={item.playlistAccentColor || "#d59ee8"} onChange={(e) => upd({ playlistAccentColor: e.target.value })} className="h-8 w-24 cursor-pointer border-0 p-0" />
                  <button onClick={() => { upd({ playlistAccentColor: undefined }); setOpenPicker(null); }} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Reset to default</button>
                </div>
              )}
            </div>
          </div>
          {/* Border */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Border</span>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={12} value={item.playlistBorderWidth ?? 0}
                onChange={(e) => upd({ playlistBorderWidth: Number(e.target.value) })}
                className="w-10 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-center text-xs text-[var(--text-primary)] outline-none" />
              <span className="text-[var(--text-muted)]">px</span>
              <div className="relative">
                <button className="h-5 w-5 rounded border border-[var(--border)]"
                  style={{ background: item.playlistBorderColor || "#ffffff" }}
                  onClick={() => setOpenPicker(openPicker === "border" ? null : "border")} />
                {openPicker === "border" && (
                  <div className="absolute right-0 top-7 z-50 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                    <input type="color" value={item.playlistBorderColor || "#ffffff"} onChange={(e) => upd({ playlistBorderColor: e.target.value })} className="h-8 w-24 cursor-pointer border-0 p-0" />
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Corner radius */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Corner radius</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={0} max={32} value={item.playlistBorderRadius ?? 0}
                onChange={(e) => upd({ playlistBorderRadius: Number(e.target.value) })}
                className="w-20 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-6 text-right text-[var(--text-muted)]">{item.playlistBorderRadius ?? 0}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "col-todo",       title: "To Do",       color: "#d59ee8" },
  { id: "col-inprogress", title: "In Progress",  color: "#f2994a" },
  { id: "col-done",       title: "Done",         color: "#48cfa6", isDone: true },
];

function KanbanSortableCard({
  card, canEdit, onEdit, onDelete,
  cardBg, fontSize, fontFamily, borderRadius, cardGap,
  assignee, inDoneColumn,
}: {
  card: KanbanCard; canEdit: boolean;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
  cardBg: string; fontSize: number; fontFamily: string; borderRadius: number; cardGap: number;
  assignee?: ServerMember; inDoneColumn?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", cardId: card.id },
    disabled: !canEdit,
  });
  const style: React.CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    background: cardBg,
    borderRadius,
    marginBottom: cardGap,
    fontSize,
    fontFamily: fontFamily || undefined,
    borderLeft: card.color ? `3px solid ${card.color}` : undefined,
    cursor: canEdit ? "grab" : "default",
    userSelect: "none",
    padding: "8px 10px",
    boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.15)",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) onEdit(card.id); }}
    >
      <div className="flex items-start justify-between gap-1">
        <span style={{ flex: 1, wordBreak: "break-word", color: "var(--text-primary)", lineHeight: 1.4 }}>
          {card.text || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Empty card</span>}
        </span>
        {canEdit && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            className="flex-shrink-0 opacity-0 group-hover/kcard:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-red-400"
            style={{ marginTop: 1 }}
          >
            <XIcon size={11} />
          </button>
        )}
      </div>
      {card.description && (
        <p style={{ fontSize: fontSize - 1, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
          {card.description}
        </p>
      )}
      {(card.due || assignee) && (
        <div className="flex items-center justify-between gap-2" style={{ marginTop: 5 }}>
          {card.due ? <DueChip due={card.due} done={inDoneColumn} fontSize={Math.max(10, fontSize - 3)} /> : <span />}
          {assignee && <MemberAvatar member={assignee} size={16} />}
        </div>
      )}
    </div>
  );
}

// Bug fix: accept onCancel so empty new-card can be cleaned up on dismiss
function KanbanEditModal({
  card, onSave, onClose, onCancel, boardId, itemId,
}: {
  card: KanbanCard;
  onSave: (patch: Partial<KanbanCard>) => void;
  onClose: () => void;
  onCancel?: () => void;
  boardId?: string;
  itemId?: string;
}) {
  const [text, setText] = useState(card.text);
  const [desc, setDesc] = useState(card.description ?? "");
  const [color, setColor] = useState(card.color ?? "");
  const [due, setDue] = useState(card.due ?? "");
  const [assigneeId, setAssigneeId] = useState(card.assigneeId ?? "");
  const { members } = useServerBoard();

  const handleDismiss = () => {
    if (!text.trim() && onCancel) { onCancel(); } else { onClose(); }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div
        className="relative flex flex-col gap-3 rounded-xl border border-[var(--border)] p-5 shadow-2xl"
        style={{ background: "var(--surface-raised)", minWidth: 280, maxWidth: 360, width: "90vw" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Edit card</span>
          <button onClick={handleDismiss} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><XIcon size={14} /></button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") handleDismiss(); }}
          placeholder="Card title…"
          rows={2}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none resize-none focus:border-[var(--accent)]"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)…"
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none resize-none focus:border-[var(--accent)]"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Card color</span>
          <input type="color" value={color || "#d59ee8"} onChange={(e) => setColor(e.target.value)}
            className="h-6 w-10 cursor-pointer rounded border-0 p-0" />
          {color && (
            <button onClick={() => setColor("")} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">Due date</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          {due && (
            <button onClick={() => setDue("")} className="flex-shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
          )}
        </div>
        {members.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">Assignee</span>
            <AssigneeRows members={members} assigneeId={assigneeId || undefined} onPick={(id) => setAssigneeId(id ?? "")} />
          </div>
        )}
        {due ? (
          <RemindMeControl title={text} due={due} boardId={boardId} itemId={itemId} />
        ) : (
          <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
            <Bell size={13} className="opacity-70" /> Set a due date above to add a reminder
          </div>
        )}
        <button
          onClick={() => { onSave({ text: text.trim(), description: desc.trim() || undefined, color: color || undefined, due: due || undefined, assigneeId: assigneeId || undefined }); onClose(); }}
          disabled={!text.trim()}
          className="rounded-lg py-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Save
        </button>
      </div>
    </div>,
    document.body
  );
}

// Bug fix: useDroppable per column so empty columns accept drops
function KanbanColumnContainer({
  col, colCards, canEditCards, canEditColumns, renamingColId, renameVal, setRenamingColId, setRenameVal,
  renameColumn, deleteColumn, toggleDoneColumn, addCard, deleteCard, setEditCardId, showCount,
  memberById,
  headerBg, accent, columnBg, borderRadius, cardBg, fontSize, fontFamily, cardGap,
}: {
  col: KanbanColumn;
  colCards: KanbanCard[];
  canEditCards: boolean;
  canEditColumns: boolean;
  renamingColId: string | null;
  renameVal: string;
  setRenamingColId: (id: string | null) => void;
  setRenameVal: (v: string) => void;
  renameColumn: (colId: string, title: string) => void;
  deleteColumn: (colId: string) => void;
  toggleDoneColumn: (colId: string) => void;
  addCard: (colId: string) => void;
  deleteCard: (cardId: string) => void;
  setEditCardId: (id: string) => void;
  showCount: boolean;
  memberById: Map<string, ServerMember>;
  headerBg: string;
  accent: string;
  columnBg: string;
  borderRadius: number;
  cardBg: string;
  fontSize: number;
  fontFamily: string;
  cardGap: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const atLimit = col.limit != null && colCards.length >= col.limit;
  const escapeRenameRef = useRef(false);
  const colBaseBg = col.bgColor ?? columnBg;       // per-column bg color, else kanban default
  const colCardBg = col.cardBgColor ?? cardBg;     // per-column card bg, else kanban default

  return (
    // setNodeRef on the outer column div so the full column (including header) is a drop target
    <div
      ref={setNodeRef}
      className="relative flex flex-shrink-0 flex-col"
      style={{
        width: 200,
        background: isOver ? `color-mix(in srgb, ${col.color ?? colBaseBg} 10%, ${colBaseBg})` : colBaseBg,
        borderRadius,
        overflow: "hidden",
        border: `1px solid ${isOver ? (col.color ?? "var(--accent)") : "var(--border)"}`,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {/* Per-column background image (behind header + cards) */}
      {col.bgImage && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: `url(${col.bgImage})`,
          backgroundSize: col.bgImageSize ?? "cover",
          backgroundPosition: "center",
          opacity: col.bgOpacity ?? 1,
        }} />
      )}

      {/* Column header */}
      <div
        className="group/kcolh relative z-[1] flex items-center gap-1.5 px-2.5 py-2"
        style={{ background: headerBg, borderBottom: `2px solid ${col.color ?? accent}` }}
      >
        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: col.color ?? accent }} />
        {renamingColId === col.id ? (
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => {
              if (escapeRenameRef.current) { escapeRenameRef.current = false; setRenamingColId(null); return; }
              renameColumn(col.id, renameVal || col.title);
              setRenamingColId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { renameColumn(col.id, renameVal || col.title); setRenamingColId(null); }
              if (e.key === "Escape") { escapeRenameRef.current = true; setRenamingColId(null); }
            }}
            className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none border-b border-[var(--accent)]"
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-xs font-semibold text-[var(--text-primary)] select-none"
            onDoubleClick={() => { if (canEditColumns) { setRenamingColId(col.id); setRenameVal(col.title); } }}
            title="Double-click to rename"
          >
            {col.title}
          </span>
        )}
        {showCount && (
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
            {colCards.length}{col.limit != null ? `/${col.limit}` : ""}
          </span>
        )}
        {canEditColumns && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleDoneColumn(col.id)}
            title={col.isDone ? "Done column — cards here count as complete" : "Mark as Done column"}
            className={cn(
              "flex-shrink-0 transition-all ml-0.5",
              col.isDone
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] opacity-0 group-hover/kcolh:opacity-100 hover:text-[var(--text-primary)]",
            )}
          >
            <CheckSquare size={11} />
          </button>
        )}
        {canEditColumns && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => deleteColumn(col.id)}
            className="flex-shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors ml-0.5"
          >
            <XIcon size={11} />
          </button>
        )}
      </div>

      {/* Cards drop zone */}
      <SortableContext items={colCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          className="relative z-[1] flex flex-1 flex-col overflow-y-auto p-2"
          style={{ minHeight: 80 }}
        >
          {colCards.map((card) => (
            <div key={card.id} className="group/kcard">
              <KanbanSortableCard
                card={card}
                canEdit={canEditCards}
                onEdit={(id) => setEditCardId(id)}
                onDelete={deleteCard}
                cardBg={colCardBg}
                fontSize={fontSize}
                fontFamily={fontFamily}
                borderRadius={borderRadius}
                cardGap={cardGap}
                assignee={card.assigneeId ? memberById.get(card.assigneeId) : undefined}
                inDoneColumn={!!col.isDone}
              />
            </div>
          ))}
          {canEditCards && !atLimit && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => addCard(col.id)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors mt-1"
              style={{ width: "100%" }}
            >
              <Plus size={11} /> Add card
            </button>
          )}
          {atLimit && (
            <div className="mt-1 text-center text-[11px] text-amber-400">WIP limit reached</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function KanbanItem({
  item, upd, collapsed, isFinished: isFinishedProp, extraContextItems, boardId,
}: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; collapsed?: boolean; isFinished?: boolean; extraContextItems?: ContextMenuEntry[]; boardId?: string }) {
  const isFinished = isFinishedProp ?? false;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const columns: KanbanColumn[] = item.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS;
  const { members, serverId } = useServerBoard();
  const canEditBoard = useCanEditBoard();
  // Members can edit CARDS (not columns) when the item's Interact permission allows
  // their role (owner picks roles via right-click → Set permissions → Interact).
  // Their edits never touch the store — they persist via the server API and live in
  // optimistic local state, so the whole-board sync can't clobber other items.
  const { canInteract } = useItemPerms(item.perms);
  const isMemberEdit = !!serverId && !canEditBoard && canInteract && !isFinished;
  const canEditCards = !isFinished && (canEditBoard || isMemberEdit);
  const canEditColumns = !isFinished && canEditBoard;
  // Display override holding optimistic (member) + realtime-received cards, so all
  // viewers see edits live. Persistence still goes to the store (owner) or the API
  // (member); lastSentRef lets us ignore our own realtime echo.
  const [liveCards, setLiveCards] = useState<KanbanCard[] | null>(null);
  const lastSentRef = useRef<string>("");
  const cards: KanbanCard[] = liveCards ?? (item.kanbanCards ?? []);

  const persistCards = useCallback((next: KanbanCard[]) => {
    setLiveCards(next);
    lastSentRef.current = JSON.stringify(next);
    if (isMemberEdit) {
      void fetch("/api/server-board/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, serverId, itemId: item.id, cards: next }),
      }).catch(() => {});
    } else {
      upd({ kanbanCards: next });
    }
  }, [isMemberEdit, boardId, serverId, item.id, upd]);

  // Drop the override when the board's stored cards change from an external
  // reload (not our own write) so we show fresh data.
  useEffect(() => {
    const sig = JSON.stringify(item.kanbanCards ?? []);
    if (sig !== lastSentRef.current) { setLiveCards(null); lastSentRef.current = sig; }
  }, [item.kanbanCards]);

  // Realtime: reflect other clients' card edits live (server boards only).
  useEffect(() => {
    if (!serverId || !boardId) return;
    const findCards = (data: unknown): KanbanCard[] | undefined => {
      const b = data as { boxes?: { items?: BlockItem[] }[]; boardItems?: BlockItem[] } | null;
      if (!b) return undefined;
      for (const box of b.boxes ?? []) { const hit = (box.items ?? []).find((i) => i.id === item.id); if (hit) return hit.kanbanCards; }
      return (b.boardItems ?? []).find((i) => i.id === item.id)?.kanbanCards;
    };
    const ch = supabase
      .channel(`kanban:${boardId}:${item.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${boardId}` },
        (payload: { new?: { data?: unknown } }) => {
          const fresh = findCards(payload.new?.data);
          if (!fresh) return;
          const sig = JSON.stringify(fresh);
          if (sig === lastSentRef.current) return; // our own echo
          lastSentRef.current = sig;
          setLiveCards(fresh);
          if (canEditBoard) upd({ kanbanCards: fresh }); // keep owner's store in sync
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [serverId, boardId, item.id, canEditBoard, upd]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const accent = item.kanbanAccentColor ?? "#d59ee8";
  const fontSize = item.kanbanFontSize ?? 13;
  const fontFamily = item.kanbanFontFamily ?? "";
  const borderRadius = item.kanbanBorderRadius ?? 8;
  const cardGap = item.kanbanCardGap ?? 6;
  const cardBg = item.kanbanCardBgColor ?? "var(--surface-overlay)";
  const columnBg = item.kanbanColumnBgColor ?? "var(--surface)";
  const headerBg = item.kanbanHeaderBgColor ?? "transparent";
  const showCount = item.kanbanShowCardCount !== false;

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  // Track IDs of freshly created cards so cancel = delete
  const newCardIdRef = useRef<string | null>(null);
  const activeCard = cards.find((c) => c.id === activeCardId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardsInCol = useCallback((colId: string) =>
    cards.filter((c) => c.columnId === colId).sort((a, b) => a.order - b.order),
  [cards]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveCardId(e.active.id as string);
  }, []);

  // Bug fix: use live cards state (not stale drag data); update order when moving cross-column
  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as { type: string; cardId: string } | undefined;
    if (activeData?.type !== "card") return;

    const liveCard = cards.find((c) => c.id === (active.id as string));
    if (!liveCard) return;

    const overIsCol = columns.some((c) => c.id === (over.id as string));
    const overCard = cards.find((c) => c.id === (over.id as string));
    const newColId = overIsCol ? (over.id as string) : overCard?.columnId;

    if (!newColId || newColId === liveCard.columnId) return;

    // Set order to end of target column so it appends cleanly
    const targetCount = cards.filter((c) => c.columnId === newColId).length;
    upd({
      kanbanCards: cards.map((c) =>
        c.id === liveCard.id ? { ...c, columnId: newColId, order: targetCount } : c
      ),
    });
  }, [cards, columns, upd]);

  // Bug fix: handle column as drop target (empty column drop) + proper same-column reorder
  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = e;
    if (!over) return;

    // Use item.kanbanCards via upd's closure snapshot to get post-handleDragOver state;
    // fall back to the hook-closure cards if the item prop hasn't re-rendered yet.
    const liveCard = cards.find((c) => c.id === (active.id as string));
    if (!liveCard) return;

    const overIsCol = columns.some((c) => c.id === (over.id as string));

    if (overIsCol) {
      // Same column background drop — no-op (handleDragOver already handles cross-column)
      if ((over.id as string) === liveCard.columnId) return;
      // Cross-column drop onto empty column background: normalize to end
      const targetColCards = cards
        .filter((c) => c.columnId === (over.id as string) && c.id !== liveCard.id)
        .sort((a, b) => a.order - b.order);
      persistCards(
        cards.map((c) =>
          c.id === liveCard.id ? { ...c, order: targetColCards.length } : c
        )
      );
      return;
    }

    if (active.id === over.id) return;

    // Dropped onto a card
    const overCard = cards.find((c) => c.id === (over.id as string));
    if (!overCard) return;

    // Cross-column card-over-card: handleDragOver moved the card; now position it relative to overCard
    if (overCard.columnId !== liveCard.columnId) {
      const targetColCards = cards
        .filter((c) => c.columnId === overCard.columnId)
        .sort((a, b) => a.order - b.order);
      const overIdx = targetColCards.findIndex((c) => c.id === overCard.id);
      const withoutActive = targetColCards.filter((c) => c.id !== liveCard.id);
      const insertAt = overIdx === -1 ? withoutActive.length : overIdx;
      const reordered = [...withoutActive.slice(0, insertAt), liveCard, ...withoutActive.slice(insertAt)];
      persistCards(
        cards.map((c) => {
          const idx = reordered.findIndex((r) => r.id === c.id);
          return idx !== -1 ? { ...c, columnId: overCard.columnId, order: idx } : c;
        })
      );
      return;
    }

    const colCards = cards
      .filter((c) => c.columnId === liveCard.columnId)
      .sort((a, b) => a.order - b.order);
    const activeIdx = colCards.findIndex((c) => c.id === liveCard.id);
    const overIdx = colCards.findIndex((c) => c.id === overCard.id);
    if (activeIdx === -1 || overIdx === -1) return;

    const reordered = arrayMove(colCards, activeIdx, overIdx);
    persistCards(
      cards.map((c) => {
        const idx = reordered.findIndex((r) => r.id === c.id);
        return idx !== -1 ? { ...c, order: idx } : c;
      })
    );
  }, [cards, columns, persistCards]);

  const addCard = useCallback((colId: string) => {
    const colCards = cards.filter((c) => c.columnId === colId);
    // Use max+1 not length — avoids order collisions after deletions leave gaps
    const maxOrder = colCards.length > 0 ? Math.max(...colCards.map((c) => c.order)) : -1;
    const newCard: KanbanCard = { id: nanoid(), columnId: colId, text: "", order: maxOrder + 1 };
    newCardIdRef.current = newCard.id;
    persistCards([...cards, newCard]);
    setEditCardId(newCard.id);
  }, [cards, persistCards]);

  const deleteCard = useCallback((cardId: string) => {
    persistCards(cards.filter((c) => c.id !== cardId));
  }, [cards, persistCards]);

  const updateCard = useCallback((cardId: string, patch: Partial<KanbanCard>) => {
    persistCards(cards.map((c) => c.id === cardId ? { ...c, ...patch } : c));
  }, [cards, persistCards]);

  const addColumn = useCallback(() => {
    upd({ kanbanColumns: [...columns, { id: nanoid(), title: "New Column", color: accent }] });
  }, [columns, accent, upd]);

  const deleteColumn = useCallback((colId: string) => {
    upd({
      kanbanColumns: columns.filter((c) => c.id !== colId),
      kanbanCards: cards.filter((c) => c.columnId !== colId),
    });
  }, [columns, cards, upd]);

  const renameColumn = useCallback((colId: string, title: string) => {
    upd({ kanbanColumns: columns.map((c) => c.id === colId ? { ...c, title } : c) });
  }, [columns, upd]);

  const toggleDoneColumn = useCallback((colId: string) => {
    upd({ kanbanColumns: columns.map((c) => c.id === colId ? { ...c, isDone: !c.isDone } : c) });
  }, [columns, upd]);

  const handleEditSave = useCallback((cardId: string, patch: Partial<KanbanCard>) => {
    newCardIdRef.current = null;
    updateCard(cardId, patch);
  }, [updateCard]);

  const handleEditClose = useCallback((cardId: string) => {
    // Clear stale ref when closing a new card that had text typed (Escape with content)
    if (newCardIdRef.current === cardId) newCardIdRef.current = null;
    setEditCardId(null);
  }, []);

  const handleEditCancel = useCallback((cardId: string) => {
    // New card with no text — remove it
    if (newCardIdRef.current === cardId) {
      newCardIdRef.current = null;
      deleteCard(cardId);
    }
    setEditCardId(null);
  }, [deleteCard]);

  const editCard = cards.find((c) => c.id === editCardId);

  if (collapsed) {
    const total = cards.length;
    const colCounts = columns.slice(0, 4).map((col) => ({
      col,
      count: cards.filter((c) => c.columnId === col.id).length,
      color: col.color ?? accent,
    }));
    return (
      <div className="flex h-full flex-col justify-center gap-2 overflow-hidden px-3 py-2" style={{ fontFamily: fontFamily || undefined }}>
        {/* Column pills */}
        <div className="flex flex-wrap gap-1.5">
          {colCounts.map(({ col, count, color }) => (
            <div
              key={col.id}
              className="flex items-center gap-1.5 rounded-lg px-2 py-[3px]"
              style={{ background: `${color}1a`, border: `1px solid ${color}35` }}
            >
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-[11px] text-[var(--text-muted)]">{col.title}</span>
              <span
                className="rounded-full px-[5px] text-[10px] font-bold leading-[14px]"
                style={{ background: `${color}30`, color }}
              >
                {count}
              </span>
            </div>
          ))}
        </div>
        {/* Segmented progress bar */}
        {total > 0 && (
          <div className="flex h-[3px] overflow-hidden rounded-full gap-px">
            {colCounts.map(({ col, count, color }) =>
              count === 0 ? null : (
                <div
                  key={col.id}
                  className="h-full rounded-full"
                  style={{ background: color, flex: count }}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }

  const bgStyle: React.CSSProperties = item.kanbanBgImage
    ? {
        backgroundImage: `url(${item.kanbanBgImage})`,
        backgroundSize: item.kanbanBgImageSize ?? "cover",
        backgroundPosition: "center",
        opacity: item.kanbanBgOpacity ?? 1,
      }
    : {
        background: item.kanbanBgColor ?? "transparent",
        opacity: item.kanbanBgOpacity ?? 1,
      };

  const columnList = (
    <div className="relative flex flex-1 gap-2 overflow-x-auto overflow-y-hidden p-2">
      {columns.map((col) => (
        <KanbanColumnContainer
          key={col.id}
          col={col}
          colCards={cardsInCol(col.id)}
          canEditCards={canEditCards}
          canEditColumns={canEditColumns}
          renamingColId={renamingColId}
          renameVal={renameVal}
          setRenamingColId={setRenamingColId}
          setRenameVal={setRenameVal}
          renameColumn={renameColumn}
          deleteColumn={deleteColumn}
          toggleDoneColumn={toggleDoneColumn}
          addCard={addCard}
          deleteCard={deleteCard}
          setEditCardId={setEditCardId}
          showCount={showCount}
          memberById={memberById}
          headerBg={headerBg}
          accent={accent}
          columnBg={columnBg}
          borderRadius={borderRadius}
          cardBg={cardBg}
          fontSize={fontSize}
          fontFamily={fontFamily}
          cardGap={cardGap}
        />
      ))}
      {canEditColumns && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={addColumn}
          className="flex h-fit flex-shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ alignSelf: "flex-start", minWidth: 120 }}
        >
          <Plus size={13} /> Add column
        </button>
      )}
    </div>
  );

  return (
    <div
      className="relative flex h-full flex-col"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Background layer — opacity isolated so card content stays at full opacity */}
      <div className="pointer-events-none absolute inset-0" style={bgStyle} />

      <DndContext
          id="dnd-item-renderer"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {columnList}
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeCard && (
                <div
                  style={{
                    background: cardBg,
                    borderRadius,
                    padding: "8px 10px",
                    fontSize,
                    fontFamily: fontFamily || undefined,
                    borderLeft: activeCard.color ? `3px solid ${activeCard.color}` : undefined,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    width: 200,
                    opacity: 0.9,
                    color: "var(--text-primary)",
                  }}
                >
                  {activeCard.text || <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Empty card</span>}
                </div>
              )}
            </DragOverlay>,
            document.body
          )}
        </DndContext>

      {editCard && (
        <KanbanEditModal
          card={editCard}
          onSave={(patch) => handleEditSave(editCard.id, patch)}
          onClose={() => handleEditClose(editCard.id)}
          onCancel={() => handleEditCancel(editCard.id)}
          boardId={boardId}
          itemId={item.id}
        />
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(extraContextItems?.length ? [...extraContextItems, "separator" as const] : []),
            ...(canEditColumns ? [{ label: "Add column", icon: <Plus size={14} />, onClick: addColumn }] : []),
            ...(canEditColumns && cards.length > 0 ? ["separator" as const, { label: "Clear all cards", icon: <Trash2 size={14} />, danger: true, onClick: () => upd({ kanbanCards: [] }) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ─── KanbanStylePanel ─────────────────────────────────────────────────────────

// Small swatch + color popover for the per-column style editor. Hoisted to module
// scope for stable identity: inline, every upd()/setOpenPicker re-render gave
// <KanbanColorField> a new function identity and remounted its <input type="color">,
// closing the picker mid-interaction. openPicker/setOpenPicker are passed as props.
function KanbanColorField({ label, value, fallback, onChange, onClear, pkey, openPicker, setOpenPicker }: {
  label: string; value?: string; fallback: string;
  onChange: (v: string) => void; onClear: () => void; pkey: string;
  openPicker: string | null; setOpenPicker: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <div className="relative">
        <button className="h-5 w-5 rounded border border-[var(--border)]" style={{ background: value ?? fallback }}
          onClick={() => setOpenPicker(openPicker === pkey ? null : pkey)} />
        {openPicker === pkey && (
          <div className="absolute right-0 top-7 z-50 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
            <input type="color" value={value ?? (fallback.startsWith("#") ? fallback : "#1e2030")}
              onChange={(e) => onChange(e.target.value)} className="h-8 w-24 cursor-pointer border-0 p-0" />
            <button onClick={() => { onClear(); setOpenPicker(null); }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Reset</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const SLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</div>
  );
  const accent = item.kanbanAccentColor ?? "#d59ee8";
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [styleCol, setStyleCol] = useState<string | null>(null);
  const cols = item.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS;
  const patchCol = (id: string, patch: Partial<KanbanColumn>) =>
    upd({ kanbanColumns: cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  return (
    <div className="flex flex-col gap-0 divide-y divide-[var(--border)] text-xs">
      {/* Columns */}
      <section className="p-3">
        <SLabel>Columns</SLabel>
        <div className="flex flex-col gap-2">
          {cols.map((col) => (
            <div key={col.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={col.title}
                  onChange={(e) => patchCol(col.id, { title: e.target.value })}
                  className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <div className="relative">
                  <button
                    className="h-5 w-5 rounded border border-[var(--border)] flex-shrink-0"
                    style={{ background: col.color ?? "#d59ee8" }}
                    onClick={() => setOpenPicker(openPicker === `col-${col.id}` ? null : `col-${col.id}`)}
                  />
                  {openPicker === `col-${col.id}` && (
                    <div className="absolute right-0 top-7 z-50 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                      <input type="color" value={col.color ?? "#d59ee8"}
                        onChange={(e) => patchCol(col.id, { color: e.target.value })}
                        className="h-8 w-24 cursor-pointer border-0 p-0" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">WIP</span>
                  <input
                    type="number" min={0} value={col.limit ?? ""}
                    placeholder="∞"
                    onChange={(e) => patchCol(col.id, { limit: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-10 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-center text-xs text-[var(--text-primary)] outline-none"
                  />
                </div>
                <button
                  title="Column & card style"
                  onClick={() => setStyleCol(styleCol === col.id ? null : col.id)}
                  className={cn("flex-shrink-0 transition-colors", styleCol === col.id ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                ><Palette size={12} /></button>
                <button
                  onClick={() => upd({
                    kanbanColumns: cols.filter((c) => c.id !== col.id),
                    kanbanCards: (item.kanbanCards ?? []).filter((c) => c.columnId !== col.id),
                  })}
                  className="text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                ><Trash2 size={11} /></button>
              </div>

              {/* Per-column style editor */}
              {styleCol === col.id && (
                <div className="ml-1 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                  <KanbanColorField label="Column bg" value={col.bgColor} fallback={item.kanbanColumnBgColor ?? "var(--surface)"}
                    onChange={(v) => patchCol(col.id, { bgColor: v })} onClear={() => patchCol(col.id, { bgColor: undefined })} pkey={`colbg-${col.id}`} openPicker={openPicker} setOpenPicker={setOpenPicker} />
                  <KanbanColorField label="Card bg" value={col.cardBgColor} fallback={item.kanbanCardBgColor ?? "var(--surface-overlay)"}
                    onChange={(v) => patchCol(col.id, { cardBgColor: v })} onClear={() => patchCol(col.id, { cardBgColor: undefined })} pkey={`colcardbg-${col.id}`} openPicker={openPicker} setOpenPicker={setOpenPicker} />
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Column image</span>
                    <div className="flex items-center gap-1.5">
                      {col.bgImage && (
                        <button onClick={() => patchCol(col.id, { bgImage: undefined })}
                          className="text-[11px] text-[var(--text-muted)] hover:text-red-400">Remove</button>
                      )}
                      <label className="cursor-pointer rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors">
                        {col.bgImage ? "Replace" : "Upload"}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) applyImageUpload(f, (url) => patchCol(col.id, { bgImage: url })); e.currentTarget.value = ""; }} />
                      </label>
                    </div>
                  </div>
                  {col.bgImage && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Image fit</span>
                        <select value={col.bgImageSize ?? "cover"}
                          onChange={(e) => patchCol(col.id, { bgImageSize: e.target.value })}
                          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none">
                          <option value="cover">Cover</option>
                          <option value="contain">Contain</option>
                          <option value="auto">Tile</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Image opacity</span>
                        <div className="flex items-center gap-1.5">
                          <input type="range" min={0} max={1} step={0.05} value={col.bgOpacity ?? 1}
                            onChange={(e) => patchCol(col.id, { bgOpacity: Number(e.target.value) })}
                            className="w-16 h-1 cursor-pointer" style={{ accentColor: accent }} />
                          <span className="tabular-nums w-8 text-right text-[var(--text-muted)]">{Math.round((col.bgOpacity ?? 1) * 100)}%</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => upd({ kanbanColumns: [...cols, { id: nanoid(), title: "New Column", color: "#d59ee8" }] })}
            className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          >
            <Plus size={11} /> Add column
          </button>
        </div>
      </section>

      {/* Typography */}
      <section className="p-3">
        <SLabel>Typography</SLabel>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Font</span>
            <FontPicker value={item.kanbanFontFamily ?? ""} onChange={(v) => upd({ kanbanFontFamily: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Size</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={10} max={20} value={item.kanbanFontSize ?? 13}
                onChange={(e) => upd({ kanbanFontSize: Number(e.target.value) })}
                className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-5 text-right text-[var(--text-muted)]">{item.kanbanFontSize ?? 13}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="p-3">
        <SLabel>Colors</SLabel>
        <div className="flex flex-col gap-2">
          {[
            { key: "kanbanAccentColor", label: "Accent", default: "#d59ee8" },
            { key: "kanbanCardBgColor", label: "Card bg", default: "var(--surface-overlay)" },
            { key: "kanbanColumnBgColor", label: "Column bg", default: "var(--surface)" },
            { key: "kanbanHeaderBgColor", label: "Header bg", default: "transparent" },
          ].map(({ key, label, default: def }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">{label}</span>
              <div className="relative">
                <button
                  className="h-5 w-5 rounded border border-[var(--border)]"
                  style={{ background: (item as unknown as Record<string, string>)[key] ?? def }}
                  onClick={() => setOpenPicker(openPicker === key ? null : key)}
                />
                {openPicker === key && (
                  <div className="absolute right-0 top-7 z-50 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                    <input type="color"
                      value={(item as unknown as Record<string, string>)[key] ?? def}
                      onChange={(e) => upd({ [key]: e.target.value } as Partial<BlockItem>)}
                      className="h-8 w-24 cursor-pointer border-0 p-0" />
                    <button onClick={() => { upd({ [key]: undefined } as Partial<BlockItem>); setOpenPicker(null); }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Reset</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Layout */}
      <section className="p-3">
        <SLabel>Layout</SLabel>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Corner radius</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={0} max={24} value={item.kanbanBorderRadius ?? 8}
                onChange={(e) => upd({ kanbanBorderRadius: Number(e.target.value) })}
                className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-5 text-right text-[var(--text-muted)]">{item.kanbanBorderRadius ?? 8}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Card gap</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={2} max={20} value={item.kanbanCardGap ?? 6}
                onChange={(e) => upd({ kanbanCardGap: Number(e.target.value) })}
                className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-5 text-right text-[var(--text-muted)]">{item.kanbanCardGap ?? 6}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Show card count</span>
            <button
              onClick={() => upd({ kanbanShowCardCount: !(item.kanbanShowCardCount !== false) })}
              className={cn("h-4 w-8 rounded-full transition-colors", item.kanbanShowCardCount !== false ? "bg-[var(--accent)]" : "bg-[var(--surface-overlay)]")}
            >
              <div className={cn("h-3 w-3 rounded-full bg-white shadow transition-transform mx-0.5", item.kanbanShowCardCount !== false ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>
        </div>
      </section>

      {/* Background */}
      <section className="p-3">
        <SLabel>Background</SLabel>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Color</span>
            <div className="relative">
              <button
                className="h-5 w-5 rounded border border-[var(--border)]"
                style={{ background: item.kanbanBgColor ?? "transparent" }}
                onClick={() => setOpenPicker(openPicker === "bg" ? null : "bg")}
              />
              {openPicker === "bg" && (
                <div className="absolute right-0 top-7 z-50 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
                  <input type="color" value={item.kanbanBgColor ?? "#1e2030"}
                    onChange={(e) => upd({ kanbanBgColor: e.target.value })}
                    className="h-8 w-24 cursor-pointer border-0 p-0" />
                  <button onClick={() => { upd({ kanbanBgColor: undefined }); setOpenPicker(null); }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Opacity</span>
            <div className="flex items-center gap-1.5">
              <input type="range" min={0} max={1} step={0.05} value={item.kanbanBgOpacity ?? 1}
                onChange={(e) => upd({ kanbanBgOpacity: Number(e.target.value) })}
                className="w-20 h-1 cursor-pointer" style={{ accentColor: accent }} />
              <span className="tabular-nums w-8 text-right text-[var(--text-muted)]">{Math.round((item.kanbanBgOpacity ?? 1) * 100)}%</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
