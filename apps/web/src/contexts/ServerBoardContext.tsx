"use client";

import { createContext, useContext } from "react";
import { useBoardStore } from "@/store/boardStore";
import type { BoxPerms, ItemPerms } from "@/store/boardStore";
import type { MemberRole, ServerMember, ServerRole } from "@/types/server";

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * True when the viewer is allowed to perform an action.
 * - null viewerRole / "owner" → always allowed
 * - undefined allowed → everyone allowed (no restriction)
 * - empty [] allowed → owner-only (no non-owner role qualifies)
 * - otherwise → viewer must hold at least one of the listed ServerRole IDs
 */
export function roleAllowed(
  viewerRole: MemberRole | null,
  viewerRoleIds: string[],
  allowed?: string[]
): boolean {
  if (viewerRole === null || viewerRole === "owner") return true;
  if (!allowed) return true;
  if (allowed.length === 0) return false;
  return allowed.some((id) => viewerRoleIds.includes(id));
}

export interface ServerBoardContextValue {
  serverId: string | null;
  /** The draft board ID belonging to this server — null in personal view */
  boardId: string | null;
  serverName: string;
  viewerRole: MemberRole | null;
  /** Custom ServerRole IDs assigned to the viewer (always includes the @everyone role if one exists) */
  viewerRoleIds: string[];
  /** All custom roles defined for this server */
  serverRoles: ServerRole[];
  viewerId: string;
  members: ServerMember[];
  /** True while editing the draft; false when previewing or viewing the live snapshot */
  isDraftMode: boolean;
  /** True if at least one publish exists for this server */
  hasLiveVersion: boolean;
  /** Toggle between draft editing and live preview (owners/admins only) */
  onToggleMode: () => void;
  /** Open the publish modal (owners/admins only) */
  onPublish: () => void;
}

export const ServerBoardContext = createContext<ServerBoardContextValue>({
  serverId: null,
  boardId: null,
  serverName: "",
  viewerRole: null,
  viewerRoleIds: [],
  serverRoles: [],
  viewerId: "local-user",
  members: [],
  isDraftMode: true,
  hasLiveVersion: false,
  onToggleMode: () => {},
  onPublish: () => {},
});

export function useServerBoard() {
  return useContext(ServerBoardContext);
}

/** Alias for useServerBoard — use this inside permission hooks. */
export function useServerBoardContext() {
  return useContext(ServerBoardContext);
}

/** Returns the active server board (draft or live) for the current server context. */
export function useServerBoardData() {
  const { boardId, isDraftMode } = useContext(ServerBoardContext);
  return useBoardStore((s) => {
    if (!boardId) return undefined;
    return isDraftMode ? s.serverBoards[boardId] : s.serverBoards[boardId + ":live"];
  });
}

/** Returns the draft board regardless of current view mode. */
export function useServerDraftData() {
  const { boardId } = useContext(ServerBoardContext);
  return useBoardStore((s) => (boardId ? s.serverBoards[boardId] : undefined));
}

/**
 * True if the viewer can edit board layout (move/resize/add blocks).
 * - null viewerRole  → personal board, always editable
 * - "owner" / "admin" → full edit access
 * - "member" → read-only
 */
export function useCanEditBoard() {
  const { viewerRole } = useServerBoardContext();
  // Personal board shared with this user as view-only → read-only.
  const isReadonlyShared = useBoardStore((s) => s.readonlyBoardIds.includes(s.activeBoardId));
  if (viewerRole === null) return !isReadonlyShared;
  return viewerRole === "owner" || viewerRole === "admin";
}

// TODO: wire to file upload UI — no file upload button exists in ServerBoardHeader yet
/**
 * True if the viewer can upload files to file-bank blocks.
 * - null viewerRole  → personal board, always allowed
 * - "owner" / "admin" → allowed
 * - "member" → not allowed
 */
export function useCanUploadFiles() {
  const { viewerRole } = useServerBoardContext();
  return viewerRole === null || viewerRole === "owner" || viewerRole === "admin";
}

/**
 * True if the viewer can invite new members to the server.
 * - null viewerRole  → personal board (no concept of invites), returns false
 * - "owner" / "admin" → allowed
 * - "member" → not allowed
 */
export function useCanInviteMembers() {
  const { viewerRole } = useServerBoardContext();
  return viewerRole === "owner" || viewerRole === "admin";
}

/**
 * True if the viewer can manage (kick/ban/edit) existing members.
 * Only owners have this permission; admins can invite but not manage.
 * - null viewerRole  → personal board, returns false
 * - "owner" → allowed
 * - "admin" / "member" → not allowed
 */
export function useCanManageMembers() {
  const { viewerRole } = useServerBoardContext();
  return viewerRole === "owner";
}

/**
 * Resolves effective permissions for a box against the current viewer's role.
 * Undefined allowed set → everyone is allowed.
 */
export function useBoxPerms(perms?: BoxPerms) {
  const { viewerRole, viewerRoleIds } = useServerBoardContext();
  return {
    canEdit: roleAllowed(viewerRole, viewerRoleIds, perms?.edit),
    canInteract: roleAllowed(viewerRole, viewerRoleIds, perms?.interact),
  };
}

/**
 * Resolves effective permissions for a block item against the current viewer's role.
 * Undefined allowed set → everyone is allowed.
 */
export function useItemPerms(perms?: ItemPerms) {
  const { viewerRole, viewerRoleIds } = useServerBoardContext();
  return {
    canEdit: roleAllowed(viewerRole, viewerRoleIds, perms?.edit),
    canInput: roleAllowed(viewerRole, viewerRoleIds, perms?.input),
    canInteract: roleAllowed(viewerRole, viewerRoleIds, perms?.interact),
    canContribute: roleAllowed(viewerRole, viewerRoleIds, perms?.contribute),
  };
}
