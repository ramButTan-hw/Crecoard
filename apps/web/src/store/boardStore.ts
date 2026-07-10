import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";
import {
  ThemeVarMap, SavedTheme, AppBgConfig,
  DEFAULT_THEME_VARS, DEFAULT_APP_BG, applyThemeVars, applyAppFont,
} from "@/lib/appThemes";

// ─── Permission types ─────────────────────────────────────────────────────────

/**
 * Explicit set of ServerRole IDs allowed for a given action.
 * undefined = everyone (no restriction).
 * Owner always retains access regardless of the set.
 * Empty array [] = owner-only.
 */
// ─── Undo history ─────────────────────────────────────────────────────────────
// Snapshot-based per-board undo for structural edits. Programmatic writers
// (remote collab ops, session sync, webhooks, heals) run inside suppressUndo
// so only user actions enter history.

export interface UndoEntry {
  boardId: string;
  label: string;
  ts: number;
  boxes: Box[];
  boardItems: BoardLevelItem[];
}

let undoSuppressed = false;
export function suppressUndo<T>(fn: () => T): T {
  undoSuppressed = true;
  try { return fn(); } finally { undoSuppressed = false; }
}

export interface ItemPerms {
  edit?: string[];       // ServerRole IDs that can change settings/style
  input?: string[];      // ServerRole IDs that can type/enter text
  interact?: string[];   // ServerRole IDs that can click/toggle/play
  contribute?: string[]; // ServerRole IDs that can add their own entries (suggestion box, contributable list, …)
  /** Granular per-function allowlists (schema per item type in lib/playlist ITEM_FN_SCHEMAS), e.g. playlist "playback"/"queue-add"/"volume". */
  fns?: Record<string, string[]>;
}

export interface BoxPerms {
  edit?: string[];     // ServerRole IDs that can add/remove/move items
  interact?: string[]; // ServerRole IDs that can interact with items inside
}

// ─── Item types ───────────────────────────────────────────────────────────────

export type ItemType =
  | "text" | "list" | "embed" | "timer"
  | "image" | "graph" | "api" | "calendar" | "table" | "widget"
  | "playlist" | "kanban"
  | "chat" | "filebank"
  | "suggestion" | "guestbook" | "poll"
  | "flashcard" | "quiz"
  | "visualizer"
  | "embed-card"
  | "external" | "twitch";

/**
 * Item types whose viewer-facing content lives in board_item_contributions
 * (author-attributed, RLS-guarded), not the board JSONB. These are inherently
 * contributable — canContribute is granted without the per-item allowContributions
 * opt-in that List requires.
 */
export const CONTRIBUTABLE_TYPES: ReadonlySet<ItemType> = new Set(["suggestion", "guestbook", "poll"]);
export function isContributableType(type: ItemType): boolean {
  return CONTRIBUTABLE_TYPES.has(type);
}

// ─── Tracker.gg integration ───────────────────────────────────────────────────
export type TrackerGGGame =
  | "valorant" | "apex" | "rocket-league" | "fortnite" | "csgo";

export type TrackerGGPlatform =
  | "riot" | "origin" | "psn" | "xbl" | "epic" | "steam";

export interface TrackerGGConfig {
  game: TrackerGGGame;
  platform: TrackerGGPlatform;
  username: string;
}

export interface TrackerGGStat {
  key: string;
  label: string;
  value: string;
  percentile?: number;
  iconUrl?: string;
}

export interface TrackerGGData {
  username: string;
  avatarUrl?: string;
  rankLabel?: string;
  rankIconUrl?: string;
  accentColor: string;
  stats: TrackerGGStat[];
  fetchedAt: number; // ms timestamp — used to decide if stale
  error?: string;
}

// ─── External item style overrides ───────────────────────────────────────────
export interface ExternalItemStyle {
  accentColor?: string;   // overrides the provider default
  bgColor?: string;       // card background (default: var(--surface-raised))
  borderRadius?: number;  // 0–16 px (default: 6)
  compact?: boolean;      // hide stats/recent-games grid (default: false)
  hideHeader?: boolean;   // hide the top label bar (default: false)
  hideFooter?: boolean;   // hide the "updated at" timestamp (default: false)
}

// ─── Steam integration ────────────────────────────────────────────────────────
export interface SteamConfig {
  identifier: string; // vanity URL, full profile URL, or SteamID64
}

export interface SteamGame {
  appId: number;
  name: string;
  playtime2weeks?: number; // minutes
  playtimeForever: number; // minutes
  iconUrl?: string;
}

export type SteamStatus = "online" | "offline" | "away" | "busy" | "ingame";

export interface SteamData {
  steamId: string;
  username: string;
  avatarUrl?: string;
  profileUrl: string;
  status: SteamStatus;
  currentGame?: string;
  recentGames: SteamGame[];
  fetchedAt: number;
}

// ─── Twitch live-status ─────────────────────────────────────────────────────────
export interface TwitchScheduleSegment {
  title?: string;
  startTime: string;   // ISO
  category?: string;
}

export interface TwitchData {
  channel: string;         // login (lowercase)
  displayName: string;
  profileImageUrl?: string;
  description?: string;
  isLive: boolean;
  title?: string;          // stream title when live
  gameName?: string;       // category when live
  viewerCount?: number;
  startedAt?: string;      // ISO, when the live stream began
  thumbnailUrl?: string;   // resolved live thumbnail (template already filled)
  nextStream?: TwitchScheduleSegment; // next scheduled stream when offline
  fetchedAt: number;
}

// ─── Embed card (webhook / integration display) ───────────────────────────────
export interface EmbedCardField {
  label: string;
  value: string;
  inline?: boolean;
}

export interface EmbedCardData {
  title?: string;
  description?: string;
  iconUrl?: string;
  accentColor?: string;
  fields?: EmbedCardField[];
  imageUrl?: string;
  thumbnailUrl?: string;
  footer?: string;
  timestamp?: string; // ISO
  source?: string;    // "tracker-gg" | "github" | "custom" etc.
}

// ─── Chat item ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: string; // ISO string
  gif?: string;       // GIPHY GIF URL
  image?: string;     // data URL for uploaded image
  fileName?: string;  // original filename for uploaded image
  pinned?: boolean;   // pinned within its (board, channel)
  pinnedAt?: string;  // ISO string — when it was pinned
  pinnedBy?: string;  // user id who pinned it
  editedAt?: string;
  replyToId?: string;      // id of the message this replies to (enables jump-to-original)
  replyToAuthor?: string;  // snapshot of the replied-to author's name
  replyToText?: string;    // snapshot snippet of the replied-to message
}

// ─── File bank item ───────────────────────────────────────────────────────────
export interface FileBankEntry {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  url?: string;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  text: string;
  description?: string;
  color?: string;
  order: number;
  due?: string;        // YYYY-MM-DD
  assigneeId?: string; // ServerMember.userId of the assignee
}

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  limit?: number;
  isDone?: boolean; // cards in this column count as complete
  // Per-column styling (each overrides the kanban-wide defaults)
  bgColor?: string;      // column background color
  bgImage?: string;      // column background image URL
  bgImageSize?: string;  // "cover" | "contain" | "auto"
  bgOpacity?: number;    // column background image opacity (0..1)
  cardBgColor?: string;  // background for cards in this column
}

export type FilterOp =
  | "contains" | "not_contains"
  | "equals"   | "not_equals"
  | "is_empty" | "is_not_empty"
  | "gt" | "lt";

export interface TableFilter {
  id: string;
  colId: string;
  op: FilterOp;
  value: string;
}

export interface TableColumn {
  id: string;
  name: string;
  type: "text" | "number" | "checkbox" | "select" | "date" | "url" | "member" | "image"; // member cells store a ServerMember.userId; image cells store an image URL (or data URL in guest mode)
  width?: number;
  options?: string[];
  imageSize?: number;               // image row height (px) for image columns; width follows aspect ratio; default 44
  imageFit?: "contain" | "cover";   // "contain" keeps the whole image (aspect preserved); "cover" crops to a square; default "contain"
  fontSize?: number;                // per-column cell font size (px); falls back to the table-wide font size when unset
  summaryFn?: "none" | "sum" | "avg" | "count" | "min" | "max" | "count_checked" | "percent_checked" | "count_empty" | "count_filled";
}

export interface TableRow {
  id: string;
  cells: Record<string, string | boolean>;
}

export interface CalendarEvent {
  id: string;
  date: string;       // YYYY-MM-DD
  title: string;
  color?: string;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  description?: string;
  allDay?: boolean;
  feedId?: string;    // from iCal feed (read-only)
  location?: string;
}

export interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  lastSyncedAt?: number; // epoch ms of last successful sync
  lastError?: string;    // last sync error message (cleared on success)
}

/**
 * Projects task-shaped items in the same box onto a calendar as read-only events.
 * Tables map explicit columns; kanban cards and list entries use their `due` field.
 */
export interface SourceLink {
  id: string;         // link config id
  kind?: "table" | "kanban" | "list"; // undefined = "table" (rows stored before this field existed)
  tableId: string;    // item id of the linked source in the same box (field name kept for stored-data compat)
  dateCol: string;    // table only: column id used as event date ("" for kanban/list)
  titleCol: string;   // table only: column id used as event title ("" for kanban/list)
  colorCol?: string;  // table only: column id used as event color (optional)
  color?: string;     // fallback accent color for events from this link
}
/** Back-compat alias — existing code and stored boards use the original name. */
export type TableLink = SourceLink;

export interface PlaylistTrack {
  id: string;
  url: string;
  title: string;
  /** Set when the track came from a member contribution on a server board (durable, realtime-synced). */
  contribId?: string;
  addedBy?: string;
  authorId?: string;
}

export interface ListEntry {
  id: string;
  text: string;
  checked: boolean;
  depth?: number; // indentation level for nested sub-items (0 = top level)
  due?: string;        // YYYY-MM-DD
  assigneeId?: string; // ServerMember.userId of the assignee
}
export interface GraphPoint { label: string; [key: string]: string | number }
export interface PollOption { id: string; label: string }
export interface Flashcard { id: string; front: string; back: string; frontImage?: string; backImage?: string }
export interface QuizQuestion { id: string; prompt: string; options: string[]; correctIndex: number }

export interface BlockItem {
  id: string;
  type: ItemType;
  showInCollapsed: boolean;

  // Layout inside expanded canvas
  expandedX?: number;
  expandedY?: number;
  expandedW?: number;
  expandedH?: number;

  // Layout inside collapsed view (absolute positioning)
  collapsedX?: number;
  collapsedY?: number;
  collapsedW?: number;
  collapsedH?: number;
  // Independent typography for the collapsed (pinned) card view
  collapsedFontFamily?: string;
  collapsedFontSize?: number;
  collapsedBold?: boolean;
  collapsedItalic?: boolean;
  collapsedFontColor?: string;

