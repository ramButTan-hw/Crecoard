import type { Board, Box, BlockItem, DEFAULT_BOX_STYLE } from "@/store/boardStore";
import type { Server, ServerMember, ServerRole } from "@/types/server";
import type { ThemeVarMap } from "@/lib/appThemes";

// ─── Static board IDs so BottomBar can reference them ────────────────────────
export const SERVER_BOARD_IDS = {
  s1: "server-board-design-team-v1",
  s2: "server-board-startup-hub-v1",
  s3: "server-board-dev-community-v1",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const boxStyle = {
  backgroundColor: "#1e1f24",
  wallpaperUrl: "",
  wallpaperOpacity: 1,
  borderColor: "#2e3035",
  borderWidth: 1,
  borderRadius: 12,
  borderStyle: "solid" as const,
  shadow: "sm" as const,
  fontFamily: "Inter",
  fontSize: 14,
  fontColor: "#f2f2f2",
  fontWeight: "normal" as const,
  padding: 0,
};

function makeBox(
  id: string,
  boardId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  items: Omit<BlockItem, "id">[],
  z = 1,
): Box {
  return {
    id,
    boardId,
    x,
    y,
    width: w,
    height: h,
    zIndex: z,
    locked: false,
    title,
    isExpanded: false,
    style: { ...boxStyle },
    items: items.map((it, i) => ({ ...it, id: `${id}-item-${i}` })) as BlockItem[],
  };
}

const NOW = new Date().toISOString();
function minsAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

// ─── Design Team server (s1) ──────────────────────────────────────────────────
const DESIGN_BOARD_ID = SERVER_BOARD_IDS.s1;

const designTeamBoard: Board = {
  id: DESIGN_BOARD_ID,
  name: "Design Team",
  isPublic: false,
  isFinished: false,
  backgroundColor: "#16171a",
  serverId: "s1",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  boardThemeVars: { surface: "#1a1525", surfaceRaised: "#23203a", surfaceOverlay: "#2c2947", sidebar: "#120f1c", accent: "#8b5cf6", accentHover: "#7c3aed", border: "#3d3660", textPrimary: "#f0ecff", textSecondary: "#a89bc9", textMuted: "#6b5e8c" } as ThemeVarMap,
  boxes: [
    // #general chat block
    makeBox("dt-chat-general", DESIGN_BOARD_ID, 20, 20, 380, 460, "#general", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "general",
    }], 1),

    // #feedback chat block
    makeBox("dt-chat-feedback", DESIGN_BOARD_ID, 420, 20, 380, 300, "#feedback", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "design-feedback",
    }], 2),

    // Sprint tasks table (admin-configured, members add their own rows)
    makeBox("dt-table-sprint", DESIGN_BOARD_ID, 420, 340, 380, 280, "Sprint Tasks", [{
      type: "table",
      showInCollapsed: true,
      tableTitle: "Sprint 14 · Tasks",
      tableShowTitle: true,
      tableColumns: [
        { id: "tc-task", name: "Task", type: "text", width: 200 },
        { id: "tc-owner", name: "Owner", type: "text", width: 90 },
        { id: "tc-status", name: "Status", type: "select", width: 90, options: ["To Do", "In Progress", "Done", "Blocked"] },
      ],
      tableRows: [
        { id: "tr1", cells: { "tc-task": "Finalize component tokens", "tc-owner": "alex_dev", "tc-status": "In Progress" } },
        { id: "tr2", cells: { "tc-task": "User research interviews", "tc-owner": "sarah.m", "tc-status": "Done" } },
        { id: "tr3", cells: { "tc-task": "Prototype new onboarding", "tc-owner": "riley_k", "tc-status": "To Do" } },
      ],
      tableStriped: true,
      tableMemberRows: {},
    }], 3),

    // Pomodoro timer (join-sync enabled for members)
    makeBox("dt-timer-pomodoro", DESIGN_BOARD_ID, 20, 500, 200, 200, "Focus Session", [{
      type: "timer",
      showInCollapsed: true,
      timerMode: "countdown",
      timerSeconds: 1500,
      timerLabel: "Deep Work",
      timerShowLabel: true,
      timerLabelPosition: "bottom",
      timerPomodoroEnabled: true,
      timerPomodoroWorkSecs: 1500,
      timerPomodoroBreakSecs: 300,
      timerPomodoroCyclesBeforeLongBreak: 4,
      timerCollabEnabled: true,
      timerFontSize: 36,
      timerBold: true,
      timerAccentColor: "#6366f1",
    }], 4),

    // Design assets file bank
    makeBox("dt-filebank", DESIGN_BOARD_ID, 240, 500, 340, 200, "Design Assets", [{
      type: "filebank",
      showInCollapsed: true,
      fileBankTitle: "Design Assets",
    }], 5),
  ],
};

