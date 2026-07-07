"use client";

import {
  createContext, useCallback, useContext, useEffect, useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { postChatActivity } from "@/lib/chatActivity";
import type { Server, ServerMember, ServerRole, MemberRole } from "@/types/server";

const ROLES_STORAGE_KEY = "plancraft-server-roles";

function loadRolesStorage(): Record<string, ServerRole[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(ROLES_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

function saveRolesStorage(map: Record<string, ServerRole[]>) {
  localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(map));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

type ServerRow = Record<string, unknown>;
type MemberRow = Record<string, unknown>;

function rowToServer(row: ServerRow): Server {
  return {
    id:          row.id as string,
    name:        row.name as string,
    icon:        row.icon as string,
    description: (row.description as string) || "",
    ownerId:     row.owner_id as string,
    boardId:     row.board_id as string,
    isPublic:    row.is_public as boolean,
    memberCount: (row.member_count as number) || 1,
    onlineCount: 0,
    createdAt:   row.created_at as string,
    roles:       Array.isArray(row.roles) ? (row.roles as ServerRole[]) : undefined,
    activityChannel: (row.activity_channel as string) || "general",
  };
}

function rowToMember(row: MemberRow): ServerMember {
  return {
    userId:   row.user_id as string,
    username: (row.display_name as string) || "Unknown",
    avatar:   (row.avatar_url as string) || ((row.display_name as string)?.[0] ?? "?").toUpperCase(),
    role:     row.role as ServerMember["role"],
    online:   false,
    status:   undefined,
  };
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface ServersContextValue {
  /** Real servers from Supabase that the current user belongs to */
  servers: Server[];
  /** Members keyed by server_id, loaded on first visit to a real server */
  serverMembers: Record<string, ServerMember[]>;
  loading: boolean;
  createServer: (input: {
    name: string;
    icon: string;
    description: string;
    isPublic: boolean;
  }) => Promise<Server | null>;
  leaveServer: (serverId: string) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
  /** Creates an invite row and returns a full invite URL */
  generateInvite: (serverId: string) => Promise<string | null>;
  /** Loads members for a server if not yet cached */
  loadMembers: (serverId: string) => Promise<void>;
  /** Update name / description / icon / activity channel for a real server in Supabase */
  updateServer: (serverId: string, patch: { name?: string; description?: string; icon?: string; activityChannel?: string }) => Promise<void>;
  /** Persists custom roles for a server to the DB (servers.roles), with a localStorage cache. */
  serverRoles: Record<string, ServerRole[]>;
  updateServerRoles: (serverId: string, roles: ServerRole[]) => Promise<void>;
  /** Transfer ownership: old owner becomes admin, new owner gets owner role */
  transferOwnership: (serverId: string, newOwnerId: string) => Promise<void>;
  /** Remove a member from a server */
  kickMember: (serverId: string, userId: string) => Promise<void>;
  /** Change a member's role */
  updateMemberRole: (serverId: string, userId: string, role: MemberRole) => Promise<void>;
  updateMemberRoleIds: (serverId: string, userId: string, roleIds: string[]) => Promise<void>;
  /** Force-reload members for a server, bypassing the cache */
  refreshMembers: (serverId: string) => Promise<void>;
}

const ServersContext = createContext<ServersContextValue | null>(null);

export function useServers(): ServersContextValue {
  const ctx = useContext(ServersContext);
  if (!ctx) throw new Error("useServers must be inside <ServersProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ServersProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<Server[]>([]);
  const [serverMembers, setServerMembers] = useState<Record<string, ServerMember[]>>({});
  const [serverRoles, setServerRolesState] = useState<Record<string, ServerRole[]>>(loadRolesStorage);
  const [loading, setLoading] = useState(true);

  const updateServerRoles = useCallback(async (serverId: string, roles: ServerRole[]) => {
    // Optimistic local update + localStorage cache.
    setServerRolesState((prev) => {
      const next = { ...prev, [serverId]: roles };
      saveRolesStorage(next);
      return next;
    });
    // Persist to the DB so roles survive reloads/deploys and reach other members.
    if (isSupabaseReady()) {
      const { error } = await supabase.from("servers").update({ roles }).eq("id", serverId);
      if (error) console.error("[ServersContext] updateServerRoles failed:", error.message);
    }
    setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, roles } : s)));
  }, []);

  useEffect(() => {
    if (!isSupabaseReady()) { setLoading(false); return; }

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }

      // Fetch all servers the user is a member of
      const { data: memberRows } = await supabase
        .from("server_members")
        .select("server_id")
        .eq("user_id", user.id);

      if (!memberRows?.length) { if (!cancelled) setLoading(false); return; }

      const serverIds = memberRows.map((r) => r.server_id as string);
      const { data: serverRows } = await supabase
        .from("servers")
        .select("*")
        .in("id", serverIds)
        .order("created_at", { ascending: false });

      if (!cancelled && serverRows) {
        setServers(serverRows.map(rowToServer));
        // DB is the source of truth for roles — hydrate the cache from the servers
        // rows. Only override when the DB actually has roles so we never wipe a
        // pre-migration localStorage config that hasn't been re-saved yet.
        const dbRoles: Record<string, ServerRole[]> = {};
        for (const row of serverRows) {
          const rs = row.roles;
          if (Array.isArray(rs) && rs.length > 0) dbRoles[row.id as string] = rs as ServerRole[];
        }
        if (Object.keys(dbRoles).length > 0) {
          setServerRolesState((prev) => {
            const next = { ...prev, ...dbRoles };
            saveRolesStorage(next);
            return next;
          });
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const createServer = useCallback(async (input: {
    name: string;
    icon: string;
    description: string;
    isPublic: boolean;
  }): Promise<Server | null> => {
    if (!isSupabaseReady()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("servers")
      .insert({
        name:        input.name.trim(),
        icon:        input.icon || "🌐",
        description: input.description.trim(),
        is_public:   input.isPublic,
        owner_id:    user.id,
      })
      .select()
      .single();

    if (error || !data) { console.error(error); return null; }

    const newServer = rowToServer(data);
    setServers((prev) => [newServer, ...prev]);

    // Pre-populate creator as owner so viewerRole is correct immediately
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    const displayName = (profile?.display_name as string) || "Unknown";
    setServerMembers((prev) => ({
      ...prev,
      [newServer.id]: [{
        userId:   user.id,
        username: displayName,
        avatar:   (profile?.avatar_url as string) ?? displayName[0]?.toUpperCase() ?? "?",
        role:     "owner" as const,
        online:   true,
      }],
    }));

    return newServer;
  }, []);

  const leaveServer = useCallback(async (serverId: string) => {
    if (!isSupabaseReady()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Safety: owners must transfer first
    const myMembership = (serverMembers[serverId] ?? []).find((m) => m.userId === user.id);
    if (myMembership?.role === "owner") return;

    // If this is the last member, delete the server entirely instead of orphaning it
    const server = servers.find((s) => s.id === serverId);
    if (server && server.memberCount <= 1) {
      await supabase.from("servers").delete().eq("id", serverId);
    } else {
      // Announce the departure before leaving (still a member, so the insert is
      // allowed and remaining members receive it over Realtime).
      if (server) {
        await postChatActivity({
          boardId: server.boardId,
          actorId: user.id,
          content: `${myMembership?.username ?? "Someone"} left the server`,
          channel: server.activityChannel,
        });
      }
      await supabase.from("server_members").delete()
        .eq("server_id", serverId)
        .eq("user_id", user.id);
    }

    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setServerMembers((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  }, [servers, serverMembers]);

  const deleteServer = useCallback(async (serverId: string) => {
    if (!isSupabaseReady()) return;
    await supabase.from("servers").delete().eq("id", serverId);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setServerMembers((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  }, []);

  const generateInvite = useCallback(async (serverId: string): Promise<string | null> => {
    if (!isSupabaseReady()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("server_invites")
      .insert({ server_id: serverId, created_by: user.id })
      .select("code")
      .single();

    if (error || !data) { console.error(error); return null; }
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/invite/${data.code}`;
  }, []);

  const updateServer = useCallback(async (
    serverId: string,
    patch: { name?: string; description?: string; icon?: string; activityChannel?: string }
  ) => {
    if (!isSupabaseReady()) return;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.description !== undefined) update.description = patch.description.trim();
    if (patch.icon !== undefined) update.icon = patch.icon;
    if (patch.activityChannel !== undefined) update.activity_channel = patch.activityChannel;
    const { error } = await supabase.from("servers").update(update).eq("id", serverId);
    if (error) { console.error(error); return; }
    setServers((prev) =>
      prev.map((s) => s.id === serverId ? { ...s, ...patch } : s)
    );
  }, []);

  const transferOwnership = useCallback(async (serverId: string, newOwnerId: string) => {
    if (!isSupabaseReady()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("server_members").update({ role: "owner" }).eq("server_id", serverId).eq("user_id", newOwnerId);
    await supabase.from("server_members").update({ role: "admin" }).eq("server_id", serverId).eq("user_id", user.id);
    await supabase.from("servers").update({ owner_id: newOwnerId, updated_at: new Date().toISOString() }).eq("id", serverId);

    setServers((prev) => prev.map((s) => s.id === serverId ? { ...s, ownerId: newOwnerId } : s));
    setServerMembers((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).map((m) =>
        m.userId === newOwnerId ? { ...m, role: "owner" as const }
        : m.userId === user.id ? { ...m, role: "admin" as const }
        : m
      ),
    }));
  }, []);

  const kickMember = useCallback(async (serverId: string, userId: string) => {
    if (!isSupabaseReady()) return;
    const target = (serverMembers[serverId] ?? []).find((m) => m.userId === userId);
    const server = servers.find((s) => s.id === serverId);
    await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", userId);
    setServerMembers((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).filter((m) => m.userId !== userId),
    }));
    setServers((prev) =>
      prev.map((s) => s.id === serverId ? { ...s, memberCount: Math.max(1, (s.memberCount ?? 1) - 1) } : s)
    );
    // Announce the removal (actor is the current admin/owner performing the kick).
    const { data: { user } } = await supabase.auth.getUser();
    if (server && user) {
      await postChatActivity({
        boardId: server.boardId,
        actorId: user.id,
        content: `${target?.username ?? "A member"} was removed from the server`,
        channel: server.activityChannel,
      });
    }
  }, [servers, serverMembers]);

  const updateMemberRole = useCallback(async (serverId: string, userId: string, role: MemberRole) => {
    if (!isSupabaseReady()) return;
    const { error } = await supabase.from("server_members").update({ role }).eq("server_id", serverId).eq("user_id", userId);
    if (error) { console.error(error); return; }
    setServerMembers((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).map((m) => m.userId === userId ? { ...m, role } : m),
    }));
  }, []);

  const updateMemberRoleIds = useCallback(async (serverId: string, userId: string, roleIds: string[]) => {
    if (!isSupabaseReady()) return;
    const { error } = await supabase.from("server_members").update({ role_ids: roleIds }).eq("server_id", serverId).eq("user_id", userId);
    if (error) { console.error(error); return; }
    setServerMembers((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).map((m) => m.userId === userId ? { ...m, roleIds } : m),
    }));
  }, []);

  const loadMembers = useCallback(async (serverId: string) => {
    if (!isSupabaseReady()) return;
    if (serverMembers[serverId]) return; // already loaded

    const { data: memberData, error: memberError } = await supabase
      .from("server_members")
      .select("user_id, role, role_ids")
      .eq("server_id", serverId);

    if (memberError) { console.error("[ServersContext] loadMembers failed:", memberError.message); return; }
    if (!memberData?.length) { setServerMembers((prev) => ({ ...prev, [serverId]: [] })); return; }

    const userIds = memberData.map((m) => m.user_id as string);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, banner_url")
      .in("id", userIds);

    const profileMap = new Map((profileData ?? []).map((p) => [p.id as string, p]));

    const members: ServerMember[] = memberData.map((row) => {
      const profile = profileMap.get(row.user_id as string);
      const displayName = (profile?.display_name as string) || "Unknown";
      return {
        userId:   row.user_id as string,
        username: displayName,
        avatar:   (profile?.avatar_url as string) ?? displayName[0]?.toUpperCase() ?? "?",
        banner:   (profile?.banner_url as string) ?? undefined,
        role:     row.role as ServerMember["role"],
        roleIds:  (row.role_ids as string[] | null) ?? [],
        online:   false,
      };
    });

    setServerMembers((prev) => ({ ...prev, [serverId]: members }));
  }, [serverMembers]);

  const refreshMembers = useCallback(async (serverId: string) => {
    if (!isSupabaseReady()) return;

    const { data: memberData, error: memberError } = await supabase
      .from("server_members")
      .select("user_id, role, role_ids")
      .eq("server_id", serverId);

    if (memberError) { console.error("[ServersContext] refreshMembers failed:", memberError.message); return; }
    if (!memberData) return;

    const userIds = memberData.map((m) => m.user_id as string);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, banner_url")
      .in("id", userIds);

    const profileMap = new Map((profileData ?? []).map((p) => [p.id as string, p]));

    const members: ServerMember[] = memberData.map((row) => {
      const profile = profileMap.get(row.user_id as string);
      const displayName = (profile?.display_name as string) || "Unknown";
      return {
        userId:   row.user_id as string,
        username: displayName,
        avatar:   (profile?.avatar_url as string) ?? displayName[0]?.toUpperCase() ?? "?",
        banner:   (profile?.banner_url as string) ?? undefined,
        role:     row.role as ServerMember["role"],
        roleIds:  (row.role_ids as string[] | null) ?? [],
        online:   false,
      };
    });

    setServerMembers((prev) => ({ ...prev, [serverId]: members }));
  }, []);

  return (
    <ServersContext.Provider value={{
      servers, serverMembers, serverRoles, loading,
      createServer, leaveServer, deleteServer, generateInvite,
      loadMembers, refreshMembers, updateServer, updateServerRoles,
      transferOwnership, kickMember, updateMemberRole, updateMemberRoleIds,
    }}>
      {children}
    </ServersContext.Provider>
  );
}