  // text
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  fontFamily?: string;
  textColor?: string;
  textBgColor?: string;
  textBgImage?: string;
  /** Decorative animation preset — fade/rise/wipe play once, pulse/float loop (CSS-only, honors reduced-motion) */
  textAnimation?: "fade" | "rise" | "wipe" | "pulse" | "float" | "glitch" | "breathe" | "rainbow" | "custom";
  textAnimationSpeed?: "slow" | "normal" | "fast";
  /** Embedded custom animation spec (copied from the library on apply — see lib/animSpec) */
  textAnimationCustom?: import("@/lib/animSpec").AnimSpec;
  /** Entrance effect when the item mounts on screen */
  itemEntrance?: "fade" | "scale" | "rise" | "custom";
  /** Readable backdrop behind reading-surface items over board wallpapers (undefined = auto) */
  itemScrim?: boolean;
  /** Explicit readable backdrop for text items */
  textBackdrop?: boolean;
  itemEntranceCustom?: import("@/lib/animSpec").AnimSpec;
  textBorderStyle?: "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge" | "inset" | "outset" | "glow";
  textBorderColor?: string;
  textBorderWidth?: number;
  textBorderRadius?: number;
  textPadding?: number;
  textLetterSpacing?: number;
  textLineHeight?: number;
  textShadow?: "none" | "drop" | "glow" | "neon" | "hard";
  textShadowColor?: string;

  // list
  listTitle?: string;
  listItems?: ListEntry[];
  listFontFamily?: string;
  listFontSize?: number;
  listFontColor?: string;
  listWallpaperUrl?: string;
  listWallpaperSize?: string;
  listWallpaperPosition?: string;
  listWallpaperOpacity?: number;
  listFontAutoScale?: boolean;
  listBorderWidth?: number;
  listBorderColor?: string;
  listBorderStyle?: string;
  listBorderRadius?: number;
  listMarker?: "checkbox" | "bullet" | "number" | "none";
  listRowSpacing?: number;
  listBgColor?: string;
  listPadding?: number;
  listShadow?: "none" | "drop" | "glow" | "hard";
  listShadowColor?: string;
  listLetterSpacing?: number;
  listLineHeight?: number;
  listDividerColor?: string;
  listDividerOpacity?: number;
  listDividerWidth?: number;
  listDividerStyle?: "solid" | "dashed" | "dotted" | "none";
  listCheckColor?: string;
  listCheckUncheckedIcon?: string;
  listCheckCheckedIcon?: string;
  listCheckIconSize?: number;
  listShowProgress?: boolean;
  listProgressColor?: string;
  listProgressHeight?: number;
  listProgressStyle?: "rounded" | "square";
  listProgressShowLabel?: boolean;
  listProgressPosition?: "top" | "bottom";
  /** Opt-in: let permitted viewers append their own entries (stored in board_item_contributions, not here). */
  allowContributions?: boolean;
  /** Moderated box: contributed entries stay hidden (approved=false) until a moderator approves them. */
  requireContributionApproval?: boolean;

  // suggestion box (contributions-backed, kind="suggestion" + "upvote")
  suggestionTitle?: string;
  suggestionPrompt?: string;      // input placeholder
  suggestionAllowUpvotes?: boolean;

  // guestbook (contributions-backed, kind="guestbook")
  guestbookTitle?: string;
  guestbookPrompt?: string;       // input placeholder

  // poll (options owner-authored here; votes in contributions, kind="vote")
  pollQuestion?: string;
  pollOptions?: PollOption[];
  pollShowResults?: "always" | "afterVote"; // when non-voters see the tallies (default afterVote)

  // Shared appearance for community items (suggestion / guestbook / poll / twitch)
  communityAccent?: string;
  communityBgColor?: string;
  communityFontFamily?: string;
  communityFontSize?: number;
  communityTextColor?: string;
  communityBorderColor?: string;
  communityBorderWidth?: number;
  communityBorderRadius?: number;

  // image styling
  imageFit?: "cover" | "contain" | "fill";
  imageBorderRadius?: number;
  imageBorderColor?: string;
  imageBorderWidth?: number;
  imageCaption?: string;

  // external integrations (tracker-gg, steam, …)
  externalProvider?: "tracker-gg" | "steam";
  externalStyle?: ExternalItemStyle;
  trackerGG?: TrackerGGConfig;
  trackerGGData?: TrackerGGData;
  steam?: SteamConfig;
  steamData?: SteamData;

  // twitch live-status
  twitchChannel?: string;         // login/username
  twitchData?: TwitchData;
  twitchShowSchedule?: boolean;   // show next scheduled stream when offline (default true)

  // embed-card (webhook / integration display)
  embedCard?: EmbedCardData;

  // Settings lock — prevents style panel changes until unlocked
  settingsLocked?: boolean;
  perms?: ItemPerms;
  // Focus mode — when true, all other items in the same view are dimmed
  isFocused?: boolean;

  // text paragraph style (Google Docs-style preset)
  textParaStyle?: string;

  // text modes: undefined = normal text, "number" = big number input
  textMode?: "number";

  // embed
  embedUrl?: string;
  embedBorderRadius?: number;
  embedBorderWidth?: number;
  embedBorderColor?: string;
  embedBorderStyle?: "solid" | "dashed" | "dotted" | "double" | "glow";
  embedFilterBrightness?: number;
  embedFilterContrast?: number;
  embedFilterSaturate?: number;
  embedFilterGrayscale?: number;
  embedFilterBlur?: number;
  embedFilterHueRotate?: number;
  embedFilterSepia?: number;
  embedShadow?: "none" | "sm" | "md" | "lg" | "glow";

  // timer
  timerSeconds?: number;
  timerLabel?: string;
  timerMode?: "countdown" | "stopwatch" | "clock";
  timerFontFamily?: string;
  timerFontSize?: number;
  timerFontColor?: string;
  timerAccentColor?: string;
  timerBold?: boolean;
  timerShowLabel?: boolean;
  timerLabelPosition?: "top" | "bottom";
  timerBgColor?: string;
  timerBgOpacity?: number;
  timerBgImage?: string;
  timerBgImageSize?: string;
  timerBgImageOpacity?: number;
  timerBorderWidth?: number;
  timerBorderColor?: string;
  timerBorderRadius?: number;
  timerBorderStyle?: "solid" | "dashed" | "dotted" | "glow";
  timerFormat24h?: boolean;
  timerShowSeconds?: boolean;
  timerShowDate?: boolean;
  // timer — clock date customization
  timerDateFontFamily?: string;
  timerDateFontSize?: number;
  timerDateBold?: boolean;
  timerDateColor?: string;
  timerDateShowWeekday?: boolean;   // default true
  timerDateShowYear?: boolean;
  timerDatePosition?: "above" | "below"; // relative to the time (default below)
  // timer — analog clock face (clock mode)
  timerClockFace?: "digital" | "analog";
  timerClockBgImage?: string;
  timerClockBgImageSize?: "cover" | "contain";
  timerHandStyle?: "line" | "bar" | "tapered" | "arrow" | "minimal";
  timerHandColor?: string;
  timerSecondHandColor?: string;
  timerShowSecondHand?: boolean;    // default true
  timerShowClockTicks?: boolean;    // hour/minute tick marks
  timerHourHandImage?: string;      // optional per-hand images (override the shape)
  timerMinuteHandImage?: string;
  timerSecondHandImage?: string;
  timerHandImageSize?: number;      // scale for imported hand images, percent (default 100)
  // timer — stopwatch
  timerStopwatchTargetSecs?: number; // optional goal — gives the progress indicator meaning
  // timer — pomodoro cycle
  timerPomodoroEnabled?: boolean;
  timerPomodoroWorkSecs?: number;
  timerPomodoroBreakSecs?: number;
  timerPomodoroLongBreakSecs?: number;
  timerPomodoroCyclesBeforeLongBreak?: number;
  timerCollabEnabled?: boolean;
  timerProgressStyle?: "none" | "bar" | "thick-bar" | "ring" | "bg-fill" | "bg-dim" | "bg-sweep";
  timerProgressDir?: "ltr" | "rtl" | "ttb" | "btt"; // direction for bg-fill / bg-sweep
  timerProgressColor?: string; // override accent for progress elements
  timerAlertSound?: boolean;   // play a chime when a countdown / stopwatch target completes (default on)
  timerElapsedSecs?: number;   // base elapsed at last start/pause
  timerRemainingSecs?: number; // base remaining at last start/pause
  timerRunning?: boolean;
  timerStartEpoch?: number;    // Date.now() when timer was last started
  timerPhase?: "work" | "break" | "long-break";
  timerDisplayCycles?: number;

  // playlist
  playlistTracks?: PlaylistTrack[];
  playlistCurrentIndex?: number;
  playlistTitle?: string;
  playlistLoop?: boolean;
  playlistAutoplay?: boolean;
  playlistShuffle?: boolean;
  playlistVolume?: number;        // 0–100
  playlistShowList?: boolean;     // default true
  playlistCompact?: boolean;      // kept for compat; prefer playlistLayout
  playlistLayout?: "stack" | "card" | "side" | "minimal" | "artwork";
  playlistBgColor?: string;
  playlistBgOpacity?: number;     // 0–100, default 100
  playlistBgBlur?: number;        // backdrop-filter blur px, default 0
  playlistBgGradient?: boolean;
  playlistBgGradientTo?: string;
  playlistBgGradientAngle?: number;
  playlistBgImage?: string;
  playlistBgImageOpacity?: number; // 0–100, default 100
  playlistAccentColor?: string;
  playlistTextColor?: string;   // track title / number colour (default muted/secondary)
  playlistIconColor?: string;   // platform badge colour override (default per-platform)
  playlistTextSize?: number;    // track-row font size in px (default 11)
  playlistBorderRadius?: number;
  playlistBorderWidth?: number;
  playlistBorderColor?: string;

  // image
  imageUrl?: string;
  imageObjectFit?: "cover" | "contain" | "fill";
  imageAlt?: string;

  // graph
  graphType?: "bar" | "bar-h" | "bar-stacked" | "line" | "multiline" | "area" | "area-stacked" | "pie" | "donut" | "scatter" | "radar";
  graphData?: GraphPoint[];
  graphSeriesKeys?: string[];
  graphTitle?: string;
  graphColors?: string[];
  graphShowGrid?: boolean;
  graphShowLegend?: boolean;
  graphSmooth?: boolean;
  // graph appearance
  graphBgColor?: string;
  graphBgOpacity?: number;
  graphBgImage?: string;
  graphBgImageSize?: string;
  graphBgImageOpacity?: number;
  graphFontFamily?: string;
  graphFontSize?: number;
  graphFontColor?: string;
  graphBarRadius?: number;
  graphStrokeWidth?: number;
  graphBorderRadius?: number;
  graphShowDataLabels?: boolean;
  graphXAxisTitle?: string;
  graphYAxisTitle?: string;