// ─── Startup Hub server (s2) ──────────────────────────────────────────────────
const STARTUP_BOARD_ID = SERVER_BOARD_IDS.s2;

const startupHubBoard: Board = {
  id: STARTUP_BOARD_ID,
  name: "Startup Hub",
  isPublic: true,
  isFinished: false,
  backgroundColor: "#14161a",
  serverId: "s2",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  boardThemeVars: { surface: "#0f1e1a", surfaceRaised: "#1a2e28", surfaceOverlay: "#22382f", sidebar: "#0a1512", accent: "#10b981", accentHover: "#059669", border: "#2a3f38", textPrimary: "#e8f5f0", textSecondary: "#9db8b0", textMuted: "#5d7a71" } as ThemeVarMap,
  boxes: [
    makeBox("sh-chat-general", STARTUP_BOARD_ID, 20, 20, 380, 420, "#general", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "general",
    }], 1),

    makeBox("sh-filebank-pitch", STARTUP_BOARD_ID, 420, 20, 380, 280, "Pitch Materials", [{
      type: "filebank",
      showInCollapsed: true,
      fileBankTitle: "Pitch Materials",
    }], 2),

    makeBox("sh-table-investors", STARTUP_BOARD_ID, 420, 320, 380, 280, "Investor Pipeline", [{
      type: "table",
      showInCollapsed: true,
      tableTitle: "Investor Pipeline",
      tableShowTitle: true,
      tableColumns: [
        { id: "ic-name", name: "Investor", type: "text", width: 140 },
        { id: "ic-stage", name: "Stage", type: "select", width: 100, options: ["Outreach", "Meeting", "DD", "Term Sheet", "Closed", "Pass"] },
        { id: "ic-amt", name: "Target $", type: "text", width: 90 },
      ],
      tableRows: [
        { id: "ir1", cells: { "ic-name": "Sequoia Scout", "ic-stage": "Meeting", "ic-amt": "$500k" } },
        { id: "ir2", cells: { "ic-name": "YC Application", "ic-stage": "Outreach", "ic-amt": "$500k" } },
        { id: "ir3", cells: { "ic-name": "Angel Round", "ic-stage": "DD", "ic-amt": "$250k" } },
      ],
      tableStriped: true,
      tableMemberRows: {},
    }], 3),

    makeBox("sh-chat-ideas", STARTUP_BOARD_ID, 20, 460, 380, 260, "#ideas", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "ideas",
    }], 4),
  ],
};

// ─── Dev Community server (s3) ────────────────────────────────────────────────
const DEV_BOARD_ID = SERVER_BOARD_IDS.s3;

const devCommunityBoard: Board = {
  id: DEV_BOARD_ID,
  name: "Dev Community",
  isPublic: true,
  isFinished: false,
  backgroundColor: "#131417",
  serverId: "s3",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  boardThemeVars: { surface: "#0d1117", surfaceRaised: "#161b22", surfaceOverlay: "#1f2937", sidebar: "#090d13", accent: "#58a6ff", accentHover: "#388bfd", border: "#30363d", textPrimary: "#e6edf3", textSecondary: "#8b949e", textMuted: "#484f58" } as ThemeVarMap,
  boxes: [
    makeBox("dc-chat-general", DEV_BOARD_ID, 20, 20, 400, 380, "#general", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "general",
    }], 1),

    makeBox("dc-chat-help", DEV_BOARD_ID, 440, 20, 400, 380, "#help", [{
      type: "chat",
      showInCollapsed: true,
      chatChannelName: "help",
    }], 2),

    makeBox("dc-kanban", DEV_BOARD_ID, 20, 420, 820, 320, "Community Projects", [{
      type: "kanban",
      showInCollapsed: true,
      kanbanColumns: [
        { id: "k-col1", title: "Proposed", color: "#6366f1" },
        { id: "k-col2", title: "In Progress", color: "#f59e0b" },
        { id: "k-col3", title: "Shipped", color: "#10b981" },
      ],
      kanbanCards: [
        { id: "kc1", columnId: "k-col2", text: "Crecoard template library", description: "Community-contributed templates", order: 0 },
        { id: "kc2", columnId: "k-col2", text: "Mobile PWA wrapper", description: "Responsive board view for phones", order: 1 },
        { id: "kc3", columnId: "k-col1", text: "Zapier integration", description: "Trigger board actions from external apps", order: 0 },
        { id: "kc4", columnId: "k-col1", text: "AI block suggestions", description: "Natural language → block type + config", order: 1 },
        { id: "kc5", columnId: "k-col3", text: "Deck / slideshow blocks", description: "Multi-slide carousel block", order: 0 },
        { id: "kc6", columnId: "k-col3", text: "Board-level item placement", description: "Items placed directly on canvas", order: 1 },
      ],
      kanbanBgColor: "#1a1b1e",
      kanbanBgOpacity: 100,
      kanbanBorderRadius: 8,
      kanbanShowCardCount: true,
    }], 3),
  ],
};

