export type MemberRole = "owner" | "admin" | "member";

/** Live presence state, broadcast over Realtime. "offline" = not present / appearing offline. */
export type PresenceStatus = "online" | "dnd" | "offline";

export interface Server {
  id: string;
  name: string;
  icon: string;          // emoji or image URL
  description: string;
  ownerId: string;
  boardId: string;       // the board that IS this server
  isPublic: boolean;
  memberCount: number;
  onlineCount: number;
  createdAt: string;
  roles?: ServerRole[];
  /** Chat channel that receives member join/leave/kick activity messages. */
  activityChannel: string;
}

export interface ServerMember {
  userId: string;
  username: string;
  avatar: string;        // single char or URL
  banner?: string;       // profile banner image URL (for the member profile card)
  role: MemberRole;
  roleIds?: string[];    // custom ServerRole IDs assigned to this member
  online: boolean;
  presence?: PresenceStatus; // live presence (overlaid from PresenceContext)
  status?: string;
}

export interface RolePermission {
  canViewBoard: boolean;
  canEditBoard: boolean;
  canUploadFiles: boolean;
  canManageRoles: boolean;
  canManageMembers: boolean;
  canInviteMembers: boolean;
  canViewPublishHistory: boolean;
  canRollback: boolean;
  canManageBackups: boolean;
}

export interface ServerBackup {
  id: string;
  slot: 1 | 2 | 3;
  label: string | null;
  creatorName: string;
  createdAt: string;
}

export interface ServerRole {
  id: string;
  name: string;
  color: string;     // hex color
  permissions: RolePermission;
  isDefault?: boolean; // true for the built-in @everyone role
}

export type AuditAction =
  | "box_moved"
  | "board_item_added"
  | "server_updated"
  | "member_kicked"
  | "member_role_changed"
  | "theme_preset_applied";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string;
  action: AuditAction;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ServerPublish {
  id: string;
  serverId: string;
  message: string | null;
  publishedBy: string | null;
  publisherName: string;
  publishedAt: string;
}
