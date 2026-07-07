// Minimal transactional email sender. Uses Resend (https://resend.com) via its
// HTTP API when configured; no-ops gracefully otherwise so the rest of the app
// (reminder scheduling, UI) works without an email provider. To swap providers,
// reimplement sendEmail — nothing else depends on Resend.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Crecoard <reminders@crecoard.com>";

export type SendEmailResult =
  | { ok: true }
  | { ok: false; skipped: true }        // provider not configured
  | { ok: false; skipped?: false; error: string };

export function emailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) return { ok: false, skipped: true };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email send failed" };
  }
}