// ─── Default roles (shared across all mock servers) ──────────────────────────
const DEFAULT_SERVER_ROLES: ServerRole[] = [
  {
    id: "role-everyone",
    name: "@everyone",
    color: "#6d6f75",
    isDefault: true,
    permissions: { canViewBoard: true, canEditBoard: false, canUploadFiles: false, canManageRoles: false, canManageMembers: false, canInviteMembers: false, canViewPublishHistory: false, canRollback: false, canManageBackups: false },
  },
  {
    id: "role-moderator",
    name: "Moderator",
    color: "#f2994a",
    permissions: { canViewBoard: true, canEditBoard: false, canUploadFiles: true, canManageRoles: false, canManageMembers: true, canInviteMembers: true, canViewPublishHistory: true, canRollback: false, canManageBackups: false },
  },
  {
    id: "role-admin",
    name: "Admin",
    color: "#d59ee8",
    permissions: { canViewBoard: true, canEditBoard: true, canUploadFiles: true, canManageRoles: true, canManageMembers: true, canInviteMembers: true, canViewPublishHistory: true, canRollback: true, canManageBackups: true },
  },
];

// ─── Exports ──────────────────────────────────────────────────────────────────
export const MOCK_SERVER_BOARDS: Board[] = [
  designTeamBoard,
  startupHubBoard,
  devCommunityBoard,
];

export const MOCK_SERVERS: Server[] = [
  {
    id: "s1",
    name: "Design Team",
    icon: "D",
    description: "Internal design team workspace — components, sprints, and feedback.",
    ownerId: "u-alex",
    boardId: SERVER_BOARD_IDS.s1,
    isPublic: false,
    memberCount: 8,
    onlineCount: 3,
    createdAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
    roles: DEFAULT_SERVER_ROLES,
    activityChannel: "general",
  },
  {
    id: "s2",
    name: "Startup Hub",
    icon: "S",
    description: "Early-stage founders sharing resources, intros, and momentum.",
    ownerId: "u-alex",
    boardId: SERVER_BOARD_IDS.s2,
    isPublic: true,
    memberCount: 24,
    onlineCount: 7,
    createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
    roles: DEFAULT_SERVER_ROLES,
    activityChannel: "general",
  },
  {
    id: "s3",
    name: "Dev Community",
    icon: "⚡",
    description: "Open community for Crecoard power users and developers.",
    ownerId: "u-alex",
    boardId: SERVER_BOARD_IDS.s3,
    isPublic: true,
    memberCount: 142,
    onlineCount: 42,
    createdAt: new Date(Date.now() - 90 * 86400_000).toISOString(),
    roles: DEFAULT_SERVER_ROLES,
    activityChannel: "general",
  },
];

export const MOCK_SERVER_MEMBERS: Record<string, ServerMember[]> = {
  s1: [
    { userId: "local-user", username: "You", avatar: "Y", role: "admin", roleIds: ["role-admin"], online: true, status: "Building" },
    { userId: "u-alex", username: "alex_dev", avatar: "A", role: "owner", roleIds: ["role-admin"], online: true, status: "Working on component tokens" },
    { userId: "u-sarah", username: "sarah.m", avatar: "S", role: "admin", roleIds: ["role-admin"], online: false },
    { userId: "u-jordan", username: "jordan", avatar: "J", role: "member", roleIds: ["role-moderator"], online: true, status: "In a meeting" },
    { userId: "u-riley", username: "riley_k", avatar: "R", role: "member", roleIds: [], online: false },
  ],
  s2: [
    { userId: "local-user", username: "You", avatar: "Y", role: "member", roleIds: [], online: true },
    { userId: "u-alex", username: "alex_dev", avatar: "A", role: "owner", roleIds: ["role-admin"], online: true, status: "Closed first customer 🚀" },
    { userId: "u-mia", username: "mia.dev", avatar: "M", role: "admin", roleIds: ["role-admin"], online: true },
    { userId: "u-jordan", username: "jordan", avatar: "J", role: "member", roleIds: [], online: false },
  ],
  s3: [
    { userId: "local-user", username: "You", avatar: "Y", role: "member", roleIds: [], online: true },
    { userId: "u-alex", username: "alex_dev", avatar: "A", role: "owner", roleIds: ["role-admin"], online: true },
    { userId: "u-riley", username: "riley_k", avatar: "R", role: "member", roleIds: ["role-moderator"], online: true, status: "Building the PWA wrapper" },
    { userId: "u-mia", username: "mia.dev", avatar: "M", role: "member", roleIds: [], online: false },
    { userId: "u-jordan", username: "jordan", avatar: "J", role: "member", roleIds: [], online: true },
  ],
};
