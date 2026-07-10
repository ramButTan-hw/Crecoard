"use client";

import { supabase } from "@/lib/supabase";
import type { UserPrefs } from "@/lib/userPrefs";

// ─── Privacy enforcement helpers ──────────────────────────────────────────────
// The Settings → Privacy prefs live in localStorage (per device). For settings
// that gate what OTHER people can do to you (who may DM you / friend-request
// you), the relevant flags are mirrored onto your profiles row so other clients
// can respect them, and the migration 20260709000000 enforces them with RLS so
// a modified client can't bypass. These client-side checks just give a clean
// message instead of a raw RLS rejection.

/** Mirror the privacy prefs that others need to see onto the current profile. */
export async function publishPrivacyToProfile(prefs: Pick<UserPrefs, "allowDMsFrom" | "allowFriendRequests">): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      allow_dms_from: prefs.allowDMsFrom,
      allow_friend_requests: prefs.allowFriendRequests,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}

/** Can the current user start a DM with `targetUserId`? Mirrors the RLS check. */
export async function canDM(targetUserId: string): Promise<{ ok: boolean; reason?: "none" | "friends" }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data } = await supabase.from("profiles").select("allow_dms_from").eq("id", targetUserId).maybeSingle();
  const setting = (data?.allow_dms_from as string) ?? "everyone";
  if (setting === "none") return { ok: false, reason: "none" };
  if (setting === "friends") {
    const { data: friend } = await supabase.rpc("are_friends", { a: user.id, b: targetUserId });
    return friend ? { ok: true } : { ok: false, reason: "friends" };
  }
  return { ok: true };
}

/** Does `targetUserId` accept friend requests? */
export async function canFriendRequest(targetUserId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("allow_friend_requests").eq("id", targetUserId).maybeSingle();
  return (data?.allow_friend_requests as boolean | null) ?? true;
}
