"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { postChatActivity } from "@/lib/chatActivity";

interface InviteInfo {
  code: string;
  serverId: string;
  serverName: string;
  serverIcon: string;
  serverDescription: string;
  memberCount: number;
  isPublic: boolean;
  expired: boolean;
  alreadyMember: boolean;
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    (async () => {
      // Resolve the invite by its exact code via a SECURITY DEFINER function.
      // This avoids exposing the server_invites table (no enumeration).
      const { data, error: fetchErr } = await supabase.rpc("get_invite", { invite_code: code });
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;

      if (fetchErr || !row) { setNotFound(true); return; }

      // Check if already a member (RLS only lets you see memberships of servers
      // you already belong to, so this returns false for servers you're not in).
      const { data: { user } } = await supabase.auth.getUser();
      let alreadyMember = false;
      if (user) {
        const { data: membership } = await supabase
          .from("server_members")
          .select("user_id")
          .eq("server_id", row.server_id as string)
          .eq("user_id", user.id)
          .maybeSingle();
        alreadyMember = !!membership;
      }

      setInfo({
        code: row.code as string,
        serverId: row.server_id as string,
        serverName: (row.server_name as string) || "Unknown Server",
        serverIcon: (row.server_icon as string) || "🌐",
        serverDescription: (row.server_description as string) || "",
        memberCount: (row.member_count as number) || 0,
        isPublic: (row.is_public as boolean) || false,
        expired: !!row.expired,
        alreadyMember,
      });
    })();
  }, [code]);

  const handleJoin = async () => {
    if (!info) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=/invite/${code}`);
      return;
    }

    setJoining(true);
    setError(null);

    // Validate the code and join atomically server-side: redeem_invite() checks
    // expiry / max_uses, blocks guests, inserts the membership, and bumps
    // uses_count in one transaction.
    const { error: redeemErr } = await supabase.rpc("redeem_invite", { invite_code: code });

    if (redeemErr) {
      const msg = redeemErr.message || "";
      if (msg.includes("authentication required")) {
        router.push(`/login?redirect=/invite/${code}`);
        return;
      }
      if (msg.includes("expired")) setError("This invite has expired.");
      else if (msg.includes("limit")) setError("This invite has reached its use limit.");
      else if (msg.includes("invalid")) setError("Invite not found.");
      else setError("Failed to join server. Please try again.");
      setJoining(false);
      return;
    }

    // Announce the join in the server's primary board chat. We're now a member,
    // so RLS lets us read the server's board_id and insert the activity line.
    const [{ data: srv }, { data: profile }] = await Promise.all([
      supabase.from("servers").select("board_id, activity_channel").eq("id", info.serverId).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    if (srv?.board_id) {
      await postChatActivity({
        boardId: srv.board_id as string,
        actorId: user.id,
        content: `${(profile?.display_name as string) || "Someone"} joined the server`,
        channel: (srv.activity_channel as string) || "general",
      });
    }

    setJoined(true);
    setJoining(false);

    setTimeout(() => { router.push("/"); }, 1500);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0d0e11",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, sans-serif",
    padding: "20px",
  };

  const cardStyle: React.CSSProperties = {
    background: "#1a1b1e",
    border: "1px solid #2e3035",
    borderRadius: 20,
    padding: "40px 36px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
  };

  if (!info && !notFound) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: "#8b8d99", fontSize: 14 }}>Loading invite…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🔗</p>
          <h1 style={{ color: "#f2f2f2", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Invite not found
          </h1>
          <p style={{ color: "#8b8d99", fontSize: 14, marginBottom: 24 }}>
            This invite link may have expired or been deleted.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block", background: "#d59ee8", color: "#fff",
              borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to Crecoard
          </a>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
          <h1 style={{ color: "#f2f2f2", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Joined {info!.serverName}!
          </h1>
          <p style={{ color: "#8b8d99", fontSize: 14 }}>Redirecting you now…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Server icon */}
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: "#2e3035", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 36, margin: "0 auto 20px",
          border: "2px solid #3e4045", overflow: "hidden",
        }}>
          {info!.serverIcon.startsWith("http") || info!.serverIcon.startsWith("data:")
            ? <img src={info!.serverIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : info!.serverIcon}
        </div>

        <p style={{ color: "#8b8d99", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          You've been invited to join
        </p>
        <h1 style={{ color: "#f2f2f2", fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
          {info!.serverName}
        </h1>
        {info!.serverDescription && (
          <p style={{ color: "#8b8d99", fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
            {info!.serverDescription}
          </p>
        )}
        <p style={{ color: "#6d6f75", fontSize: 12, marginBottom: 28 }}>
          {info!.memberCount} member{info!.memberCount !== 1 ? "s" : ""}
          {info!.isPublic ? " · Public" : " · Private"}
        </p>

        {info!.expired ? (
          <div style={{
            background: "#2a1a1a", border: "1px solid #4a2020",
            borderRadius: 12, padding: "12px 16px", marginBottom: 20,
          }}>
            <p style={{ color: "#f87171", fontSize: 13 }}>This invite has expired or reached its use limit.</p>
          </div>
        ) : info!.alreadyMember ? (
          <div style={{
            background: "#1a2a1a", border: "1px solid #2a4a2a",
            borderRadius: 12, padding: "12px 16px", marginBottom: 20,
          }}>
            <p style={{ color: "#4ade80", fontSize: 13 }}>You're already a member of this server.</p>
          </div>
        ) : null}

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {info!.alreadyMember ? (
            <a
              href="/"
              style={{
                display: "block", background: "#d59ee8", color: "#fff",
                borderRadius: 12, padding: "12px 24px", fontSize: 14,
                fontWeight: 700, textDecoration: "none", cursor: "pointer",
              }}
            >
              Open Crecoard
            </a>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining || !!info!.expired}
              style={{
                background: info!.expired ? "#2e3035" : "#d59ee8",
                color: info!.expired ? "#6d6f75" : "#fff",
                border: "none", borderRadius: 12, padding: "12px 24px",
                fontSize: 14, fontWeight: 700, cursor: info!.expired ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {joining ? "Joining…" : info!.expired ? "Invite Expired" : "Accept Invite"}
            </button>
          )}
          <a
            href="/"
            style={{
              display: "block", color: "#6d6f75", fontSize: 13,
              textDecoration: "none", cursor: "pointer",
            }}
          >
            No thanks
          </a>
        </div>
      </div>
    </div>
  );
}
