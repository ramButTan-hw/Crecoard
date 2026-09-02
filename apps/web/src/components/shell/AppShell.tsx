"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  DndContext, DragEndEvent,
  MouseSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { BottomBar } from "./BottomBar";
import { FriendsView } from "./FriendsView";
import { BoardTabs } from "./BoardTabs";
import { TopBar } from "./TopBar";
import { BoardCanvas } from "../board/BoardCanvas";
import { ItemPalette, ITEM_DEFINITIONS } from "../board/ItemPalette";
import { ExpandedBlock } from "../board/ExpandedBlock";
import { BoardItemPanel } from "../board/BoardItemPanel";
import { StylePanel } from "../box/StylePanel";
import { ServerBoardHeader } from "../server/ServerBoardHeader";
import { DmPopout } from "./DmPopout";
import { ChatDrawer } from "./ChatDrawer";
import { UsernameSetupModal } from "./UsernameSetupModal";
import { MessageSquare, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSheet } from "@/components/ui/MobileSheet";
import { useNotifications } from "@/contexts/NotificationContext";
import { SettingsPanel } from "./SettingsPanel";
import { TemplatesModal } from "./TemplatesModal";
import { ProfileModal } from "./ProfileModal";
import { SettingsModal } from "./SettingsModal";
import { UserProfileModal, type ViewableUser } from "./UserProfileModal";
import { useBoardStore, useActiveBoard } from "@/store/boardStore";
import { createSnapToGrid } from "@/lib/snapToGrid";
import { applyThemeVars, applyAppFont, CSS_VAR_NAMES, ThemeVarMap } from "@/lib/appThemes";
import { CollabContext, useCollabSessionSetup } from "@/lib/useCollabSession";
import { PlayerHost } from "@/components/player/PlayerHost";
import { CommandPalette, type PaletteCommand } from "@/components/ui/CommandPalette";
import { AppToaster, appToast } from "@/components/ui/AppToast";
import { getSelfIdentity } from "@/lib/collaboration";
import { supabase } from "@/lib/supabase";
import { playPing } from "@/lib/sound";
import { readUserPrefs } from "@/lib/userPrefs";
import { logServerAction } from "@/lib/serverAudit";
import { ServerBoardContext } from "@/contexts/ServerBoardContext";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { PresenceProvider, usePresence } from "@/contexts/PresenceContext";
import { ServersProvider, useServers } from "@/contexts/ServersContext";
import { BoardSyncProvider, useBoardSync } from "@/contexts/BoardSyncContext";
import { MessagingProvider, useMessaging } from "@/contexts/MessagingContext";
import { BoardChatProvider } from "@/contexts/BoardChatContext";
import { BoardContributionsProvider } from "@/contexts/BoardContributionsContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProfilesProvider } from "@/contexts/ProfilesContext";
import { Toaster } from "@/components/notifications/Toaster";
import { FriendsProvider } from "@/contexts/FriendsContext";
import { DesktopReminders } from "@/components/pwa/DesktopReminders";
import { FirstRunTour } from "./FirstRunTour";
import { MOCK_SERVERS, MOCK_SERVER_MEMBERS, MOCK_SERVER_BOARDS } from "@/lib/mockServerData";
import type { MemberRole } from "@/types/server";
import { useWebhookItems } from "@/hooks/useWebhookItems";

