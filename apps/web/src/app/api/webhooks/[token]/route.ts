import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/apiAuth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function isConfigured() {
  return (
    Boolean(SUPABASE_URL) &&
    !SUPABASE_URL.includes("placeholder") &&
    Boolean(SUPABASE_SERVICE_KEY)
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Token-gated endpoint hit by external services — no user session. Throttle by
  // IP to blunt token brute-forcing and insert floods.
  const limited = rateLimit(`webhook:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Webhooks require Supabase to be configured." },
      { status: 501 }
    );
  }

  const db = supabaseAdmin();

  // Look up the token
  const { data: tokenRow, error: tokenErr } = await db
    .from("webhook_tokens")
    .select("board_id")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 });
  }

  const board_id: string = tokenRow.board_id;

  // Parse body — accept a single embed card or an array
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payloads = Array.isArray(body) ? body : [body];

  // Validate and insert each item
  const rows = payloads.map((p) => ({
    board_id,
    item_data: {
      type: "embed-card",
      showInCollapsed: false,
      embedCard: sanitizeEmbedCard(p),
    },
  }));

  const { error: insertErr } = await db.from("webhook_items").insert(rows);

  if (insertErr) {
    console.error("[webhook] insert error", insertErr);
    return NextResponse.json({ error: "Failed to store webhook item." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}

// Sanitize embed card payload from untrusted source
function sanitizeEmbedCard(p: unknown) {
  if (typeof p !== "object" || p === null) return {};
  const obj = p as Record<string, unknown>;

  const fields = Array.isArray(obj.fields)
    ? obj.fields.slice(0, 25).map((f: unknown) => {
        if (typeof f !== "object" || f === null) return null;
        const ff = f as Record<string, unknown>;
        return {
          label: String(ff.label ?? "").slice(0, 100),
          value: String(ff.value ?? "").slice(0, 300),
          inline: ff.inline !== false,
        };
      }).filter(Boolean)
    : undefined;

  return {
    title:        typeof obj.title       === "string" ? obj.title.slice(0, 256)       : undefined,
    description:  typeof obj.description === "string" ? obj.description.slice(0, 2048) : undefined,
    accentColor:  typeof obj.accentColor === "string" ? obj.accentColor.slice(0, 20)  : undefined,
    source:       typeof obj.source      === "string" ? obj.source.slice(0, 64)       : undefined,
    footer:       typeof obj.footer      === "string" ? obj.footer.slice(0, 256)      : undefined,
    timestamp:    typeof obj.timestamp   === "string" ? obj.timestamp.slice(0, 64)    : undefined,
    iconUrl:      typeof obj.iconUrl     === "string" ? obj.iconUrl.slice(0, 512)     : undefined,
    thumbnailUrl: typeof obj.thumbnailUrl === "string" ? obj.thumbnailUrl.slice(0, 512) : undefined,
    imageUrl:     typeof obj.imageUrl    === "string" ? obj.imageUrl.slice(0, 512)    : undefined,
    fields,
  };
}
