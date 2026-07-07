/**
 * Installed community items — the "mod library".
 *
 * When someone adds an item-kind entry from the community marketplace, it's
 * also installed here so it appears in the item palette as a first-class,
 * re-addable item (with the name and author it was published under, and the
 * permissions the installer consented to).
 *
 * v1 stores per-device in localStorage; syncing the library to the user's
 * profile is a straightforward later upgrade.
 */

import type { BlockItem } from "@/store/boardStore";

export interface InstalledItem {
  /** Community entry id — dedupe key. */
  id: string;
  name: string;
  author: string;
  installedAt: number;
  item: Omit<BlockItem, "id" | "showInCollapsed">;
}

const KEY = "crecoard-installed-items";
const MAX_INSTALLED = 50;

/** Fired on window whenever the library changes, so open palettes can refresh. */
export const INSTALLED_CHANGED_EVENT = "crecoard-installed-changed";

export function getInstalledItems(): InstalledItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as InstalledItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: InstalledItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_INSTALLED)));
    window.dispatchEvent(new Event(INSTALLED_CHANGED_EVENT));
  } catch {
    // storage full/blocked — the item was still added to the board, just not the library
  }
}

export function installItem(entry: Omit<InstalledItem, "installedAt">): void {
  const list = getInstalledItems().filter((i) => i.id !== entry.id);
  list.unshift({ ...entry, installedAt: Date.now() });
  write(list);
}

export function uninstallItem(id: string): void {
  write(getInstalledItems().filter((i) => i.id !== id));
}