function getEventCoords(e: PointerEvent | MouseEvent | TouchEvent) {
  if ("changedTouches" in e) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// ─── Inner component: uses all contexts, contains all logic ──────────────────

function AppShellInner() {
  const [activeView, setActiveView] = useState<"board" | "server">("board");
  const [showFriends, setShowFriends] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  // boardId of the currently-active server (real or mock); avoids re-querying MOCK_SERVERS in hot paths
  const [activeServerBoardId, setActiveServerBoardId] = useState<string | null>(null);
  const [openDmIds, setOpenDmIds] = useState<string[]>([]);
  const dmInfoRef = useRef<Record<string, { username: string; online: boolean; avatarUrl?: string; userId?: string }>>({});
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const { unread } = useNotifications();
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [viewingUser, setViewingUser] = useState<ViewableUser | null>(null);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Gate localStorage-derived UI (appBg) until after mount so SSR markup and the
  // first client render match — otherwise React throws a hydration error.
  const [mounted, setMounted] = useState(false);
  // Server board context — role can be toggled in the header for preview
  const [viewerRole, setViewerRole] = useState<MemberRole>("admin");
  // Draft/Live system
  const [isDraftMode, setIsDraftMode] = useState(true);
  const [hasLiveVersion, setHasLiveVersion] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Set to true when owner/admin manually enters live preview so role-sync doesn't auto-flip them back
  const intentionalLivePreview = useRef(false);

  const { servers: realServers, serverMembers, serverRoles: savedServerRoles, loadMembers } = useServers();
  const personalBoards = useBoardStore((s) => s.boards);
  const { identity, loading: userLoading, isLoggedIn } = useUser();
  const { online: presenceMap, myStatus } = usePresence();
  const { loadServerBoard, loadLiveBoard, publishServerBoard } = useBoardSync();
  const { openConversation } = useMessaging();

  const { addItem, setDraggingBlock, activeBoardId, zoom, themeVars, appFont, appBg, persistBoards, hydrateBoards, hydrateUserTheme, setCurrentUserId, addBoardItem, injectServerBoards, setActiveBoard } = useBoardStore();

  // Cross-board chat links: if a box link targets a different personal board,
  // switch to it first, then re-fire so the canvas focuses the box.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { boardId?: string; boxId?: string } | undefined;
      if (!detail?.boxId || !detail.boardId || detail.boardId === activeBoardId) return;
      const isPersonal = useBoardStore.getState().boards.some((b) => b.id === detail.boardId);
      if (!isPersonal) return;
      if (activeView === "server") { setActiveServerId(null); setActiveServerBoardId(null); setActiveView("board"); }
      setActiveBoard(detail.boardId);
      const boxId = detail.boxId;
      setTimeout(() => window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boxId } })), 90);
    };
    window.addEventListener("crecoard:focus-box", handler);
    return () => window.removeEventListener("crecoard:focus-box", handler);
  }, [activeBoardId, activeView, setActiveBoard]);

  // Global undo/redo: ⌘Z / ⇧⌘Z (Ctrl on Windows, Ctrl+Y redo alias).
  // Skipped while typing — inputs and rich text keep their native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const st = useBoardStore.getState();
      if (key === "y" || (key === "z" && e.shiftKey)) st.redo();
      else st.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One keyboard grammar for boxes and board items: Delete removes, ⌘D
  // duplicates, arrows nudge (⇧ = 10px), Escape clears selection. All the
  // mutations route through undoable store actions, so ⌘Z reverses them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const st = useBoardStore.getState();
      if (st.expandedBoxId) return; // expanded view has its own editing context
      if (activeView === "server" && (!isDraftMode || (viewerRole !== "owner" && viewerRole !== "admin"))) return;
      const itemId = st.selectedBoardItemId;
      const boxId = st.selectedBoxId;
      if (e.key === "Escape") {
        if (itemId) st.selectBoardItem(null);
        if (boxId) st.selectBox(null);
        return;
      }
      if (!itemId && !boxId) return;
      const boardId = (activeView === "server" && activeServerId)
        ? (activeServerBoardId ?? st.activeBoardId)
        : st.activeBoardId;
      const board = st.boards.find((b) => b.id === boardId) ?? st.serverBoards[boardId];
      if (!board) return;
      const mod = e.metaKey || e.ctrlKey;

      if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        e.preventDefault();
        if (itemId) { st.removeBoardItem(boardId, itemId); st.selectBoardItem(null); }
        else if (boxId) { st.removeBox(boardId, boxId); st.selectBox(null); }
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (itemId) st.duplicateBoardItem(boardId, itemId);
        else if (boxId) st.duplicateBox(boardId, boxId);
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && !mod) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        if (itemId) {
          const it = board.boardItems?.find((i) => i.id === itemId);
          if (it && !it.locked) st.moveBoardItem(boardId, itemId, Math.max(0, it.boardX + dx), Math.max(0, it.boardY + dy));
        } else if (boxId) {
          const bx = board.boxes.find((b) => b.id === boxId);
          if (bx && !bx.locked) st.moveBox(boardId, boxId, Math.max(0, bx.x + dx), Math.max(0, bx.y + dy));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeView, activeServerId, activeServerBoardId, isDraftMode, viewerRole]);

  // Empty-board CTA → templates modal
  useEffect(() => {
    const handler = () => setShowTemplates(true);
    window.addEventListener("crecoard:open-templates", handler);
    return () => window.removeEventListener("crecoard:open-templates", handler);
  }, []);

  // ⌘K command palette · ⌘, settings (both promised by the keybindings list)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setShowUserSettings(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const canAddItems = activeView !== "server" || (isDraftMode && (viewerRole === "owner" || viewerRole === "admin"));
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [];
    if (canAddItems) {
      for (const def of ITEM_DEFINITIONS) {
        if (def.serverOnly && activeView !== "server") continue;
        cmds.push({ id: `add-${def.type}`, label: `Add ${def.label}`, section: "Add to board", keywords: def.description, icon: def.icon, run: () => addItemAtCenter(def) });
      }
    }
    for (const b of personalBoards) {
      cmds.push({
        id: `board-${b.id}`, label: b.name || "Untitled board", section: "Boards", keywords: "switch open board",
        run: () => { setActiveServerId(null); setActiveServerBoardId(null); setActiveView("board"); setActiveBoard(b.id); },
      });
    }
    for (const sv of realServers) {
      cmds.push({ id: `server-${sv.id}`, label: sv.name, section: "Servers", keywords: "switch open server", run: () => handleServerSelect(sv.id) });
    }
    cmds.push(
      { id: "toggle-grid", label: "Toggle grid & snapping", section: "View", keywords: "grid snap magnetic dots", run: () => { useBoardStore.getState().toggleGrid(); appToast(useBoardStore.getState().showGrid ? "Grid & snapping on" : "Grid & snapping off"); } },
      { id: "fit", label: "Fit content to view", section: "View", keywords: "zoom fit center camera", run: () => window.dispatchEvent(new CustomEvent("plancraft:fit-board")) },
      { id: "zoom-100", label: "Zoom to 100%", section: "View", keywords: "reset zoom", run: () => useBoardStore.getState().setZoom(1) },
      { id: "undo", label: "Undo", section: "Edit", hint: "\u2318Z", run: () => useBoardStore.getState().undo() },
      { id: "redo", label: "Redo", section: "Edit", hint: "\u21e7\u2318Z", run: () => useBoardStore.getState().redo() },
      { id: "friends", label: showFriends ? "Hide friends" : "Show friends", section: "App", keywords: "dm people", run: () => setShowFriends((v) => !v) },
      { id: "templates", label: "Templates", section: "App", run: () => setShowTemplates(true) },
      { id: "profile", label: "Edit profile", section: "App", run: () => setShowProfile(true) },
      { id: "settings", label: "Settings", section: "App", run: () => setShowUserSettings(true) },
    );
    return cmds;
    // handleServerSelect/addItemAtCenter are stable enough for palette purposes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAddItems, activeView, personalBoards, realServers, showFriends]);
  const selectedBoardItemId = useBoardStore((s) => s.selectedBoardItemId);
  const boardThemeVars = useBoardStore((s) => {
    if (activeView === "server" && activeServerBoardId) {
      return s.serverBoards[activeServerBoardId]?.boardThemeVars;
    }
    return s.boards.find((b) => b.id === s.activeBoardId)?.boardThemeVars;
  });
  const selectedBoxId = useBoardStore((s) => s.selectedBoxId);
  const expandedBoxId = useBoardStore((s) => s.expandedBoxId);
  const showGrid = useBoardStore((s) => s.showGrid);
  const board = useActiveBoard();
  const isFinished = board?.isFinished ?? false;

  // ── Mobile shell: side panels become bottom sheets; palette opens from a FAB ──
  const isMobile = useIsMobile();
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [bottomMenuOpen, setBottomMenuOpen] = useState(false); // BottomBar profile popup / server grid
  // Mobile: board-item settings sheet opens via an explicit gear (event), not on
  // selection — so moving/resizing an item doesn't pop its settings.
  const [mobileItemSettingsOpen, setMobileItemSettingsOpen] = useState(false);
  useEffect(() => {
    const open = () => setMobileItemSettingsOpen(true);
    window.addEventListener("crecoard:open-item-settings", open);
    return () => window.removeEventListener("crecoard:open-item-settings", open);
  }, []);
  useEffect(() => { if (!selectedBoardItemId) setMobileItemSettingsOpen(false); }, [selectedBoardItemId]);
  // Whether the canvas accepts edits in the current view (gates palette/panels).
  const canvasEditable = activeView === "board"
    ? !isFinished
    : (isDraftMode && (viewerRole === "owner" || viewerRole === "admin"));

  // Tap-to-add (mobile): place a board-level item at the visible canvas centre.
  const addItemAtCenter = useCallback((def: (typeof ITEM_DEFINITIONS)[number]) => {
    const state = useBoardStore.getState();
    const boardId = activeView === "server" && activeServerId
      ? (activeServerBoardId ?? activeBoardId)
      : activeBoardId;
    if (!boardId) return;
    const scrollEl = (document.querySelector("[data-board-canvas]") as HTMLElement | null)?.parentElement;
    const rect = scrollEl?.getBoundingClientRect();
    const sizes: Record<string, [number, number]> = {
      text: [280, 120], list: [280, 200], timer: [200, 200], graph: [360, 260],
      table: [500, 300], calendar: [400, 340], image: [280, 200], embed: [360, 260],
      widget: [360, 260], api: [280, 180], playlist: [280, 300], chat: [320, 420],
      suggestion: [320, 320], guestbook: [320, 340], poll: [320, 280], twitch: [320, 300],
    };
    const [w, h] = sizes[def.type] ?? [280, 200];
    const snap = (v: number) => Math.round(v / 20) * 20;
    let boardX = 40, boardY = 40;
    if (rect) {
      const cx = (rect.width / 2 - state.panOffset.x) / state.zoom;
      const cy = (rect.height / 2 - state.panOffset.y) / state.zoom;
      boardX = Math.max(0, snap(cx - w / 2));
      boardY = Math.max(0, snap(cy - h / 2));
    }
    const boardItem = { ...def.defaultItem(), id: nanoid(), showInCollapsed: false as const, boardX, boardY, boardW: w, boardH: h };
    state.addBoardItem(boardId, boardItem);
    collabRef.current?.broadcastOp?.({ op: "addBoardItem", boardId, item: boardItem });
    setMobilePaletteOpen(false);
  }, [activeView, activeServerId, activeServerBoardId, activeBoardId]);

  const webhookBoardId = activeView === "server" && activeServerId
    ? (realServers.find((s) => s.id === activeServerId) ?? MOCK_SERVERS.find((s) => s.id === activeServerId))?.boardId ?? null
    : activeBoardId ?? null;
  useWebhookItems(webhookBoardId);

  // Boards shared with this user are always live so their edits sync back.
  const isSharedBoard = useBoardStore((s) => s.sharedBoardIds.includes(activeBoardId));
  const collabSession = useCollabSessionSetup(activeBoardId, (board?.collabEnabled ?? false) || isSharedBoard);
  const collabRef = useRef(collabSession);
  useEffect(() => { collabRef.current = collabSession; }, [collabSession]);

  const supabaseActive =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL!.includes("placeholder") &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL!.includes("your-project");

  // Re-apply app theme vars and font on mount (SSR → client hydration).
  // Skip localStorage board hydration when Supabase is configured — BoardSyncContext
  // loads boards once auth resolves (Supabase for logged-in users, the unscoped
  // localStorage key for guests). persistBoards stays a no-op until either source
  // loads, so the boot default can never overwrite stored boards.
  useEffect(() => {
    applyThemeVars(themeVars);
    applyAppFont(appFont);
    if (!supabaseActive) {
      hydrateBoards();
      injectServerBoards(MOCK_SERVER_BOARDS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once Supabase confirms who the user is, scope theme storage to their account.
  // We wait for userLoading=false so we never act on the initial guest identity.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (userLoading) return; // Supabase hasn't resolved yet
    const uid = identity.userId;
    if (!uid || uid === prevUserIdRef.current) return;
    prevUserIdRef.current = uid;
    if (supabaseActive && isLoggedIn) {
      setCurrentUserId(uid);
      hydrateUserTheme(uid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.userId, userLoading, isLoggedIn]);

  // If the active server disappears from the member list (leave/kick/delete), go back to board view.
  useEffect(() => {
    if (activeView !== "server" || !activeServerId) return;
    const isMock = MOCK_SERVERS.some((s) => s.id === activeServerId);
    if (!isMock && !realServers.some((s) => s.id === activeServerId)) {
      handleLeaveServer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realServers, activeServerId, activeView]);

  // Sync viewerRole from real membership whenever members load for the active server.
  // Also switches to the correct draft/live view for the confirmed role.
  useEffect(() => {
    if (!activeServerId || activeView !== "server") return;
    const myMembership = (serverMembers[activeServerId] ?? []).find((m) => m.userId === identity.userId);
    if (!myMembership) return;
    const newRole = myMembership.role;
    setViewerRole(newRole);
    const server = realServers.find((s) => s.id === activeServerId);
    if (!server) return;
    if (newRole === "member") {
      // Members always see the live board
      setIsDraftMode(false);
      setActiveServerBoardId(server.boardId + ":live");
    } else if (!intentionalLivePreview.current) {
      // Owners/admins default to draft unless they intentionally entered live preview
      setIsDraftMode(true);
      setActiveServerBoardId(server.boardId);
    }
  }, [serverMembers, activeServerId, activeView, identity.userId, realServers]);

  // While in a server, apply the server board's theme to the document root so the
  // entire UI (sidebar, header, bottom bar) adopts the server's colour scheme.
  // When leaving, restore the user's personal theme.
  useEffect(() => {
    if (activeView === "server") {
      // Apply server board theme if available; fall back to personal theme so
      // stale colors from a previous board never persist (Bug M16/M17).
      applyThemeVars(boardThemeVars ?? themeVars);
    } else {
      // Always reset document root to the global personal theme when not in server
      // view. This ensures per-board CSS vars set by a previous server theme never
      // leak into the shell chrome (Bug M18).
      applyThemeVars(themeVars);
    }
  }, [activeView, boardThemeVars, themeVars]);

  useEffect(() => {
    setIsDesktopApp(!!window.electron);
    setMounted(true);
  }, []);

  // Escape key: close friends / settings / templates overlays
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Friends #11 — Escape closes friends modal first
      if (showFriends) { setShowFriends(false); return; }
      if (showProfile) { setShowProfile(false); return; }
      if (showUserSettings) { setShowUserSettings(false); return; }
      if (showTemplates) { setShowTemplates(false); return; }
      if (showSettings) { setShowSettings(false); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showFriends, showSettings, showTemplates, showProfile, showUserSettings]);

  // Storage-quota error notification (fired by persistBoards)
  useEffect(() => {
    const handler = () => setStorageError(true);
    window.addEventListener("plancraft:storage-error", handler as EventListener);
    return () => window.removeEventListener("plancraft:storage-error", handler as EventListener);
  }, []);

  // Debounced board persistence — saves all board data to localStorage on change
  useEffect(() => {
    const id = setTimeout(() => persistBoards(), 800);
    return () => clearTimeout(id);
  });

  // Build inline CSS var object for the board area — scopes board theme to that div only
  const boardAreaCssVars = boardThemeVars
    ? (Object.fromEntries(
        (Object.entries(CSS_VAR_NAMES) as [keyof ThemeVarMap, string][]).map(
          ([key, cssVar]) => [cssVar, boardThemeVars[key]]
        )
      ) as React.CSSProperties)
    : {};

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);
  // Block dragging is pointer-based inside BoardBox now (same as board-level
  // items) — dnd-kit only handles palette "new-item" drags, so the modifier
  // only needs plain magnetic-grid snapping.
  const snapToGrid = useMemo(() => createSnapToGrid(zoom, showGrid), [zoom, showGrid]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    // Block all edits in live preview and for members
    if (activeView === "server" && (!isDraftMode || (viewerRole !== "owner" && viewerRole !== "admin"))) {
      setDraggingBlock(null);
      return;
    }
    const data = e.active.data.current;
    const state = useBoardStore.getState();
    // Resolve the correct board for the current view — server boards have their own ID
    const boardId = (activeView === "server" && activeServerId)
      ? activeServerBoardId ?? state.activeBoardId
      : state.activeBoardId;

    if (data?.kind === "new-item") {
      const overId = e.over?.id as string | undefined;
      const boxId = overId?.startsWith("drop-") ? overId.slice(5) : overId;
      const b = state.boards.find((bd) => bd.id === boardId) ?? state.serverBoards[boardId];
      if (boxId && b?.boxes.some((bx) => bx.id === boxId)) {
        const box = b.boxes.find((bx) => bx.id === boxId)!;
        const itemId = nanoid();
        const item = { ...data.defaultItem(), id: itemId, showInCollapsed: !box.isExpanded };
        state.addItem(boardId, boxId, item);
        collabRef.current.broadcastOp({ op: "addItem", boardId, boxId, item });
      } else {
        const canvasEl = document.querySelector("[data-board-canvas]") as HTMLElement | null;
        const scrollEl = canvasEl?.parentElement;
        if (canvasEl && scrollEl) {
          const activator = e.activatorEvent as MouseEvent | PointerEvent | TouchEvent;
          const { x: activatorX, y: activatorY } = getEventCoords(activator);
          const finalX = activatorX + e.delta.x;
          const finalY = activatorY + e.delta.y;
          const scrollRect = scrollEl.getBoundingClientRect();
          const canvasX = (finalX - scrollRect.left - state.panOffset.x) / state.zoom;
          const canvasY = (finalY - scrollRect.top - state.panOffset.y) / state.zoom;
          const snapV = (v: number) => Math.round(v / 20) * 20;
          const defaultSizes: Partial<Record<string, [number, number]>> = {
            text: [280, 120], list: [280, 200], timer: [200, 200],
            graph: [360, 260], table: [500, 300], calendar: [400, 340],
            image: [280, 200], embed: [360, 260], widget: [360, 260],
            api: [280, 180], variable: [200, 80], playlist: [280, 300],
            chat: [320, 420],
          };
          const [itemW, itemH] = defaultSizes[data.itemType as string] ?? [280, 200];
          const boardItemId = nanoid();
          const boardItem = {
            ...data.defaultItem(),
            id: boardItemId,
            showInCollapsed: false as const,
            boardX: Math.max(0, snapV(canvasX - itemW / 2)),
            boardY: Math.max(0, snapV(canvasY - itemH / 2)),
            boardW: itemW,
            boardH: itemH,
          };
          state.addBoardItem(boardId, boardItem);
          collabRef.current.broadcastOp({ op: "addBoardItem", boardId, item: boardItem });
          if (activeServerId) {
            const ident = getSelfIdentity();
            void logServerAction(activeServerId, ident.userId, ident.displayName ?? "Unknown", "board_item_added", { itemType: data.itemType as string });
          }
        }
      }
    }

    // Catch-all: always clear draggingBlockId regardless of data.kind so the
    // store never gets stuck with a stale dragging block reference (Bug M9).
    setDraggingBlock(null);
  }, [activeView, activeServerId, activeServerBoardId, isDraftMode, viewerRole, setDraggingBlock]);

  const handleServerSelect = (serverId: string) => {
    const realServer = realServers.find((s) => s.id === serverId);
    const mockServer = MOCK_SERVERS.find((s) => s.id === serverId);
    const server = realServer ?? mockServer;
    if (!server) return;

    // Reset draft/live state when switching servers
    intentionalLivePreview.current = false;
    setIsDraftMode(true);
    setHasLiveVersion(false);

    // Track boardId so drag handlers and theme resolution don't re-query the lists
    setActiveServerBoardId(server.boardId);

    if (realServer) {
      // Inject a stub board immediately so the canvas renders without waiting for Supabase
      const state = useBoardStore.getState();
      if (!state.serverBoards[realServer.boardId]) {
        injectServerBoards([{
          id: realServer.boardId,
          name: realServer.name,
          isPublic: realServer.isPublic,
          isFinished: false,
          backgroundColor: "#131417",
          serverId: realServer.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          boxes: [],
        }]);
      }
      // Load draft and live board in parallel, then seed draft from live if draft is empty
      void (async () => {
        const [, hasLive] = await Promise.all([
          loadServerBoard(realServer.boardId, realServer.id),
          loadLiveBoard(realServer.boardId, realServer.id),
        ]);
        setHasLiveVersion(hasLive);
        if (hasLive) {
          const s = useBoardStore.getState();
          const draft = s.serverBoards[realServer.boardId];
          const live  = s.serverBoards[realServer.boardId + ":live"];
          if (live && !draft?.boxes?.length && !draft?.boardItems?.length) {
            useBoardStore.setState((st) => ({
              serverBoards: {
                ...st.serverBoards,
                [realServer.boardId]: {
                  ...live,
                  id: realServer.boardId,
                  boxes: (live.boxes ?? []).map((b) => ({ ...b })),
                  boardItems: (live.boardItems ?? []).map((i) => ({ ...i })),
                },
              },
            }));
          }
        }
      })();
      void loadMembers(serverId);
    }

    // Only reset the viewer role when actually switching to a different server
    if (serverId !== activeServerId) {
      if (realServer) {
        const myMembership = (serverMembers[serverId] ?? []).find((m) => m.userId === identity.userId);
        const tentativeRole = myMembership?.role ?? "member";
        setViewerRole(tentativeRole);
        // Members always start in live view
        if (tentativeRole === "member") {
          setIsDraftMode(false);
          setActiveServerBoardId(server.boardId + ":live");
        }
      } else {
        const myMembership = MOCK_SERVER_MEMBERS[serverId]?.find((m) => m.userId === "local-user");
        setViewerRole(myMembership?.role ?? "member");
      }
    }

    setActiveServerId(serverId);
    setActiveView("server");
    const serverBoardVars = useBoardStore.getState().serverBoards[server.boardId]?.boardThemeVars;
    applyThemeVars(serverBoardVars ?? themeVars);
    // Only auto-fit the first time this server board is opened; afterwards the
    // canvas restores the saved zoom/pan (preserve zoom across personal↔server).
    if (!useBoardStore.getState().boardViews[server.boardId]) {
      setTimeout(() => window.dispatchEvent(new CustomEvent("plancraft:fit-board")), 0);
    }
  };

  const handleLeaveServer = () => {
    setActiveView("board");
    setActiveServerId(null);
    setActiveServerBoardId(null);
    intentionalLivePreview.current = false;
    applyThemeVars(themeVars); // Restore personal theme immediately
  };

  const handleToggleMode = () => {
    if (!activeServerId) return;
    const server = realServers.find((s) => s.id === activeServerId);
    if (!server) return;
    if (isDraftMode) {
      intentionalLivePreview.current = true;
      setIsDraftMode(false);
      setActiveServerBoardId(server.boardId + ":live");
    } else {
      intentionalLivePreview.current = false;
      setIsDraftMode(true);
      setActiveServerBoardId(server.boardId);
    }
  };

  const handleConfirmPublish = async () => {
    if (!activeServerId) return;
    const server = realServers.find((s) => s.id === activeServerId);
    if (!server) return;
    setIsPublishing(true);
    setPublishError(null);
    const result = await publishServerBoard(
      server.boardId,
      server.id,
      identity.userId,
      identity.displayName ?? "Unknown",
      publishMessage.trim() || undefined,
    );
    if (result.success) {
      setHasLiveVersion(true);
      setPublishMessage("");
      setPublishModalOpen(false);
      setPublishError(null);
      appToast("Published to the live board", "success");
    } else {
      appToast("Publish failed", "error");
      setPublishError(
        result.error === "migration_missing"
          ? "Run 20260629000002_server_publishes.sql in your Supabase SQL editor first."
          : (result.error ?? "Publish failed"),
      );
    }
    setIsPublishing(false);
  };

  const handleViewChange = (v: "board" | "server") => {
    if (v === "board" && activeView === "server") {
      setActiveServerId(null);
      setActiveServerBoardId(null);
      applyThemeVars(themeVars); // Restore personal theme immediately
    }
    setActiveView(v);
  };

  const handleDmSelect = (dmId: string, username?: string, online?: boolean, avatarUrl?: string, userId?: string) => {
    if (username) dmInfoRef.current[dmId] = { username, online: online ?? false, avatarUrl, userId };
    setOpenDmIds((prev) => prev.includes(dmId) ? prev : [...prev, dmId]);
  };

  // ── Global DM notifications ────────────────────────────────────────────────
  // Messages in conversations WITHOUT an open popout used to arrive silently —
  // the per-popout Realtime subscription only exists while a popout is open.
  // One RLS-scoped subscription (dm_messages RLS = participants only, so this
  // client only ever receives its own conversations) toasts + pings for them,
  // gated by Settings → Notifications → "Direct messages".
  const openDmIdsRef = useRef(openDmIds);
  useEffect(() => { openDmIdsRef.current = openDmIds; }, [openDmIds]);
  useEffect(() => {
    if (!supabaseActive || !isLoggedIn || !identity.userId) return;
    const uid = identity.userId;
    const ch = supabase
      .channel("dm-notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          if ((row.author_id as string) === uid) return;
          const convId = row.conversation_id as string;
          if (openDmIdsRef.current.includes(convId)) return; // popout already shows it live
          if (!readUserPrefs().notifyDMs) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", row.author_id as string)
            .maybeSingle();
          const name = (profile?.display_name as string) || "Someone";
          const preview =
            ((row.content as string) || (row.gif_url ? "sent a GIF" : row.image_url ? "sent an image" : "sent a message")).slice(0, 80);
          playPing("message");
          appToast(`💬 ${name}: ${preview}`);
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseActive, isLoggedIn, identity.userId]);


  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden pt-safe" style={{ background: "var(--surface)" }}>
      {/* App background layer */}
      {mounted && appBg.image && (
        <>
          <div
            aria-hidden
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              backgroundImage: `url(${appBg.image})`,
              backgroundSize: appBg.size,
              backgroundPosition: "center",
              backgroundRepeat: appBg.size === "auto" ? "no-repeat" : undefined,
              opacity: appBg.opacity,
              filter: appBg.filter || undefined,
              pointerEvents: "none",
            }}
          />
          {appBg.overlayOpacity > 0 && (
            <div
              aria-hidden
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                backgroundColor: appBg.overlayColor,
                opacity: appBg.overlayOpacity,
                pointerEvents: "none",
              }}
            />
          )}
        </>
      )}

      {/* Main content area — fills all space above the bottom bar */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        {/* Personal board view */}
        {activeView === "board" && (
          <CollabContext.Provider value={collabSession}>
            {/* Outer DndContext wraps BoardTabs so its inner DndContext (tab reorder)
                is nested here — dnd-kit inner contexts take priority for their own
                draggables, preventing pointer-event bleed between tab and canvas drags. */}
            <DndContext id="dnd-board-canvas" sensors={sensors} modifiers={[snapToGrid]} onDragEnd={handleDragEnd}>
              <div className="flex flex-1 flex-col overflow-hidden" style={boardAreaCssVars}>
                <TopBar />
                <BoardTabs />
                <div className="flex flex-1 overflow-hidden">
                  {!isMobile && <ItemPalette onPick={addItemAtCenter} desktop />}
                  <BoardCanvas />
                  {!isMobile && selectedBoxId && !isFinished && !expandedBoxId && !selectedBoardItemId && <StylePanel boxId={selectedBoxId} />}
                  {!isMobile && selectedBoardItemId && !isFinished && !expandedBoxId && <BoardItemPanel />}
                </div>
              </div>
            </DndContext>
            <FirstRunTour />
          </CollabContext.Provider>
        )}

        {/* Server board view — the server IS the board */}
        {activeView === "server" && activeServerId && (() => {
          const realServer = realServers.find((s) => s.id === activeServerId);
          const mockServer = MOCK_SERVERS.find((s) => s.id === activeServerId);
          const server = realServer ?? mockServer;
          if (!server) return null;
          const rawMembers = realServer
            ? (serverMembers[activeServerId] ?? [])
            : (MOCK_SERVER_MEMBERS[activeServerId] ?? []);
          // Overlay live presence for real servers (mock servers keep demo flags).
          const members = realServer
            ? rawMembers.map((m) => {
                const presence = m.userId === identity.userId ? myStatus : (presenceMap[m.userId] ?? "offline");
                return { ...m, presence, online: presence !== "offline" };
              })
            : rawMembers;
          const onlineCount = members.filter((m) => m.online).length;
          const isRealServer = !!realServer;
          const canEdit = viewerRole === "owner" || viewerRole === "admin";
          const serverRoles = savedServerRoles[activeServerId] ?? server.roles ?? [];
          const everyoneRoleId = serverRoles.find((r) => r.isDefault)?.id;
          const myMember = members.find((m) => m.userId === (realServer ? identity.userId : "local-user"));
          const viewerRoleIds = [
            ...(myMember?.roleIds ?? []),
            ...(everyoneRoleId ? [everyoneRoleId] : []),
          ];
          return (
            <ServerBoardContext.Provider key={activeServerId} value={{
              serverId: activeServerId,
              boardId: server.boardId,
              serverName: server.name,
              viewerRole,
              viewerRoleIds,
              serverRoles,
              viewerId: realServer ? identity.userId : "local-user",
              members,
              isDraftMode,
              hasLiveVersion,
              onToggleMode: isRealServer ? handleToggleMode : () => {},
              onPublish: isRealServer ? () => setPublishModalOpen(true) : () => {},
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <ServerBoardHeader
                  serverId={activeServerId}
                  serverName={server.name}
                  serverIcon={server.icon}
                  description={server.description}
                  memberCount={server.memberCount}
                  onlineCount={onlineCount}
                  viewerRole={viewerRole}
                  members={members}
                  showMembers={showMembers}
                  onToggleMembers={() => setShowMembers((v) => !v)}
                  onViewProfile={(u) => setViewingUser(u)}
                />
                <CollabContext.Provider value={collabSession}>
                  <DndContext id="dnd-server-canvas" sensors={sensors} modifiers={[snapToGrid]} onDragEnd={handleDragEnd}>
                    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
                      {!isMobile && isDraftMode && canEdit && <ItemPalette onPick={addItemAtCenter} desktop />}
                      <BoardCanvas />
                      {!isMobile && selectedBoxId && !expandedBoxId && !selectedBoardItemId && isDraftMode && canEdit && <StylePanel boxId={selectedBoxId} />}
                      {!isMobile && selectedBoardItemId && !expandedBoxId && isDraftMode && canEdit && <BoardItemPanel />}
                      {!isDraftMode && !hasLiveVersion && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
                          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Nothing published yet.</p>
                          {canEdit && (
                            <p style={{ color: "var(--text-muted)", fontSize: 12, opacity: 0.6 }}>Publish the draft to make it visible to members.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </DndContext>
                </CollabContext.Provider>
              </div>
              {expandedBoxId && <ExpandedBlock boxId={expandedBoxId} />}
            </ServerBoardContext.Provider>
          );
        })()}

      </div>

      {/* Friends popup */}
      {showFriends && (
        <>
          {/* Friends #1 — backdrop fade-in; Friends #2 — backdrop click closes */}
          <div
            className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={() => setShowFriends(false)}
          />
          {/* Friends #1 — modal entry animation; Friends #2 — viewport overflow guard */}
          <div
            className="fixed z-[999] w-[min(520px,calc(100vw-24px))] max-h-[min(600px,calc(100vh-120px))] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in-0 duration-150"
            style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          >
            <FriendsView
              onDmSelect={(id, username, online, avatarUrl, userId) => { handleDmSelect(id, username, online, avatarUrl, userId); setShowFriends(false); }}
              onClose={() => setShowFriends(false)}
              onViewProfile={(u) => setViewingUser(u)}
            />
          </div>
        </>
      )}

      {/* Required username gate (logged-in users without a handle) */}
      {isLoggedIn && !userLoading && !identity.username && <UsernameSetupModal />}

      {/* Chat drawer + edge toggle (per-board channels) */}
      {(() => {
        const cbid = ((activeView === "server" && activeServerId ? (activeServerBoardId ?? activeBoardId) : activeBoardId) ?? "").replace(/:live$/, "");
        if (!cbid) return null;
        const totalUnread = Object.entries(unread).reduce((sum, [k, v]) => (k.startsWith(cbid + "::") ? sum + v : sum), 0);
        return (
          <>
            {!showChatDrawer && !expandedBoxId && (
              <button
                onClick={() => setShowChatDrawer(true)}
                title="Chat"
                className="fixed right-0 top-1/2 z-[1090] flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl border border-r-0 border-[var(--border)] px-2.5 py-2 shadow-lg transition-colors hover:text-[var(--accent)]"
                style={{ background: "var(--surface-raised)" }}
              >
                <MessageSquare size={16} className="text-[var(--text-secondary)]" />
                {totalUnread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </button>
            )}
            {showChatDrawer && <ChatDrawer boardId={cbid} onClose={() => setShowChatDrawer(false)} />}
          </>
        );
      })()}

      {/* DM popout modals */}
      {openDmIds.map((dmId, idx) => (
        <DmPopout
          key={dmId}
          dmId={dmId}
          username={dmInfoRef.current[dmId]?.username ?? dmId}
          online={dmInfoRef.current[dmId]?.online ?? false}
          avatarUrl={dmInfoRef.current[dmId]?.avatarUrl}
          peerUserId={dmInfoRef.current[dmId]?.userId}
          index={idx}
          onClose={() => setOpenDmIds((prev) => prev.filter((id) => id !== dmId))}
        />
      ))}

      {/* Mobile: side panels as bottom sheets + a FAB to open the item palette */}
      {isMobile && canvasEditable && !expandedBoxId && (
        <>
          <MobileSheet
            open={!!selectedBoxId && !selectedBoardItemId}
            onClose={() => useBoardStore.getState().selectBox(null)}
            title="Block settings"
          >
            {selectedBoxId && <StylePanel boxId={selectedBoxId} />}
          </MobileSheet>
          <MobileSheet
            open={!!selectedBoardItemId && mobileItemSettingsOpen}
            onClose={() => setMobileItemSettingsOpen(false)}
            title="Item settings"
          >
            <BoardItemPanel />
          </MobileSheet>
          <MobileSheet open={mobilePaletteOpen} onClose={() => setMobilePaletteOpen(false)} title="Add item">
            <ItemPalette onPick={addItemAtCenter} />
          </MobileSheet>
          {!selectedBoxId && !selectedBoardItemId && !mobilePaletteOpen && !bottomMenuOpen && (
            <button
              onClick={() => setMobilePaletteOpen(true)}
              aria-label="Add item"
              className="fixed right-4 z-[900] flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg transition-transform active:scale-95"
              style={{ bottom: "calc(52px + env(safe-area-inset-bottom) + 14px)" }}
            >
              <Plus size={22} />
            </button>
          )}
        </>
      )}

      {/* Bottom navigation bar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <BottomBar
          activeView={activeView}
          activeServerId={activeServerId}
          showFriends={showFriends}
          onViewChange={handleViewChange}
          onFriendsToggle={() => setShowFriends((v) => !v)}
          onServerSelect={handleServerSelect}
          onSettingsOpen={() => setShowUserSettings(true)}
          onTemplatesOpen={() => setShowTemplates(true)}
          onProfileOpen={() => setShowProfile(true)}
          onMenuStateChange={setBottomMenuOpen}
        />
      </div>

      {/* Global media host — owns the playlist <iframe>/<audio> so music survives board switches */}
      <PlayerHost />
      <AppToaster />
      {cmdOpen && <CommandPalette commands={paletteCommands} onClose={() => setCmdOpen(false)} />}

      {storageError && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-lg border border-red-500/40 bg-[var(--surface)] px-4 py-2.5 shadow-xl text-sm text-red-400">
          <span>⚠️ Storage is full — changes may not be saved. Free up space or export your data.</span>
          <button onClick={() => setStorageError(false)} className="ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs transition-colors">Dismiss</button>
        </div>
      )}

      {expandedBoxId && activeView === "board" && <ExpandedBlock boxId={expandedBoxId} />}
      {/* Server view ExpandedBlock is rendered inside ServerBoardContext.Provider above */}

      {showSettings && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setShowSettings(false)} />
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </>
      )}

      {showTemplates && (
        <TemplatesModal onClose={() => setShowTemplates(false)} />
      )}

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {viewingUser && (
        <UserProfileModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onDm={
        viewingUser.dmId
          ? () => { handleDmSelect(viewingUser.dmId!, viewingUser.displayName, viewingUser.online, viewingUser.avatarUrl, viewingUser.userId); setViewingUser(null); setShowFriends(false); }
          : viewingUser.userId && viewingUser.userId !== identity.userId
          ? async () => {
              const convId = await openConversation(viewingUser.userId!);
              if (convId) { handleDmSelect(convId, viewingUser.displayName, viewingUser.online, viewingUser.avatarUrl, viewingUser.userId); setViewingUser(null); }
            }
          : undefined
      }
        />
      )}

      {showUserSettings && (
        <SettingsModal onClose={() => setShowUserSettings(false)} />
      )}

      {/* Publish modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-[min(420px,calc(100vw-32px))] rounded-2xl border border-[var(--border)] shadow-2xl p-6"
            style={{ background: "var(--surface-raised)" }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Publish Board</h3>
            <p className="mb-5 text-xs text-[var(--text-muted)]">
              Make the current draft visible to all server members.
            </p>
            <textarea
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors mb-4"
              rows={3}
              placeholder="Describe what changed… (optional)"
              value={publishMessage}
              onChange={(e) => setPublishMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleConfirmPublish(); }}
              autoFocus
            />
            {publishError && (
              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 leading-relaxed">
                {publishError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setPublishModalOpen(false); setPublishMessage(""); setPublishError(null); }}
                className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmPublish()}
                disabled={isPublishing}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {isPublishing ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Outer shell: provides all contexts ──────────────────────────────────────

export function AppShell() {
  return (
    <UserProvider>
      <PresenceProvider>
       <ServersProvider>
        <BoardSyncProvider>
          <MessagingProvider>
            <NotificationProvider>
              <ProfilesProvider>
                <BoardChatProvider>
                  <BoardContributionsProvider>
                    <FriendsProvider>
                      <AppShellInner />
                      <DesktopReminders />
                      <Toaster />
                    </FriendsProvider>
                  </BoardContributionsProvider>
                </BoardChatProvider>
              </ProfilesProvider>
            </NotificationProvider>
          </MessagingProvider>
        </BoardSyncProvider>
       </ServersProvider>
      </PresenceProvider>
    </UserProvider>
  );
}