  // embedded chart in table item
  tableChartEnabled?: boolean;
  tableChartType?: string;
  tableChartLabelColId?: string;
  tableChartValueColIds?: string[];
  tableChartSplitRatio?: number;   // 0–1 fraction that table occupies
  tableChartColors?: string[];
  tableChartShowGrid?: boolean;
  tableChartShowLegend?: boolean;
  tableChartShowDataLabels?: boolean;
  tableChartSmooth?: boolean;
  tableChartBarRadius?: number;
  tableChartStrokeWidth?: number;
  tableChartTitle?: string;
  tableChartXAxisTitle?: string;
  tableChartYAxisTitle?: string;
  tableChartBgColor?: string;
  tableChartFontFamily?: string;
  tableChartFontSize?: number;
  tableChartFontColor?: string;

  // graph item linked to a table item (extracted chart)
  graphTableSourceItemId?: string;
  graphTableLabelColId?: string;
  graphTableValueColIds?: string[];

  // api
  apiUrl?: string;
  apiMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  apiHeaders?: string;
  apiBody?: string;
  apiAuthType?: "none" | "bearer" | "apikey" | "basic";
  apiAuthHeader?: string;
  apiAuthValue?: string;
  apiAuthUser?: string;
  apiResponsePath?: string;
  apiDisplayMode?: "value" | "json" | "table";
  apiRefreshInterval?: number;
  apiLabel?: string;
  apiCachedValue?: number; // numeric value at apiResponsePath, updated on each successful fetch

  // calendar
  calendarEvents?: CalendarEvent[];
  calendarFeeds?: CalendarFeed[];
  calendarFeedEvents?: CalendarEvent[]; // cached from feeds
  calendarView?: "month" | "week" | "agenda";
  calendarFirstDayMonday?: boolean;
  calendarAccentColor?: string;
  calendarShowWeekends?: boolean;
  calendarShowDeclined?: boolean;
  calendarFontFamily?: string;
  calendarFontSize?: number;
  calendarFontColor?: string;
  calendarBgColor?: string;
  calendarBgOpacity?: number;
  calendarBgImage?: string;
  calendarBgImageSize?: string;
  calendarBgImageOpacity?: number;
  calendarBorderRadius?: number;
  calendarCellBgColor?: string;
  calendarCellBgImage?: string;
  calendarCellBgImageSize?: string;
  calendarCellBgImageOpacity?: number;
  calendarWeekendBgColor?: string;
  calendarWeekendBgImage?: string;
  calendarWeekendBgImageSize?: string;
  calendarWeekendBgImageOpacity?: number;
  calendarTodayColor?: string;
  calendarHeaderBgColor?: string;
  calendarHeaderBgImage?: string;
  calendarLinkedTables?: TableLink[]; // multiple table→calendar links
  // legacy single-link fields (kept for migration)
  calendarLinkedTableId?: string;
  calendarLinkedDateCol?: string;
  calendarLinkedTitleCol?: string;
  calendarLinkedColorCol?: string;
  calendarHeaderBgImageSize?: string;
  calendarHeaderBgImageOpacity?: number;

  // table
  tableTitle?: string;
  tableShowTitle?: boolean;
  tableColumns?: TableColumn[];
  tableRows?: TableRow[];
  /** Per-cell formatting overrides, keyed by `${rowId}:${colId}`. Overrides the column, which overrides the table default. */
  tableCellStyles?: Record<string, {
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    imageSize?: number;
    imageFit?: "contain" | "cover";
  }>;
  tableStriped?: boolean;
  tableHeaderColor?: string;
  tableFontFamily?: string;
  tableFontSize?: number;
  tableFontColor?: string;
  tableHeaderFontColor?: string;
  tableCellBgColor?: string;
  tableStripedColor?: string;
  tableBorderColor?: string;
  tableBorderWidth?: number;
  tableBorderRadius?: number;
  tableBgColor?: string;
  tableBgOpacity?: number;
  tableBgImage?: string;
  tableBgImageSize?: string;
  tableBgImageOpacity?: number;
  tableRowHeight?: number;
  tableCollabEnabled?: boolean;
  tableShowSummary?: boolean;

  // widget (custom HTML/CSS/JS)
  widgetCode?: string;
  /** Persistent widget state — saved via the plancraft-save-state postMessage bridge, replayed on load. ≤8KB JSON. */
  widgetState?: unknown;
  /** Plugin API permissions granted to this widget (see lib/widgetApi.ts). Travels with shared items; stripped on install unless consented. */
  widgetPermissions?: string[];

  // kanban
  kanbanColumns?: KanbanColumn[];
  kanbanCards?: KanbanCard[];
  /** @deprecated Card editing is now gated by the item's Interact permission (perms.interact),
   *  resolved against the member's server role. No longer read; kept for back-compat with old items. */
  kanbanMemberEdit?: boolean;

  // chat (server board chat block)
  chatChannelName?: string;
  // chat appearance
  chatBgColor?: string;
  chatBgImage?: string;
  /** Color for @mention chips in this chat (defaults to the accent) */
  chatMentionColor?: string;
  chatBgSize?: string;
  chatBgPosition?: string;
  chatBgOpacity?: number;
  chatAccentColor?: string;
  chatTextColor?: string;
  chatFontFamily?: string;
  chatFontSize?: number;
  chatBubbles?: boolean;
  chatHideHeader?: boolean;

  // filebank (server board file storage block)
  fileBankTitle?: string;

  // table — per-member private rows (keyed by userId, only that member sees them)
  tableMemberRows?: Record<string, TableRow[]>;
  kanbanFontFamily?: string;
  kanbanFontSize?: number;
  kanbanFontColor?: string;    // card text colour (default var(--text-primary))
  kanbanBorderRadius?: number;
  kanbanCardBgColor?: string;
  kanbanColumnBgColor?: string;
  kanbanHeaderBgColor?: string;
  kanbanAccentColor?: string;
  kanbanShowCardCount?: boolean;
  kanbanCardGap?: number;
  kanbanBgColor?: string;
  kanbanBgOpacity?: number;
  kanbanBgImage?: string;
  kanbanBgImageSize?: string;
  kanbanBgImageOpacity?: number;

  // flashcard
  flashcards?: Flashcard[];
  flashcardShuffle?: boolean;
  flashcardFontFamily?: string;
  flashcardAccent?: string;
  flashcardFontSize?: number;
  flashcardTextColor?: string;
  flashcardBgColor?: string;      // item background
  flashcardCardColor?: string;    // front face background
  flashcardBackColor?: string;    // back face background (distinct)
  flashcardBorderColor?: string;
  flashcardBorderWidth?: number;
  flashcardBorderRadius?: number;
  flashcardShadow?: boolean;
  flashcardFlip?: string;         // "flip" | "fade" | "none"
  flashcardAlign?: string;        // "left" | "center" | "right"
  flashcardShowProgress?: boolean; // default true
  flashcardBgImage?: string;      // item background image
  flashcardBgImageSize?: string;  // "cover" | "contain"

  // quiz
  quizQuestions?: QuizQuestion[];
  quizShuffle?: boolean;
  quizInstant?: boolean; // show correct/wrong immediately after answering
  quizFontFamily?: string;
  quizAccent?: string;
  quizFontSize?: number;
  quizTextColor?: string;
  quizBgColor?: string;           // item background
  quizOptionColor?: string;       // option button background
  quizCorrectColor?: string;
  quizIncorrectColor?: string;
  quizBorderRadius?: number;
  quizShowProgress?: boolean;     // default true
  quizNumbers?: boolean;          // show "Q1/N" numbering
  quizBgImage?: string;           // item background image
  quizBgImageSize?: string;       // "cover" | "contain"

  // visualizer / effects
  visualizerEffect?: string; // "bars" | "wave" | "rain" | "particles" | "aurora"
  visualizerColor?: string;
  visualizerColor2?: string;
  visualizerSpeed?: number;     // 0.25..3
  visualizerIntensity?: number; // 0.25..2
  visualizerMic?: boolean;      // legacy: superseded by visualizerAudioSource
  visualizerAudioSource?: string; // "off" | "mic" | "system" — reactive source for bars/wave
  visualizerBgColor?: string;
  visualizerBgType?: string;    // "color" | "transparent" | "image"
  visualizerBgImage?: string;
  visualizerBgOpacity?: number; // background image opacity (0..1)
  visualizerGlow?: boolean;     // bloom/glow (default on)
  visualizerTrails?: boolean;   // motion trails / fade
  visualizerBarRounded?: boolean; // rounded (default) vs rectangular bars
  visualizerFreqFocus?: string;   // "full" | "vocal" | "bass" — spectrum window for bars/radial
  // radial-only options (Wallpaper-Engine "PWCircle" style)
  visualizerRadialWaveDir?: string;    // "outward" | "inward" | "both"
  visualizerRadialWaveStyle?: string;  // "bar" | "peak" | "peakDots"
  visualizerRadialSemicircle?: boolean;
  visualizerRadialSemiDir?: string;    // "up" | "down" | "left" | "right"
  visualizerRadialPolygon?: number;    // 0 = circle; 3..24 = polygon sides
  visualizerBarCount?: number;         // number of bars/spokes (bars, wave bars, radial)
  visualizerOpacity?: number;          // foreground opacity 0..1 (bars/lines/spokes)
  visualizerRadialPeakFill?: boolean;  // radial peak: fill the ring instead of a thin outline
  visualizerRadialFillStripes?: boolean; // radial peak fill: striped texture instead of solid
}

// ─── Block (box on the board) ─────────────────────────────────────────────────

export interface BoxStyle {
  backgroundColor: string;
  wallpaperUrl: string;
  wallpaperOpacity: number;
  wallpaperSize?: string;
  wallpaperPosition?: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  borderStyle: "none" | "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge" | "inset" | "outset" | "glow";
  /** Pulse the glow border (only applies when borderStyle is "glow") */
  glowAnimate?: boolean;
  shadow: "none" | "sm" | "md" | "lg";
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  fontWeight: "normal" | "medium" | "bold";
  padding: number;
  customCss?: string;
}

export const DEFAULT_BOX_STYLE: BoxStyle = {
  backgroundColor: "#25262b",
  wallpaperUrl: "",
  wallpaperOpacity: 1,
  borderColor: "#373a40",
  borderWidth: 1,
  borderRadius: 10,
  borderStyle: "solid",
  shadow: "sm",
  fontFamily: "Inter",
  fontSize: 14,
  fontColor: "#f2f2f2",
  fontWeight: "normal",
  padding: 14,
};

// Recurring reset — the block refreshes its contents back to a saved template at
// each period boundary (local midnight / Monday / 1st of month). Resets run lazily
// on whichever client has the board open, so a missed period never double-fires:
// one reset covers the whole gap and the archive entry is labelled with that span.
export interface BoxRecurrence {
  freq: "daily" | "weekly" | "monthly";
  /** Frozen copy of the block's items used as the fresh state after each reset */
  templateItems: BlockItem[];
  /** Save the outgoing contents to the block archive before resetting */
  autoArchive: boolean;
  /** Epoch ms of the next period boundary */
  nextResetAt: number;
  lastResetAt?: number;
}

