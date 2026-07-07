import { supabase } from "./supabase";
import { getSelfIdentity } from "./collaboration";

const BUCKET = "uploads";

function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder");
}

/**
 * Upload a File or Blob to Supabase Storage under {userId}/{folder}/{uuid}.{ext}.
 * Returns the public URL, or null if Supabase is not configured or the upload fails.
 */
export async function uploadFile(
  file: File | Blob,
  userId: string,
  folder: string,
  fileName?: string
): Promise<string | null> {
  if (!isSupabaseReady()) return null;
  const name = file instanceof File ? file.name : (fileName ?? "file");
  const ext = name.includes(".") ? name.split(".").pop() : "";
  const path = `${userId}/${folder}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Image-picker helper for style panels: apply an instant data-URL preview,
 * then upload to storage and re-apply the durable public URL.
 *
 * Inline data URLs must never STAY in board state — a single chat wallpaper
 * once consumed the entire localStorage quota ("Storage is full" banner) and
 * bloats every publish/share. The data URL only survives in guest/local mode
 * where uploads are unavailable.
 */
export function applyImageUpload(
  file: File,
  apply: (url: string) => void,
  folder = "wallpapers"
): void {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result as string;
    apply(dataUrl);
    void uploadFile(file, getSelfIdentity().userId, folder, file.name).then((url) => {
      if (url) apply(url);
    });
  };
  reader.readAsDataURL(file);
}

/**
 * Convert a data URL to a Blob, then upload it.
 * Used for post-crop avatar/banner uploads from ProfileModal.
 */
export async function uploadDataUrl(
  dataUrl: string,
  userId: string,
  folder: string,
  fileName: string
): Promise<string | null> {
  if (!isSupabaseReady()) return null;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadFile(blob, userId, folder, fileName);
}
