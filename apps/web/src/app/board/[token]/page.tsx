"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RedeemSharePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?redirect=/board/${token}`);
        return;
      }
      const { data, error: redeemErr } = await supabase.rpc("redeem_board_share", { p_token: token });
      if (redeemErr || !data) {
        setError("This share link is invalid or has been revoked.");
        return;
      }
      // Tell the app to open this board once BoardSync has loaded it. Use a full
      // navigation (not router.replace) so BoardSyncProvider remounts and fetches
      // the newly shared board instead of reusing its already-initialized state.
      sessionStorage.setItem("crecoard-open-board", data as string);
      window.location.href = "/";
    })();
  }, [token, router]);

  const page: React.CSSProperties = {
    minHeight: "100vh", background: "#0d0e11", display: "flex",
    alignItems: "center", justifyContent: "center",
    fontFamily: "Inter, sans-serif", padding: 20,
  };
  const card: React.CSSProperties = {
    background: "#1a1b1e", border: "1px solid #2e3035", borderRadius: 20,
    padding: "40px 36px", maxWidth: 380, width: "100%", textAlign: "center",
  };

  return (
    <div style={page}>
      <div style={card}>
        {error ? (
          <>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🔗</p>
            <h1 style={{ color: "#f2f2f2", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Link not available</h1>
            <p style={{ color: "#8b8d99", fontSize: 14, marginBottom: 24 }}>{error}</p>
            <a href="/" style={{
              display: "inline-block", background: "#d59ee8", color: "#fff", borderRadius: 12,
              padding: "10px 24px", fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>Go to Crecoard</a>
          </>
        ) : (
          <p style={{ color: "#8b8d99", fontSize: 14 }}>Opening shared board…</p>
        )}
      </div>
    </div>
  );
}