export interface Box {
  id: string;
  boardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Explicitly "sent to back" — stays behind and is NOT auto-raised by clicks/
   *  right-clicks/drags. Cleared only by an explicit "Bring to front". */
  keepBehind?: boolean;
  locked: boolean;
  perms?: BoxPerms;
  title: string;
  isExpanded: boolean;
  items: BlockItem[];
  style: BoxStyle;
  collapsedStyle?: Partial<BoxStyle>; // overrides style fields when block is on the canvas (not expanded)
  recurrence?: BoxRecurrence;
  /** Live items stashed while the recurrence template is open in the expanded editor (presence = template-edit mode) */
  templateEditStash?: BlockItem[];
  // Deck (slideshow) container
  isDeck?: boolean;
  deckSlideIds?: string[];   // ordered IDs of slide boxes
  deckFocusIndex?: number;   // which slide is center
  // Deck appearance & behaviour
  deckTransition?: "slide" | "fade" | "scale" | "flip";
  deckLayout?: "centered" | "flat" | "stack";  // visual layout style
  deckAutoPlay?: boolean;        // default true
  deckAutoPlayMs?: number;       // default 3500
  deckShowArrows?: boolean;      // default true
  deckShowDots?: boolean;        // default true
  deckShowPeek?: boolean;        // show adjacent slides (default true)
  deckPeekScale?: number;        // adjacent slide scale  (default 0.82)
  deckPeekOpacity?: number;      // adjacent slide opacity (default 0.5)
  deckPeekBlur?: boolean;        // blur adjacent slides
  // Slide membership — set when this box is owned by a deck
  deckOwnerId?: string;
}

// ─── Board-level items (items placed directly on the canvas, not inside a block) ─

export interface BoardLevelItem extends BlockItem {
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  zIndex: number;
  /** Explicitly "sent to back" — stays behind and is NOT auto-raised by clicks/
   *  right-clicks/drags. Cleared only by an explicit "Bring to front". */
  keepBehind?: boolean;
  locked?: boolean;
}

// ─── Board ────────────────────────────────────────────────────────────────────

export interface Board {
  id: string;
  name: string;
  isPublic: boolean;
  isFinished: boolean;
  // Board (canvas) background — moves and scales with the canvas
  backgroundColor: string;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundFilter?: string;
  backgroundOverlayColor?: string;
  backgroundOverlayOpacity?: number;
  // Live wallpaper — an animated board background (overrides the static bg when set)
  backgroundVideo?: string;        // looping video URL
  backgroundLiveEffect?: string;   // visualizer effect id ("aurora"|"starfield"|"particles"|"rain"|"bars"|"wave"|"radial")
  backgroundLiveColor?: string;
  backgroundLiveColor2?: string;
  // Theme (outer) background — fills the viewport behind the canvas; doesn't move
  themeBgColor?: string;
  themeBgImage?: string;
  themeBgOpacity?: number;
  themeBgSize?: "cover" | "contain" | "auto";
  // Board-scoped theme (applied only inside the board area, never to the document root)
  boardThemeVars?: ThemeVarMap;
  collabEnabled?: boolean;
  serverId?: string;     // set when this board belongs to a server
  webhookToken?: string; // secret token for incoming webhooks
  chatChannels?: string[]; // chat channels available on this board (for the chat drawer)
  boxes: Box[];
  boardItems?: BoardLevelItem[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;    // set when soft-deleted; absent or undefined means active
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function isSupabaseMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder") && !url.includes("your-project");
}

// The last confirmed Supabase user ID, written by setCurrentUserId so the next
// page load can immediately read the user-specific theme without waiting for auth.
function getLastUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("plancraft-last-user-id");
}

// Personal boards are cached in localStorage scoped to the signed-in user, so two
// accounts sharing a browser never read or overwrite each other's boards. Guests
// (no uid) use the legacy unscoped key.
function boardsStorageKey(uid: string | null): string {
  return uid ? `plancraft-boards-v1-${uid}` : "plancraft-boards-v1";
}

function getSavedThemeVars(): ThemeVarMap {
  if (typeof window === "undefined") return DEFAULT_THEME_VARS;
  if (isSupabaseMode()) {
    // In Supabase mode, skip the generic key — it may belong to a different user.
    // Read from the user-specific key saved in the last session, or default.
    const uid = getLastUserId();
    if (uid) {
      try {
        const raw = localStorage.getItem(`plancraft-theme-vars-${uid}`);
        if (raw) return { ...DEFAULT_THEME_VARS, ...(JSON.parse(raw) as ThemeVarMap) };
      } catch {}
    }
    return DEFAULT_THEME_VARS;
  }
  try {
    const raw = localStorage.getItem("plancraft-theme-vars");
    return raw ? { ...DEFAULT_THEME_VARS, ...(JSON.parse(raw) as ThemeVarMap) } : DEFAULT_THEME_VARS;
  } catch { return DEFAULT_THEME_VARS; }
}

function getSavedThemes(): SavedTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("plancraft-saved-themes");
    return raw ? (JSON.parse(raw) as SavedTheme[]) : [];
  } catch { return []; }
}

function getSavedFont(): string {
  if (typeof window === "undefined") return "Inter";
  if (isSupabaseMode()) {
    const uid = getLastUserId();
    if (uid) {
      const font = localStorage.getItem(`plancraft-app-font-${uid}`);
      if (font) return font;
    }
    return "Inter";
  }
  return localStorage.getItem("plancraft-app-font") ?? "Inter";
}

