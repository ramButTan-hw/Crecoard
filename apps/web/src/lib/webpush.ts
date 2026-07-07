import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@crecoard.com";

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

function ensureConfigured() {
  if (!configured && pushConfigured()) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  }
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }
export interface PushPayload { title: string; body?: string; url?: string; tag?: string }

/**
 * Send one push. `gone: true` means the subscription is dead (404/410) and should
 * be deleted by the caller.
 */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) return { ok: false, gone: true };
    return { ok: false, error: e instanceof Error ? e.message : "push failed" };
  }
}
