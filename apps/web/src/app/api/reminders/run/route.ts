import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendEmail, emailConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/apiAuth";

// Self-serve reminder delivery: email the CALLER's own due reminders, right now.
// Uses the user's session (RLS) — no service-role key or cron secret required —
// so it works for local testing with only RESEND_API_KEY + EMAIL_FROM set. The
// scheduled worker (/api/cron/reminders) covers automated delivery in production.

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const limited = rateLimit(`reminders-run:${user.id}`, { limit: 6, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  if (!emailConfigured()) {
    return NextResponse.json({ emailConfigured: false, processed: 0, sent: 0, failed: 0 });
  }
  const email = user.email;
  if (!email) return NextResponse.json({ emailConfigured: true, error: "no-email", processed: 0, sent: 0, failed: 0 });

  // Test mode (?test=1): send a single sample email now, ignoring reminders — lets
  // the user confirm Resend + sender domain work without needing a due reminder.
  if (new URL(req.url).searchParams.get("test") === "1") {
    const res = await sendEmail({
      to: email,
      subject: "Crecoard test email",
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px">✅ Your Crecoard email reminders are working. This is a test message.</div>`,
      text: "Your Crecoard email reminders are working. This is a test message.",
    });
    if (res.ok) return NextResponse.json({ emailConfigured: true, test: true, processed: 1, sent: 1, failed: 0 });
    const detail = "error" in res && res.error ? res.error : "send failed";
    console.error(`[reminders/run] sample FAILED → ${email}: ${detail}`);
    return NextResponse.json({ emailConfigured: true, test: true, processed: 1, sent: 0, failed: 1, errors: [detail] });
  }

  const { data: due, error } = await supabase
    .from("reminders")
    .select("id, title, body, url")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lte("remind_at", new Date().toISOString())
    .order("remind_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[reminders/run] failed to read reminders:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = due ?? [];
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of rows) {
    const title = (r.title as string) || "Reminder";
    const body = (r.body as string) || "";
    const url = r.url as string | null;
    const html =
      `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">` +
      `<p style="font-size:13px;color:#888;margin:0 0 8px">Reminder from Crecoard</p>` +
      `<h2 style="margin:0 0 8px">${htmlEscape(title)}</h2>` +
      (body ? `<p style="white-space:pre-wrap;margin:0 0 12px">${htmlEscape(body)}</p>` : "") +
      (url ? `<p><a href="${htmlEscape(url)}" style="color:#6c63ff">Open board →</a></p>` : "") +
      `</div>`;
    const text = `${title}${body ? `\n\n${body}` : ""}${url ? `\n\n${url}` : ""}`;

    const res = await sendEmail({ to: email, subject: `Reminder: ${title}`, html, text });
    if (res.ok) {
      sent++;
      await supabase.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
    } else {
      // Leave the row pending on failure so the scheduled worker can still retry;
      // surface the provider error so the user can fix config (e.g. sender domain).
      failed++;
      const detail = "error" in res && res.error ? res.error : ("skipped" in res ? "email provider not configured" : "unknown");
      console.error(`[reminders/run] FAILED "${title}" → ${email}: ${detail}`);
      if ("error" in res && res.error) errors.push(res.error);
    }
  }

  return NextResponse.json({ emailConfigured: true, processed: rows.length, sent, failed, errors: errors.slice(0, 3) });
}