function getSavedAppBg(): AppBgConfig {
  if (typeof window === "undefined") return { ...DEFAULT_APP_BG };
  if (isSupabaseMode()) {
    const uid = getLastUserId();
    if (uid) {
      try {
        const raw = localStorage.getItem(`plancraft-app-bg-${uid}`);
        if (raw) return { ...DEFAULT_APP_BG, ...(JSON.parse(raw) as Partial<AppBgConfig>) };
      } catch {}
    }
    return { ...DEFAULT_APP_BG };
  }
  try {
    const raw = localStorage.getItem("plancraft-app-bg");
    return raw ? { ...DEFAULT_APP_BG, ...(JSON.parse(raw) as Partial<AppBgConfig>) } : { ...DEFAULT_APP_BG };
  } catch { return { ...DEFAULT_APP_BG }; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultBoard(name = "My Board"): Board {
  return {
    id: crypto.randomUUID(),
    name,
    isPublic: false,
    isFinished: false,
    backgroundColor: "#1a1b1e",
    boxes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

type AnyBoardState = { boards: Board[]; serverBoards: Record<string, Board> };

function findBoardAny(s: AnyBoardState, boardId: string): Board | undefined {
  return s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId];
}

function findBox(s: AnyBoardState, boardId: string, boxId: string) {
  return findBoardAny(s, boardId)?.boxes.find((b) => b.id === boxId);
}

// ─── Canvas stacking ──────────────────────────────────────────────────────────
// Boxes and board-level items are siblings on the canvas and share ONE z-index
// space — so "bring to front" / "send to back" must consider both, or a box
// won't restack relative to a loose item (and vice-versa). zIndex must also stay
// >= 0: the board background sits at z-index:auto, so a negative value would hide
// the element behind it.
type ZStackEl = { zIndex: number };
function zStack(board: Board): ZStackEl[] {
  return [...board.boxes, ...(board.boardItems ?? [])];
}
function bringZToFront(board: Board, target: ZStackEl): void {
  const maxZ = zStack(board).reduce((m, o) => Math.max(m, o.zIndex), 0);
  target.zIndex = maxZ + 1;
}
function sendZToBack(board: Board, target: ZStackEl): void {
  const others = zStack(board).filter((o) => o !== target);
  const minZ = others.reduce((m, o) => Math.min(m, o.zIndex), Infinity);
  if (Number.isFinite(minZ) && minZ - 1 >= 0) {
    target.zIndex = minZ - 1;
  } else {
    // Already at the floor (0) — can't go negative without hiding behind the
    // background, so lift everything else up by one and keep the target at 0.
    for (const o of others) o.zIndex += 1;
    target.zIndex = 0;
  }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface BoardState {
  boards: Board[];
  serverBoards: Record<string, Board>;
  // IDs of personal boards the current user collaborates on but does not own.
  // Tracked separately (not persisted) so the sync layer saves them by data only
  // and never overwrites the owner's user_id.
  sharedBoardIds: string[];
  // Subset of sharedBoardIds shared as view-only: editing is blocked and they
  // are never written back.
  readonlyBoardIds: string[];
  activeBoardId: string;
  selectedBoxId: string | null;
  expandedBoxId: string | null;
  draggingBlockId: string | null;
  dragPos: { x: number; y: number } | null;
  resizeState: { id: string; x: number; y: number; width: number; height: number } | null;
  /** Live rect of a board-level item being moved — drives alignment guides. */
  itemDragRect: { id: string; x: number; y: number; width: number; height: number } | null;
  undoPast: UndoEntry[];
  undoFuture: UndoEntry[];
  /** Snapshot a board's content before a user mutation (coalesces rapid same-label edits). */
  recordUndo: (boardId: string, label: string) => void;
  undo: () => void;
  redo: () => void;
  showGrid: boolean;
  zoom: number;
  minZoom: number;
  panOffset: { x: number; y: number };
  /** Per-board saved view (zoom + pan) so switching boards preserves position. */
  boardViews: Record<string, { zoom: number; panOffset: { x: number; y: number } }>;

  // App appearance
  themeVars: ThemeVarMap;
  savedThemes: SavedTheme[];
  appFont: string;
  appBg: AppBgConfig;
  /** Set by AppShell after Supabase auth loads — used to scope theme storage to the account */
  currentUserId: string | null;

  /** Pending undo toast — set by removeBoard, cleared by restoreBoard or clearTrashToast */
  trashToast: { boardId: string; boardName: string } | null;
  clearTrashToast: () => void;

  // Board
  addBoard: (name?: string) => void;
  createBoardFromTemplate: (template: import("@/lib/communityTemplates").CommunityBoard) => void;
  /** Materialize template boxes into an existing board (community "block"/"item" entries). */
  insertTemplateBoxes: (boardId: string, boxes: import("@/lib/communityTemplates").TemplateBox[]) => void;
  removeBoard: (id: string) => void;
  restoreBoard: (id: string) => void;
  hardDeleteBoard: (id: string) => void;
  setActiveBoard: (id: string) => void;
  updateBoard: (id: string, patch: Partial<Omit<Board, "id" | "boxes">>) => void;
  finishBoard: (id: string) => void;
  editBoard: (id: string) => void;
  reorderBoards: (orderedIds: string[]) => void;

  // Box (block)
  addBox: (boardId: string, box: Omit<Box, "id" | "boardId" | "zIndex">, id?: string) => string;
  removeBox: (boardId: string, boxId: string) => void;
  updateBox: (boardId: string, boxId: string, patch: Partial<Omit<Box, "id" | "boardId" | "items">>) => void;
  moveBox: (boardId: string, boxId: string, x: number, y: number) => void;
  resizeBox: (boardId: string, boxId: string, width: number, height: number) => void;
  updateBoxStyle: (boardId: string, boxId: string, style: Partial<BoxStyle>) => void;
  updateBoxCollapsedStyle: (boardId: string, boxId: string, style: Partial<BoxStyle>) => void;
  bringToFront: (boardId: string, boxId: string, explicit?: boolean) => void;
  sendToBack: (boardId: string, boxId: string) => void;
  duplicateBox: (boardId: string, boxId: string) => void;
  copiedBox: Box | null;
  copyBox: (boardId: string, boxId: string) => void;
  pasteBox: (boardId: string, x: number, y: number) => void;
  // Deck actions
  createDeck: (boardId: string, draggedBoxId: string, targetBoxId: string) => void;
  addToDeck: (boardId: string, deckId: string, boxId: string) => void;
  setDeckFocus: (boardId: string, deckId: string, index: number) => void;
  ejectSlide: (boardId: string, deckId: string, slideIndex: number) => void;
  disbandDeck: (boardId: string, deckId: string) => void;

  // Server board actions
  addMemberTableRow: (boardId: string, boxId: string, itemId: string, userId: string, row: Omit<TableRow, "id">) => void;
  injectServerBoards: (boards: Board[]) => void;

  // Items inside blocks
  addItem: (boardId: string, boxId: string, item: Omit<BlockItem, "id"> & { id?: string }) => void;
  removeItem: (boardId: string, boxId: string, itemId: string) => void;
  updateItem: (boardId: string, boxId: string, itemId: string, patch: Partial<BlockItem>) => void;
  replaceBoxItems: (boardId: string, boxId: string, items: BlockItem[]) => void;
  beginTemplateEdit: (boardId: string, boxId: string) => void;
  endTemplateEdit: (boardId: string, boxId: string, save: boolean) => void;
  moveItemUp: (boardId: string, boxId: string, itemId: string) => void;
  moveItemDown: (boardId: string, boxId: string, itemId: string) => void;
  toggleItemInCollapsed: (boardId: string, boxId: string, itemId: string) => void;
  moveExpandedItem: (boardId: string, boxId: string, itemId: string, x: number, y: number) => void;
  resizeExpandedItem: (boardId: string, boxId: string, itemId: string, w: number, h: number) => void;
  duplicateItem: (boardId: string, boxId: string, itemId: string) => void;
  resetItemLayout: (boardId: string, boxId: string, itemId: string) => void;
  moveCollapsedItem: (boardId: string, boxId: string, itemId: string, x: number, y: number) => void;
  resizeCollapsedItem: (boardId: string, boxId: string, itemId: string, w: number, h: number) => void;

  // Board-level items (placed directly on canvas)
  addBoardItem: (boardId: string, item: Omit<BoardLevelItem, "id" | "zIndex"> & { id?: string; zIndex?: number }) => void;
  removeBoardItem: (boardId: string, itemId: string) => void;
  updateBoardItem: (boardId: string, itemId: string, patch: Partial<BoardLevelItem>) => void;
  moveBoardItem: (boardId: string, itemId: string, x: number, y: number) => void;
  resizeBoardItem: (boardId: string, itemId: string, w: number, h: number) => void;
  bringBoardItemToFront: (boardId: string, itemId: string, explicit?: boolean) => void;
  sendBoardItemToBack: (boardId: string, itemId: string) => void;
  duplicateBoardItem: (boardId: string, itemId: string) => void;
  focusItem: (boardId: string, boxId: string, itemId: string | null) => void;
  focusBoardItem: (boardId: string, itemId: string | null) => void;

  // Selection & expand
  selectBox: (id: string | null) => void;
  setExpandedBox: (id: string | null) => void;
  setDraggingBlock: (id: string | null) => void;
  setDragPos: (pos: { x: number; y: number } | null) => void;
  setResizeState: (v: { id: string; x: number; y: number; width: number; height: number } | null) => void;
  setItemDragRect: (v: { id: string; x: number; y: number; width: number; height: number } | null) => void;
  selectedBoardItemId: string | null;
  selectBoardItem: (id: string | null) => void;

  // View
  toggleGrid: () => void;
  setZoom: (z: number) => void;
  setMinZoom: (v: number) => void;
  setPanOffset: (v: { x: number; y: number }) => void;
  zoomAtCanvasCenter: (newZoom: number) => void;
  /** Snapshot the current zoom+pan as a board's remembered view. */
  rememberBoardView: (boardId: string) => void;

  // Appearance actions
  setCurrentUserId: (uid: string | null) => void;
  /** Load theme from user-specific localStorage (or defaults if none saved). */
  hydrateUserTheme: (uid: string) => void;
  setThemeVars: (vars: ThemeVarMap) => void;        // app-level (Settings)
  setBoardTheme: (boardId: string, vars: ThemeVarMap) => void; // board-level (ThemePanel)
  clearBoardTheme: (boardId: string) => void;
  saveCurrentTheme: (name: string, vars: ThemeVarMap) => void;
  deleteSavedTheme: (id: string) => void;
  setAppFont: (name: string) => void;
  setAppBg: (patch: Partial<AppBgConfig>) => void;

  // User fonts (for box style panel)
  userFonts: UserFont[];
  addUserFont: (font: UserFont) => void;
  removeUserFont: (name: string) => void;

  // Board persistence
  // True once boards were loaded from a real source (localStorage or Supabase).
  // persistBoards no-ops until then, so the in-memory boot default can never
  // overwrite stored boards during the load race.
  boardsHydrated: boolean;
  persistBoards: () => void;
  hydrateBoards: (uid?: string) => void;
  setSharedBoardIds: (ids: string[]) => void;
  setReadonlyBoardIds: (ids: string[]) => void;

  // Webhooks
  setWebhookToken: (boardId: string, token: string | undefined) => void;
  addChatChannel: (boardId: string, name: string) => void;
  addWebhookItems: (boardId: string, items: Omit<BoardLevelItem, "id" | "zIndex">[]) => void;

}

export interface UserFont {
  name: string;
  dataUrl: string;
}

// ─── Sample content ───────────────────────────────────────────────────────────

function makeSampleBoxes(boardId: string): Box[] {
  const mk = (
    id: string, title: string, x: number, y: number, w: number, h: number,
    bg: string, border: string
  ): Box => ({
    id,
    boardId,
    x, y, width: w, height: h,
    zIndex: 1,
    locked: false,
    title,
    isExpanded: false,
    items: [],
    style: { ...DEFAULT_BOX_STYLE, backgroundColor: bg, borderColor: border, borderRadius: 14 },
  });
  return [
    mk("s1", "Goals",         80,   80,  380, 280, "#2d1e3a", "#d59ee8"),
    mk("s2", "Ideas",        520,   80,  320, 200, "#2a1f4a", "#9c84ef"),
    mk("s3", "Creative",     900,   80,  340, 240, "#3a1530", "#eb459e"),
    mk("s4", "Projects",    1300,   80,  360, 300, "#0d2b3a", "#00b0f4"),
    mk("s5", "Reading List",  80,  440,  460, 240, "#2d2000", "#faa61a"),
    mk("s6", "Weekly Review",600,  380,  340, 280, "#0d2a1a", "#57f287"),
    mk("s7", "Vision Board", 1000, 400,  560, 200, "#1a1b1e", "#373a40"),
    mk("s8", "Daily Habits",  80,  760,  300, 200, "#2a0d0e", "#ed4245"),
  ];
}

// ─── Store ────────────────────────────────────────────────────────────────────

const initialBoard = makeDefaultBoard("My First Board");
initialBoard.boxes = makeSampleBoxes(initialBoard.id);

export const useBoardStore = create<BoardState>()(
  immer((set, get) => ({
    boards: [initialBoard],
    serverBoards: {} as Record<string, Board>,
    sharedBoardIds: [],
    readonlyBoardIds: [],
    activeBoardId: initialBoard.id,
    selectedBoxId: null,
    expandedBoxId: null,
    draggingBlockId: null,
    dragPos: null,
    resizeState: null,
    itemDragRect: null,
    undoPast: [],
    undoFuture: [],
    copiedBox: null,
    selectedBoardItemId: null,
    showGrid: false,
    zoom: 1,
    minZoom: 0.05,
    panOffset: { x: 0, y: 0 },
    boardViews: {},
    themeVars: getSavedThemeVars(),
    savedThemes: getSavedThemes(),
    appFont: getSavedFont(),
    appBg: getSavedAppBg(),
    currentUserId: null,
    boardsHydrated: false,
    trashToast: null,
    userFonts: [],

    clearTrashToast: () => set((s) => { s.trashToast = null; }),

    addBoard: (name) => {
      set((s) => {
        const personal = s.boards.filter((b) => !b.serverId && !b.deletedAt);
        if (personal.length >= 3) return;
        const b = makeDefaultBoard(name);
        s.boards.push(b);
        s.activeBoardId = b.id;
      });
    },

    createBoardFromTemplate: (template) =>
      set((s) => {
        const personal = s.boards.filter((b) => !b.serverId && !b.deletedAt);
        if (personal.length >= 3) return;
        const boardId = crypto.randomUUID();
        const d = template.boardData;
        const board: Board = {
          ...makeDefaultBoard(template.name),
          id: boardId,
          backgroundColor: d.backgroundColor ?? "#1a1b1e",
          backgroundImage: d.backgroundImage,
          backgroundOpacity: d.backgroundOpacity,
          backgroundSize: d.backgroundSize,
          backgroundPosition: d.backgroundPosition,
          backgroundFilter: d.backgroundFilter,
          backgroundOverlayColor: d.backgroundOverlayColor,
          backgroundOverlayOpacity: d.backgroundOverlayOpacity,
          backgroundVideo: d.backgroundVideo,
          backgroundLiveEffect: d.backgroundLiveEffect,
          backgroundLiveColor: d.backgroundLiveColor,
          backgroundLiveColor2: d.backgroundLiveColor2,
          themeBgColor: d.themeBgColor,
          themeBgImage: d.themeBgImage,
          themeBgOpacity: d.themeBgOpacity,
          themeBgSize: d.themeBgSize,
          boardThemeVars: d.boardThemeVars,
          boardItems: (d.boardItems ?? []).map((it) => ({ ...it, id: nanoid() })) as BoardLevelItem[],
          boxes: template.boardData.boxes.map((tBox, i) => ({
            id: crypto.randomUUID(),
            boardId,
            x: tBox.x,
            y: tBox.y,
            width: tBox.width,
            height: tBox.height,
            zIndex: i + 1,
            locked: false,
            title: tBox.title,
            isExpanded: false,
            style: { ...DEFAULT_BOX_STYLE, ...(tBox.style ?? {}) },
            items: tBox.items.map((item) => ({
              ...item,
              id: nanoid(),
              showInCollapsed: false,
            })),
          })),
        };
        s.boards.push(board);
        s.activeBoardId = boardId;
      }),

    insertTemplateBoxes: (boardId, tBoxes) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        let maxZ = board.boxes.reduce((m, b) => Math.max(m, b.zIndex), 0);
        // Stagger inserts so repeated adds don't stack perfectly on top of each other
        const shift = 40 + (board.boxes.length % 8) * 28;
        for (const tBox of tBoxes) {
          board.boxes.push({
            id: crypto.randomUUID(),
            boardId,
            x: tBox.x + shift,
            y: tBox.y + shift,
            width: tBox.width,
            height: tBox.height,
            zIndex: ++maxZ,
            locked: false,
            title: tBox.title,
            isExpanded: false,
            style: { ...DEFAULT_BOX_STYLE, ...(tBox.style ?? {}) },
            items: tBox.items.map((item) => ({
              ...item,
              id: nanoid(),
              showInCollapsed: false,
            })),
          });
        }
      }),

    removeBoard: (id) =>
      set((s) => {
        const board = s.boards.find((b) => b.id === id);
        if (!board) return;
        board.deletedAt = Date.now();
        board.updatedAt = Date.now();
        s.trashToast = { boardId: id, boardName: board.name };
        if (s.activeBoardId === id) {
          const next = s.boards.find((b) => b.id !== id && !b.serverId && !b.deletedAt);
          s.activeBoardId = next?.id ?? "";
          s.selectedBoxId = null;
          s.expandedBoxId = null;
        }
      }),

    restoreBoard: (id) =>
      set((s) => {
        const board = s.boards.find((b) => b.id === id);
        if (!board) return;
        delete board.deletedAt;
        board.updatedAt = Date.now();
        s.trashToast = null;
        s.activeBoardId = id;
      }),

    hardDeleteBoard: (id) =>
      set((s) => {
        s.boards = s.boards.filter((b) => b.id !== id);
        if (s.activeBoardId === id) {
          const next = s.boards.find((b) => !b.serverId && !b.deletedAt);
          s.activeBoardId = next?.id ?? "";
          s.selectedBoxId = null;
          s.expandedBoxId = null;
        }
      }),

    setActiveBoard: (id) => set((s) => { s.activeBoardId = id; }),

    // ── Server board actions ───────────────────────────────────────────────
    injectServerBoards: (boards) =>
      set((s) => {
        for (const b of boards) {
          if (!s.serverBoards[b.id]) {
            s.serverBoards[b.id] = b;
          } else {
            // Always refresh theme/metadata from authoritative mock source
            s.serverBoards[b.id].boardThemeVars = b.boardThemeVars;
            s.serverBoards[b.id].name = b.name;
          }
        }
      }),

    addMemberTableRow: (boardId, boxId, itemId, userId, row) =>
      set((s) => {
        const item = findBoardAny(s, boardId)
          ?.boxes.find((bx) => bx.id === boxId)
          ?.items.find((it) => it.id === itemId);
        if (!item) return;
        if (!item.tableMemberRows) item.tableMemberRows = {};
        if (!item.tableMemberRows[userId]) item.tableMemberRows[userId] = [];
        item.tableMemberRows[userId].push({ ...row, id: crypto.randomUUID() });
      }),

    updateBoard: (id, patch) => {
      set((s) => {
        const b = findBoardAny(s, id);
        if (!b) return;
        Object.assign(b, patch, { updatedAt: Date.now() });
      });
    },

    finishBoard: (id) =>
      set((s) => {
        const b = findBoardAny(s, id);
        if (!b) return;
        b.isFinished = true;
        b.boxes.forEach((bx) => { bx.locked = true; bx.isExpanded = false; });
        s.showGrid = false;
        s.selectedBoxId = null;
        s.expandedBoxId = null;
      }),

    editBoard: (id) =>
      set((s) => {
        const b = findBoardAny(s, id);
        if (!b) return;
        b.isFinished = false;
        b.boxes.forEach((bx) => { bx.locked = false; });
        s.showGrid = true;
      }),

    reorderBoards: (orderedIds) =>
      set((s) => {
        const sorted: Board[] = [];
        for (const id of orderedIds) {
          const b = s.boards.find((b) => b.id === id);
          if (b) sorted.push(b);
        }
        // Append any boards not in orderedIds (shouldn't happen, but safe)
        for (const b of s.boards) {
          if (!sorted.find((x) => x.id === b.id)) sorted.push(b);
        }
        s.boards = sorted;
      }),

    addBox: (boardId, box, id?) => {
      const newId = id ?? crypto.randomUUID();
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const maxZ = board.boxes.reduce((m, b) => Math.max(m, b.zIndex), 0);
        board.boxes.push({ ...box, id: newId, boardId, zIndex: maxZ + 1, keepBehind: false });
      });
      return newId;
    },

    removeBox: (boardId, boxId) => {
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const box = board.boxes.find((b) => b.id === boxId);
        if (box) {
          if (box.deckOwnerId) {
            const deck = board.boxes.find((b) => b.id === box.deckOwnerId);
            if (deck?.isDeck && deck.deckSlideIds) {
              deck.deckSlideIds = deck.deckSlideIds.filter((id) => id !== boxId);
              deck.deckFocusIndex = Math.min(deck.deckFocusIndex ?? 0, Math.max(0, deck.deckSlideIds.length - 1));
              if (deck.deckSlideIds.length <= 1) {
                if (deck.deckSlideIds.length === 1) {
                  const lastSlide = board.boxes.find((b) => b.id === deck.deckSlideIds![0]);
                  if (lastSlide) { lastSlide.deckOwnerId = undefined; lastSlide.x = deck.x; lastSlide.y = deck.y; }
                }
                board.boxes = board.boxes.filter((b) => b.id !== deck.id);
              }
            }
          }
          if (box.isDeck && box.deckSlideIds) {
            box.deckSlideIds.forEach((sid) => {
              const slide = board.boxes.find((b) => b.id === sid);
              if (slide) slide.deckOwnerId = undefined;
            });
          }
        }
        board.boxes = board.boxes.filter((b) => b.id !== boxId);
        if (s.selectedBoxId === boxId) s.selectedBoxId = null;
        if (s.expandedBoxId === boxId) s.expandedBoxId = null;
      });
    },

    updateBox: (boardId, boxId, patch) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) Object.assign(box, patch);
      }),

    moveBox: (boardId, boxId, x, y) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) { box.x = x; box.y = y; }
      }),

    resizeBox: (boardId, boxId, width, height) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) { box.width = width; box.height = height; }
      }),

    updateBoxStyle: (boardId, boxId, style) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) Object.assign(box.style, style);
      }),

    updateBoxCollapsedStyle: (boardId, boxId, style) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box) return;
        box.collapsedStyle = { ...(box.collapsedStyle ?? {}), ...style };
        // Remove keys explicitly set to undefined so they fall back to the main style
        Object.keys(box.collapsedStyle).forEach((k) => {
          if ((box.collapsedStyle as Record<string, unknown>)[k] === undefined)
            delete (box.collapsedStyle as Record<string, unknown>)[k];
        });
      }),

    bringToFront: (boardId, boxId, explicit = false) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        const box = board?.boxes.find((b) => b.id === boxId);
        if (!board || !box) return;
        // A box pinned to the back ignores incidental raises (select/right-click/
        // drag); only an explicit "Bring to front" lifts it.
        if (box.keepBehind && !explicit) return;
        box.keepBehind = false;
        bringZToFront(board, box);
      }),

    sendToBack: (boardId, boxId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        const box = board?.boxes.find((b) => b.id === boxId);
        if (!board || !box) return;
        box.keepBehind = true;
        sendZToBack(board, box);
      }),

    duplicateBox: (boardId, boxId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const box = board.boxes.find((b) => b.id === boxId);
        if (!box) return;
        const maxZ = board.boxes.reduce((m, b) => Math.max(m, b.zIndex), 0);
        const clone: Box = JSON.parse(JSON.stringify(box));
        clone.id = crypto.randomUUID();
        clone.x = box.x + 24;
        clone.y = box.y + 24;
        clone.zIndex = maxZ + 1;
        clone.keepBehind = false; // a fresh copy lands at the front, not pinned back
        clone.title = box.title ? box.title + " (copy)" : "";
        clone.items = clone.items.map((item) => ({ ...item, id: nanoid() }));
        board.boxes.push(clone);
        s.selectedBoxId = clone.id;
      }),

    copyBox: (boardId, boxId) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) s.copiedBox = JSON.parse(JSON.stringify(box));
      }),

    pasteBox: (boardId, x, y) =>
      set((s) => {
        if (!s.copiedBox) return;
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const maxZ = board.boxes.reduce((m, b) => Math.max(m, b.zIndex), 0);
        const clone: Box = JSON.parse(JSON.stringify(s.copiedBox));
        clone.id = crypto.randomUUID();
        clone.x = x;
        clone.y = y;
        clone.zIndex = maxZ + 1;
        clone.title = clone.title ? clone.title + " (copy)" : "";
        clone.items = clone.items.map((item) => ({ ...item, id: nanoid() }));
        clone.boardId = boardId;
        // Drop deck membership — a pasted box belongs to the target board only
        clone.deckOwnerId = undefined;
        clone.isDeck = undefined;
        clone.deckSlideIds = undefined;
        board.boxes.push(clone);
        s.selectedBoxId = clone.id;
      }),

    createDeck: (boardId, draggedBoxId, targetBoxId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const dragged = board.boxes.find((b) => b.id === draggedBoxId);
        const target = board.boxes.find((b) => b.id === targetBoxId);
        if (!dragged || !target) return;
        const deckId = crypto.randomUUID();
        const maxZ = board.boxes.reduce((m, b) => Math.max(m, b.zIndex), 0);
        const w = Math.max(dragged.width, target.width, 320);
        const h = Math.max(dragged.height, target.height, 220);
        // Mark both boxes as deck-owned
        dragged.deckOwnerId = deckId;
        target.deckOwnerId = deckId;
        // Insert deck container at target's position
        board.boxes.push({
          id: deckId, boardId,
          x: target.x, y: target.y,
          width: w, height: h,
          zIndex: maxZ + 1,
          locked: false,
          title: "",
          isExpanded: false,
          items: [],
          style: { ...DEFAULT_BOX_STYLE },
          isDeck: true,
          deckSlideIds: [targetBoxId, draggedBoxId],
          deckFocusIndex: 0,
        });
      }),

    addToDeck: (boardId, deckId, boxId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const deck = board.boxes.find((b) => b.id === deckId);
        const box = board.boxes.find((b) => b.id === boxId);
        if (!deck || !box || !deck.isDeck) return;
        // H4: skip if already in the deck
        if ((deck.deckSlideIds ?? []).includes(boxId)) return;
        box.deckOwnerId = deckId;
        deck.deckSlideIds = [...(deck.deckSlideIds ?? []), boxId];
        deck.deckFocusIndex = (deck.deckSlideIds.length) - 1;
      }),

    setDeckFocus: (boardId, deckId, index) =>
      set((s) => {
        const deck = findBox(s, boardId, deckId);
        if (deck?.isDeck) deck.deckFocusIndex = index;
      }),

    ejectSlide: (boardId, deckId, slideIndex) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const deck = board.boxes.find((b) => b.id === deckId);
        if (!deck?.isDeck || !deck.deckSlideIds) return;
        const slideId = deck.deckSlideIds[slideIndex];
        const slide = board.boxes.find((b) => b.id === slideId);
        if (slide) {
          slide.deckOwnerId = undefined;
          slide.x = deck.x + slideIndex * 40;
          slide.y = deck.y + 40;
        }
        deck.deckSlideIds = deck.deckSlideIds.filter((_, i) => i !== slideIndex);
        deck.deckFocusIndex = Math.min(deck.deckFocusIndex ?? 0, Math.max(0, deck.deckSlideIds.length - 1));
        // If only 0 or 1 slides left, disband
        if (deck.deckSlideIds.length <= 1) {
          if (deck.deckSlideIds.length === 1) {
            const lastSlide = board.boxes.find((b) => b.id === deck.deckSlideIds![0]);
            if (lastSlide) { lastSlide.deckOwnerId = undefined; lastSlide.x = deck.x; lastSlide.y = deck.y; }
          }
          board.boxes = board.boxes.filter((b) => b.id !== deckId);
          if (s.selectedBoxId === deckId) s.selectedBoxId = null;
          if (s.expandedBoxId === deckId) s.expandedBoxId = null;
        }
      }),

    disbandDeck: (boardId, deckId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const deck = board.boxes.find((b) => b.id === deckId);
        if (!deck?.isDeck) return;
        (deck.deckSlideIds ?? []).forEach((sid, i) => {
          const slide = board.boxes.find((b) => b.id === sid);
          if (slide) { slide.deckOwnerId = undefined; slide.x = deck.x + i * 40; slide.y = deck.y + 40; }
        });
        board.boxes = board.boxes.filter((b) => b.id !== deckId);
        if (s.selectedBoxId === deckId) s.selectedBoxId = null;
        if (s.expandedBoxId === deckId) s.expandedBoxId = null;
      }),

    addItem: (boardId, boxId, item) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box) return;
        const { id: forcedId, ...rest } = item as typeof item & { id?: string };
        box.items.push({ ...rest, id: forcedId ?? nanoid() } as BlockItem);
      }),

    removeItem: (boardId, boxId, itemId) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) box.items = box.items.filter((i) => i.id !== itemId);
      }),

    updateItem: (boardId, boxId, itemId, patch) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        const item = box?.items.find((i) => i.id === itemId);
        if (item) Object.assign(item, patch);
      }),

    replaceBoxItems: (boardId, boxId, items) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (box) box.items = items;
      }),

    // ─── Template editing (recurring blocks) ──────────────────────────────────
    // Swaps the recurrence template into box.items so the normal expanded editor
    // edits it, while the live contents wait in templateEditStash. endTemplateEdit
    // writes the result back to the template and restores the live items.
    beginTemplateEdit: (boardId, boxId) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box?.recurrence) return;
        if (box.templateEditStash) return; // already mid-edit (resuming an abandoned session)
        box.templateEditStash = box.items;
        box.items = JSON.parse(JSON.stringify(box.recurrence.templateItems));
      }),

    endTemplateEdit: (boardId, boxId, save) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box?.templateEditStash) return;
        if (save && box.recurrence) {
          box.recurrence = { ...box.recurrence, templateItems: JSON.parse(JSON.stringify(box.items)) };
        }
        box.items = box.templateEditStash;
        box.templateEditStash = undefined;
      }),

    moveItemUp: (boardId, boxId, itemId) =>
      set((s) => {
        const items = findBox(s, boardId, boxId)?.items;
        if (!items) return;
        const i = items.findIndex((x) => x.id === itemId);
        if (i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      }),

    moveItemDown: (boardId, boxId, itemId) =>
      set((s) => {
        const items = findBox(s, boardId, boxId)?.items;
        if (!items) return;
        const i = items.findIndex((x) => x.id === itemId);
        if (i < items.length - 1) [items[i], items[i + 1]] = [items[i + 1], items[i]];
      }),

    toggleItemInCollapsed: (boardId, boxId, itemId) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) item.showInCollapsed = !item.showInCollapsed;
      }),

    moveExpandedItem: (boardId, boxId, itemId, x, y) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) { item.expandedX = x; item.expandedY = y; }
      }),

    resizeExpandedItem: (boardId, boxId, itemId, w, h) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) { item.expandedW = w; item.expandedH = h; }
      }),

    duplicateItem: (boardId, boxId, itemId) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box) return;
        const idx = box.items.findIndex((i) => i.id === itemId);
        if (idx < 0) return;
        const clone: BlockItem = JSON.parse(JSON.stringify(box.items[idx]));
        clone.id = nanoid();
        if (clone.expandedX !== undefined) clone.expandedX += 24;
        if (clone.expandedY !== undefined) clone.expandedY += 24;
        box.items.splice(idx + 1, 0, clone);
      }),

    resetItemLayout: (boardId, boxId, itemId) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) { item.expandedX = undefined; item.expandedY = undefined; item.expandedW = undefined; item.expandedH = undefined; }
      }),

    moveCollapsedItem: (boardId, boxId, itemId, x, y) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) { item.collapsedX = x; item.collapsedY = y; }
      }),

    resizeCollapsedItem: (boardId, boxId, itemId, w, h) =>
      set((s) => {
        const item = findBox(s, boardId, boxId)?.items.find((i) => i.id === itemId);
        if (item) { item.collapsedW = w; item.collapsedH = h; }
      }),

    // ─── Board-level item actions ───────────────────────────────────────────────

    addBoardItem: (boardId, item) => {
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        if (!board.boardItems) board.boardItems = [];
        const maxZ = Math.max(0, ...board.boxes.map(b => b.zIndex), ...board.boardItems.map(i => i.zIndex));
        const { id: forcedId, ...rest } = item as typeof item & { id?: string };
        board.boardItems.push({ ...rest, id: forcedId ?? nanoid(), zIndex: item.zIndex ?? maxZ + 1 } as BoardLevelItem);
      });
    },

    removeBoardItem: (boardId, itemId) => {
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        board.boardItems = (board.boardItems ?? []).filter((i) => i.id !== itemId);
        if (s.selectedBoardItemId === itemId) s.selectedBoardItemId = null;
      });
    },

    updateBoardItem: (boardId, itemId, patch) =>
      set((s) => {
        const item = findBoardAny(s, boardId)?.boardItems?.find((i) => i.id === itemId);
        if (item) Object.assign(item, patch);
      }),

    moveBoardItem: (boardId, itemId, x, y) =>
      set((s) => {
        const item = findBoardAny(s, boardId)?.boardItems?.find((i) => i.id === itemId);
        if (item) { item.boardX = x; item.boardY = y; }
      }),

    resizeBoardItem: (boardId, itemId, w, h) =>
      set((s) => {
        const item = findBoardAny(s, boardId)?.boardItems?.find((i) => i.id === itemId);
        if (item) { item.boardW = w; item.boardH = h; }
      }),

    bringBoardItemToFront: (boardId, itemId, explicit = false) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        const item = board?.boardItems?.find((i) => i.id === itemId);
        if (!board || !item) return;
        // A backdrop item pinned to the back ignores incidental raises (select/
        // right-click/drag); only an explicit "Bring to front" lifts it.
        if (item.keepBehind && !explicit) return;
        item.keepBehind = false;
        bringZToFront(board, item);
      }),

    sendBoardItemToBack: (boardId, itemId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        const item = board?.boardItems?.find((i) => i.id === itemId);
        if (!board || !item) return;
        item.keepBehind = true;
        sendZToBack(board, item);
      }),

    duplicateBoardItem: (boardId, itemId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board?.boardItems) return;
        const item = board.boardItems.find((i) => i.id === itemId);
        if (!item) return;
        const maxZ = Math.max(0, ...board.boxes.map(b => b.zIndex), ...board.boardItems.map(i => i.zIndex));
        const clone: BoardLevelItem = JSON.parse(JSON.stringify(item));
        clone.id = nanoid();
        clone.boardX = item.boardX + 24;
        clone.boardY = item.boardY + 24;
        clone.zIndex = maxZ + 1;
        clone.keepBehind = false; // a fresh copy lands at the front, not pinned back
        board.boardItems.push(clone);
        s.selectedBoardItemId = clone.id;
      }),

    focusItem: (boardId, boxId, itemId) =>
      set((s) => {
        const box = findBox(s, boardId, boxId);
        if (!box) return;
        box.items.forEach((i) => { i.isFocused = i.id === itemId ? true : undefined; });
      }),

    focusBoardItem: (boardId, itemId) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board?.boardItems) return;
        board.boardItems.forEach((i) => { i.isFocused = i.id === itemId ? true : undefined; });
      }),

    selectBox: (id) => set((s) => { s.selectedBoxId = id; }),
    setExpandedBox: (id) => set((s) => { s.expandedBoxId = id; }),
    setDraggingBlock: (id) => set((s) => { s.draggingBlockId = id; }),
    recordUndo: (boardId, label) => {
      if (undoSuppressed) return;
      set((s) => {
        const last = s.undoPast[s.undoPast.length - 1];
        if (last && last.boardId === boardId && last.label === label && Date.now() - last.ts < 800) {
          last.ts = Date.now(); // rapid same-kind edits (slider drags, typing) coalesce
          return;
        }
        const board = s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId];
        if (!board) return;
        s.undoPast.push({
          boardId, label, ts: Date.now(),
          boxes: JSON.parse(JSON.stringify(board.boxes)),
          boardItems: JSON.parse(JSON.stringify(board.boardItems ?? [])),
        });
        if (s.undoPast.length > 50) s.undoPast.shift();
        s.undoFuture = [];
      });
    },

    undo: () => {
      if (get().undoPast.length === 0) return;
      set((s) => {
        const e = s.undoPast.pop();
        if (!e) return;
        const board = s.boards.find((b) => b.id === e.boardId) ?? s.serverBoards[e.boardId];
        if (!board) return;
        s.undoFuture.push({
          boardId: e.boardId, label: e.label, ts: Date.now(),
          boxes: JSON.parse(JSON.stringify(board.boxes)),
          boardItems: JSON.parse(JSON.stringify(board.boardItems ?? [])),
        });
        if (s.undoFuture.length > 50) s.undoFuture.shift();
        board.boxes = e.boxes;
        board.boardItems = e.boardItems;
      });
      get().persistBoards();
    },

    redo: () => {
      if (get().undoFuture.length === 0) return;
      set((s) => {
        const e = s.undoFuture.pop();
        if (!e) return;
        const board = s.boards.find((b) => b.id === e.boardId) ?? s.serverBoards[e.boardId];
        if (!board) return;
        s.undoPast.push({
          boardId: e.boardId, label: e.label, ts: Date.now(),
          boxes: JSON.parse(JSON.stringify(board.boxes)),
          boardItems: JSON.parse(JSON.stringify(board.boardItems ?? [])),
        });
        if (s.undoPast.length > 50) s.undoPast.shift();
        board.boxes = e.boxes;
        board.boardItems = e.boardItems;
      });
      get().persistBoards();
    },

    setDragPos: (pos) => set((s) => { s.dragPos = pos; }),
    setItemDragRect: (v) => set((s) => { s.itemDragRect = v; }),
    setResizeState: (v) => set((s) => { s.resizeState = v; }),

    selectBoardItem: (id) =>
      set((s) => {
        s.selectedBoardItemId = id;
        if (id !== null) {
          // Deselect block and close expanded view when selecting a board item
          s.selectedBoxId = null;
          s.expandedBoxId = null;
        }
      }),

    toggleGrid: () => set((s) => { s.showGrid = !s.showGrid; }),
    setZoom: (z) => set((s) => { s.zoom = Math.max(s.minZoom, Math.min(3,z)); }),
    setMinZoom: (v) => set((s) => { s.minZoom = v; if (s.zoom < v) s.zoom = v; }),
    setPanOffset: (v) => set((s) => { s.panOffset = v; }),
    rememberBoardView: (boardId) => set((s) => {
      if (boardId) s.boardViews[boardId] = { zoom: s.zoom, panOffset: s.panOffset };
    }),
    zoomAtCanvasCenter: (newZoom) => set((s) => {
      const clamped = Math.max(s.minZoom, Math.min(3,newZoom));
      const cx = 1280; // CANVAS_WIDTH / 2
      const cy = 720;  // CANVAS_HEIGHT / 2
      s.panOffset = {
        x: s.panOffset.x + cx * (s.zoom - clamped),
        y: s.panOffset.y + cy * (s.zoom - clamped),
      };
      s.zoom = clamped;
    }),

    setCurrentUserId: (uid) => {
      set((s) => { s.currentUserId = uid; });
      if (typeof window !== "undefined") {
        if (uid) localStorage.setItem("plancraft-last-user-id", uid);
        else localStorage.removeItem("plancraft-last-user-id");
      }
    },

    hydrateUserTheme: (uid) => {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem(`plancraft-theme-vars-${uid}`);
      const vars = raw ? { ...DEFAULT_THEME_VARS, ...(JSON.parse(raw) as ThemeVarMap) } : DEFAULT_THEME_VARS;
      const font = localStorage.getItem(`plancraft-app-font-${uid}`) ?? "Inter";
      const bgRaw = localStorage.getItem(`plancraft-app-bg-${uid}`);
      const bg = bgRaw ? { ...DEFAULT_APP_BG, ...(JSON.parse(bgRaw) as Partial<AppBgConfig>) } : { ...DEFAULT_APP_BG };
      applyThemeVars(vars);
      applyAppFont(font);
      set((s) => { s.themeVars = vars; s.appFont = font; s.appBg = bg; });
    },

    setThemeVars: (vars) => {
      applyThemeVars(vars);
      if (typeof window !== "undefined") {
        const uid = get().currentUserId ?? getLastUserId();
        if (uid) {
          localStorage.setItem(`plancraft-theme-vars-${uid}`, JSON.stringify(vars));
        } else {
          localStorage.setItem("plancraft-theme-vars", JSON.stringify(vars));
        }
      }
      set((s) => { s.themeVars = vars; });
    },

    setBoardTheme: (boardId, vars) =>
      set((s) => {
        const b = findBoardAny(s, boardId);
        if (b) b.boardThemeVars = vars;
      }),

    clearBoardTheme: (boardId) =>
      set((s) => {
        const b = findBoardAny(s, boardId);
        if (b) delete b.boardThemeVars;
      }),

    saveCurrentTheme: (name, vars) => {
      const id = nanoid(8);
      set((s) => { s.savedThemes.push({ id, name, vars: { ...vars } }); });
      if (typeof window !== "undefined")
        localStorage.setItem("plancraft-saved-themes", JSON.stringify(get().savedThemes));
    },

    deleteSavedTheme: (id) => {
      set((s) => { s.savedThemes = s.savedThemes.filter((t) => t.id !== id); });
      if (typeof window !== "undefined")
        localStorage.setItem("plancraft-saved-themes", JSON.stringify(get().savedThemes));
    },

    setAppFont: (name) => {
      applyAppFont(name);
      if (typeof window !== "undefined") {
        const uid = get().currentUserId ?? getLastUserId();
        if (uid) {
          localStorage.setItem(`plancraft-app-font-${uid}`, name);
        } else {
          localStorage.setItem("plancraft-app-font", name);
        }
      }
      set((s) => { s.appFont = name; });
    },

    setAppBg: (patch) => {
      set((s) => { s.appBg = { ...s.appBg, ...patch }; });
      if (typeof window !== "undefined") {
        const uid = get().currentUserId ?? getLastUserId();
        if (uid) {
          localStorage.setItem(`plancraft-app-bg-${uid}`, JSON.stringify(get().appBg));
        } else {
          localStorage.setItem("plancraft-app-bg", JSON.stringify(get().appBg));
        }
      }
    },

    addUserFont: (font) => set((s) => {
      if (!s.userFonts.find((f) => f.name === font.name)) s.userFonts.push(font);
    }),
    removeUserFont: (name) => set((s) => { s.userFonts = s.userFonts.filter((f) => f.name !== name); }),

    setWebhookToken: (boardId, token) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (board) board.webhookToken = token;
      }),

    addChatChannel: (boardId, name) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
        if (!clean) return;
        const list = board.chatChannels ?? ["general"];
        if (!list.includes(clean)) board.chatChannels = [...list, clean];
      }),

    addWebhookItems: (boardId, items) =>
      set((s) => {
        const board = findBoardAny(s, boardId);
        if (!board) return;
        board.boardItems ??= [];
        const maxZ = Math.max(0, ...board.boxes.map((b) => b.zIndex), ...board.boardItems.map((i) => i.zIndex));
        items.forEach((item, idx) => {
          board.boardItems!.push({
            ...item,
            id: nanoid(),
            zIndex: maxZ + 1 + idx,
            boardX: 80 + idx * 340,
            boardY: 80,
            boardW: 320,
            boardH: 220,
          } as BoardLevelItem);
        });
      }),

    setSharedBoardIds: (ids) => set((s) => { s.sharedBoardIds = ids; }),
    setReadonlyBoardIds: (ids) => set((s) => { s.readonlyBoardIds = ids; }),

    persistBoards: () => {
      // Until boards are loaded (hydrateBoards or Supabase), the store only holds
      // the boot default — writing it would destroy the stored boards (guest data
      // loss on every reload).
      if (!get().boardsHydrated) return;
      try {
        const { boards, activeBoardId, currentUserId } = get();
        const uid = currentUserId ?? getLastUserId();
        localStorage.setItem(boardsStorageKey(uid), JSON.stringify({ boards, activeBoardId }));
        // Server boards are NEVER hydrated from localStorage (M10: injectServerBoards
        // owns them, sourced from the DB) — mirroring them here only burned quota:
        // one draft + its :live twin with an inline wallpaper filled all ~10MB and
        // made every other save fail ("Storage is full"). Drop the legacy key too.
        localStorage.removeItem("plancraft-server-boards-v1");
      } catch {
        if (typeof window !== "undefined")
          window.dispatchEvent(new CustomEvent("plancraft:storage-error"));
      }
    },

    hydrateBoards: (uid?: string) => {
      // Read this user's own scoped cache. Falls back to the store's known user
      // (or last-known) so a stray call without an explicit uid still stays scoped.
      const resolvedUid = uid ?? get().currentUserId ?? getLastUserId();
      const key = boardsStorageKey(resolvedUid);
      // M11: separate try/catch per key so one failure doesn't delete the other
      let personalBoards: Board[] | null = null;
      let safeId: string | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const { boards, activeBoardId } = JSON.parse(raw) as { boards: Board[]; activeBoardId: string };
          const filtered = (Array.isArray(boards) ? boards : []).filter((b) => !b.serverId);
          if (filtered.length > 0) {
            personalBoards = filtered;
            safeId = filtered.find((b) => b.id === activeBoardId)?.id ?? filtered[0].id;
          }
        }
      } catch (err) {
        console.error("[Crecoard] Failed to load personal boards — data may be corrupt. Starting fresh.", err);
        localStorage.removeItem(key);
      }

      // M10: do NOT read plancraft-server-boards-v1 — serverBoards is populated
      // exclusively by injectServerBoards; reading from localStorage would overwrite it.

      // L1: combine into a single atomic set() call
      if (personalBoards !== null && safeId !== null) {
        // Seed sample content into the first board if it has no boxes yet (one-time only)
        if (personalBoards[0].boxes.length === 0 && !localStorage.getItem("plancraft-sample-seeded")) {
          personalBoards[0].boxes = makeSampleBoxes(personalBoards[0].id);
          localStorage.setItem("plancraft-sample-seeded", "1");
        }
        const _boards = personalBoards;
        const _safeId = safeId;
        set((s) => { s.boards = _boards; s.activeBoardId = _safeId; s.boardsHydrated = true; });
      } else {
        // Nothing stored (or corrupt) — the in-memory default is now the real
        // state for this key, so persisting is safe from here on.
        set((s) => { s.boardsHydrated = true; });
      }
    },
  }))
);

