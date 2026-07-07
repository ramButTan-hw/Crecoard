import { supabase } from "./supabase";
import { sanitizeSpec, type AnimSpec } from "./animSpec";

// Animation preset library. Presets are AUTHORING artifacts only — applying
// one copies the spec onto the item, so boards never depend on the library
// (or its permissions) at render time.

export interface AnimPreset {
  id: string;
  name: string;
  spec: AnimSpec;
  /** null = personal library entry */
  serverId: string | null;
  mine: boolean;
}

const LOCAL_KEY = "crecoard-anim-presets";

function supabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

function readLocal(): AnimPreset[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as AnimPreset[]).flatMap((p) => {
      const spec = sanitizeSpec(p.spec);
      return spec ? [{ ...p, spec, mine: true }] : [];
    });
  } catch { return []; }
}

function writeLocal(list: AnimPreset[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch {}
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Personal presets + (when serverId given) the server's shared presets. */
export async function listPresets(serverId: string | null): Promise<AnimPreset[]> {
  if (!supabaseReady()) return readLocal();
  const me = await uid();
  if (!me) return readLocal();
  let q = supabase.from("animation_presets").select("*");
  q = serverId
    ? q.or(`and(owner_id.eq.${me},server_id.is.null),server_id.eq.${serverId}`)
    : q.eq("owner_id", me).is("server_id", null);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.flatMap((row) => {
    const spec = sanitizeSpec(row.spec);
    return spec ? [{
      id: row.id as string,
      name: (row.name as string) || spec.name,
      spec,
      serverId: (row.server_id as string | null) ?? null,
      mine: row.owner_id === me,
    }] : [];
  });
}

/** Save to the personal library, or share to a server when serverId is given. */
export async function savePreset(spec: AnimSpec, serverId: string | null): Promise<AnimPreset | null> {
  const clean = sanitizeSpec(spec);
  if (!clean) return null;
  if (!supabaseReady()) {
    const p: AnimPreset = { id: crypto.randomUUID(), name: clean.name, spec: clean, serverId: null, mine: true };
    writeLocal([p, ...readLocal()]);
    return p;
  }
  const me = await uid();
  if (!me) return null;
  const { data, error } = await supabase
    .from("animation_presets")
    .insert({ owner_id: me, server_id: serverId, name: clean.name, spec: clean })
    .select()
    .single();
  if (error || !data) return null;
  return { id: data.id as string, name: clean.name, spec: clean, serverId, mine: true };
}

export async function deletePreset(id: string): Promise<void> {
  if (!supabaseReady()) {
    writeLocal(readLocal().filter((p) => p.id !== id));
    return;
  }
  await supabase.from("animation_presets").delete().eq("id", id);
}
