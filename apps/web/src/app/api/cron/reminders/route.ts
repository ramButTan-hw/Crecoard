import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, emailConfigured } from "@/lib/email";
import { sendPush, pushConfigured } from "@/lib/webpush";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const BATCH = 100;

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}
function configured() {
  return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && Boolean(SUPABASE_SERVICE_KEY);
}
function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Accept the secret via Authorization: Bearer, x-cron-secret, or ?key= (pg_net/Vercel friendly). */
function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  const header = req.headers.get("x-cron-secret") ?? undefined;
  const query = new URL(req.url).searchParams.get("key") ?? undefined;
  return bearer === CRON_SECRET || header === CRON_SECRET || query === CRON_SECRET;
}

async function deliverDueReminders(): Promise<NextResponse> {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set on this server." }, { status: 501 });
  }
  if (!configured()) {
    return NextResponse.json({ error: "Reminders require Supabase to be configured." }, { status: 501 });
  }
  // Need at least one delivery channel; otherwise leave rows pending so nothing is lost.
  if (!emailConfigured() && !pushConfigured()) {
    return NextResponse.json({ error: "No delivery channel configured (set RESEND_API_KEY and/or VAPID keys)." }, { status: 501 });
  }

  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("reminders")
    .select("id, user_id, title, body, url")
    .eq("status", "pending")
    .lte("remind_at", nowIso)
    .order("remind_at", { ascending: true })
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ processed: 0, sent: 0, failed: 0 });

  let sent = 0;
  let failed = 0;

  for (const r of due) {
    const fail = async (msg: string) => {
      failed++;
      await db.from("reminders").update({ status: "failed", error: msg.slice(0, 300) }).eq("id", r.id);
    };

    // Atomically claim the row so overlapping cron runs can't double-send: only the
    // run that flips pending→sending proceeds; a concurrent run sees no match.
    const { data: claimed } = await db
      .from("reminders")
      .update({ status: "sending" })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const title = (r.title as string) || "Reminder";
    const body = (r.body as string) || "";
    const url = r.url as string | null;
    let delivered = false;
    const errors: string[] = [];

    // Push: deliver to every registered device; prune dead subscriptions.
    if (pushConfigured()) {
      const { data: subs } = await db
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", r.user_id as string);
      for (const s of subs ?? []) {
        const res = await sendPush(
          { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
          { title: `Reminder: ${title}`, body, url: url ?? undefined, tag: `reminder-${r.id}` }
        );
        if (res.ok) delivered = true;
        else if (res.gone) await db.from("push_subscriptions").delete().eq("id", s.id);
        else if (res.error) errors.push(res.error);
      }
    }

    // Email: resolve the current address (source of truth, not a snapshot).
    if (emailConfigured()) {
      const { data: userRes } = await db.auth.admin.getUserById(r.user_id as string);
      const email = userRes?.user?.email;
      if (email) {
        const html =
          `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">` +
          `<p style="font-size:13px;color:#888;margin:0 0 8px">Reminder from Crecoard</p>` +
          `<h2 style="margin:0 0 8px">${htmlEscape(title)}</h2>` +
          (body ? `<p style="white-space:pre-wrap;margin:0 0 12px">${htmlEscape(body)}</p>` : "") +
          (url ? `<p><a href="${htmlEscape(url)}" style="color:#6c63ff">Open board →</a></p>` : "") +
          `</div>`;
        const text = `${title}${body ? `\n\n${body}` : ""}${url ? `\n\n${url}` : ""}`;
        const res = await sendEmail({ to: email, subject: `Reminder: ${title}`, html, text });
        if (res.ok) delivered = true;
        else if (!("skipped" in res && res.skipped) && "error" in res && res.error) errors.push(res.error);
      }
    }

    if (delivered) {
      sent++;
      await db.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
    } else {
      await fail(errors[0] ?? "no delivery channel reached the user");
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return deliverDueReminders();
}

// Some schedulers (Vercel Cron) issue GET.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return deliverDueReminders();
}