// Apply app-level appearance on module load (client only).
// Board theme vars are scoped via inline styles on the board area div — never applied here.
if (typeof window !== "undefined") {
  const state = useBoardStore.getState();
  applyThemeVars(state.themeVars);
  applyAppFont(state.appFont);
}

// ─── Undo wiring ──────────────────────────────────────────────────────────────
// Wrap the user-driven structural actions so each snapshots the board before
// mutating. Content edits (updateItem / updateBoardItem) are deliberately NOT
// undoable: they're also written programmatically (live sessions, webhooks,
// contribution merges, heals) and text editing has native undo.
const UNDOABLE_ACTIONS = [
  "addBox", "removeBox", "updateBox", "moveBox", "resizeBox", "updateBoxStyle",
  "duplicateBox", "pasteBox", "createDeck", "addToDeck",
  "addItem", "removeItem",
  "addBoardItem", "removeBoardItem", "moveBoardItem", "resizeBoardItem", "duplicateBoardItem",
] as const;
{
  const base = useBoardStore.getState();
  const wrapped: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of UNDOABLE_ACTIONS) {
    const fn = base[name] as unknown as (...args: unknown[]) => unknown;
    wrapped[name] = (...args: unknown[]) => {
      useBoardStore.getState().recordUndo(String(args[0]), name);
      return fn(...args);
    };
  }
  useBoardStore.setState(wrapped as unknown as Partial<BoardState>);
}

/** Returns the active personal board. Never returns a server board. */
export const useActiveBoard = () =>
  useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId));
