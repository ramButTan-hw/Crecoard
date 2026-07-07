/**
 * Windows wallpaper-layer attach — no build toolchain required.
 *
 * Re-parents an Electron window into the desktop's WorkerW layer (behind the
 * icons, above the static wallpaper) — the same trick Wallpaper Engine and
 * Lively use. Implemented with koffi (prebuilt N-API FFI; survives Electron
 * upgrades without rebuilds) instead of a compile-on-install native addon.
 *
 * Windows internals:
 *  - Sending Progman the undocumented message 0x052C makes the shell spawn a
 *    WorkerW window that hosts the wallpaper surface.
 *  - Classic (Win10/11 pre-24H2): the wallpaper WorkerW is the *sibling* after
 *    whichever top-level window contains SHELLDLL_DefView.
 *  - Win11 24H2+: the WorkerW (or DefView itself) lives directly under Progman.
 * We try each in order and fall back to Progman itself.
 */

let koffi = null;
try {
  koffi = require("koffi");
} catch (err) {
  console.error("[wallpaper] koffi unavailable:", err.message);
}

let api = null;

function init() {
  if (!koffi) return null;
  if (api) return api;
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  api = {
    GetLastError: kernel32.func("uint __stdcall GetLastError()"),
    SetLastError: kernel32.func("void __stdcall SetLastError(uint err)"),
    GetAncestor: user32.func("intptr __stdcall GetAncestor(intptr hwnd, uint flags)"),
    FindWindowW: user32.func("intptr __stdcall FindWindowW(str16 cls, str16 win)"),
    FindWindowExW: user32.func("intptr __stdcall FindWindowExW(intptr parent, intptr after, str16 cls, str16 win)"),
    SendMessageTimeoutW: user32.func("intptr __stdcall SendMessageTimeoutW(intptr hwnd, uint msg, uintptr wparam, intptr lparam, uint flags, uint timeout, void *result)"),
    SetParent: user32.func("intptr __stdcall SetParent(intptr child, intptr parent)"),
    GetParent: user32.func("intptr __stdcall GetParent(intptr hwnd)"),
    SetWindowPos: user32.func("bool __stdcall SetWindowPos(intptr hwnd, intptr after, int x, int y, int cx, int cy, uint flags)"),
    SystemParametersInfoW: user32.func("bool __stdcall SystemParametersInfoW(uint action, uint param, void *pv, uint winini)"),
    SPIGetPath: user32.func("bool __stdcall SystemParametersInfoW(uint action, uint param, _Out_ uint16 *pv, uint winini)"),
    SPISetPath: user32.func("bool __stdcall SystemParametersInfoW(uint action, uint param, str16 path, uint winini)"),
    EnumProc: koffi.proto("bool __stdcall WallpaperEnumProc(intptr hwnd, intptr lparam)"),
    EnumWindows: user32.func("bool __stdcall EnumWindows(WallpaperEnumProc *cb, intptr lparam)"),
  };
  return api;
}

/** hwnd of an Electron BrowserWindow as a plain integer. */
function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
}

/** Locate (and if needed, spawn) the wallpaper WorkerW layer. Exported for smoke tests. */
function findWallpaperHost() {
  const a = init();
  if (!a) throw new Error("koffi not installed — run npm install in apps/desktop");

  const progman = a.FindWindowW("Progman", null);
  if (!progman) throw new Error("Progman not found (is explorer.exe running?)");
  api.progman = progman;

  // Ask the shell to spawn the wallpaper WorkerW. Two known wParam variants.
  a.SendMessageTimeoutW(progman, 0x052c, 0xd, 0x1, 0x0, 1000, null);
  a.SendMessageTimeoutW(progman, 0x052c, 0, 0, 0x0, 1000, null);

  // Classic layout: WorkerW is the next sibling of the window containing SHELLDLL_DefView
  let workerw = 0;
  const cb = koffi.register((hwnd) => {
    const defView = a.FindWindowExW(hwnd, 0, "SHELLDLL_DefView", null);
    if (defView) {
      const sibling = a.FindWindowExW(0, hwnd, "WorkerW", null);
      if (sibling) workerw = sibling;
    }
    return true; // keep enumerating
  }, koffi.pointer(api.EnumProc));
  try {
    a.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  if (workerw) return { host: workerw, layout: "classic" };

  // Win11 24H2 layout: WorkerW directly under Progman
  const child = a.FindWindowExW(progman, 0, "WorkerW", null);
  if (child) return { host: child, layout: "24h2" };

  // Last resort: parent to Progman itself (icons live in DefView above it)
  return { host: progman, layout: "progman" };
}

// GA_PARENT — GetParent() lies for re-parented top-level windows; GetAncestor doesn't.
const GA_PARENT = 1;

function tryParent(a, hwnd, target, label) {
  a.SetLastError(0);
  const ret = a.SetParent(hwnd, target);
  const err = a.GetLastError();
  const parent = a.GetAncestor(hwnd, GA_PARENT);
  const ok = parent === target;
  console.log(`[wallpaper] SetParent→${label}: ok=${ok} ret=${ret} lastError=${err} ancestorParent=${parent} target=${target}`);
  return ok;
}

function attach(win) {
  const a = init();
  if (!a) throw new Error("koffi not installed — run npm install in apps/desktop");
  const { host, layout } = findWallpaperHost();
  const hwnd = hwndOf(win);

  if (tryParent(a, hwnd, host, `workerw(${layout})`)) {
    console.log(`[wallpaper] attached (layout: ${layout}, host: ${host})`);
    return { host, layout };
  }
  // Fallback: parent directly to Progman (works on layouts where DefView sits under it)
  if (a.progman && a.progman !== host && tryParent(a, hwnd, a.progman, "progman")) {
    console.log(`[wallpaper] attached (layout: progman-fallback, host: ${a.progman})`);
    return { host: a.progman, layout: "progman-fallback" };
  }
  throw new Error("SetParent failed for both WorkerW and Progman — see lastError codes above");
}

/** Is the window still parented into the wallpaper layer? (Chromium can silently revert it.) */
function verify(win) {
  const a = init();
  if (!a) return { attached: false, parent: 0 };
  const parent = a.GetAncestor(hwndOf(win), GA_PARENT);
  return { attached: parent !== 0, parent };
}

/**
 * Force the shell to repaint the user's wallpaper. Reads the current path
 * (SPI_GETDESKWALLPAPER) and re-applies it — a NULL set would replace the
 * user's wallpaper with the Windows default.
 */
function repaint() {
  const a = init();
  if (!a) return;
  try {
    const buf = new Uint16Array(260);
    a.SPIGetPath(0x0073, 260, buf, 0); // SPI_GETDESKWALLPAPER
    const path = Buffer.from(buf.buffer).toString("utf16le").split("\0")[0];
    if (path) a.SPISetPath(0x0014, 0, path, 0); // SPI_SETDESKWALLPAPER
    else a.SystemParametersInfoW(0x0014, 0, null, 0);
  } catch {}
}

function detach(win) {
  const a = init();
  if (!a) return;
  try { a.SetParent(hwndOf(win), 0); } catch {}
  repaint();
}

// ── Cast mode: interactive fullscreen window pinned to the BOTTOM of the ──────
// z-order (the Rainmeter trick). Unlike true wallpaper attach, this window
// receives real input — clicks, typing — while staying behind every other app.
const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10;

function pinBottom(win) {
  const a = init();
  if (!a) return false;
  try {
    return a.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } catch {
    return false;
  }
}

module.exports = { attach, detach, repaint, verify, pinBottom, findWallpaperHost, available: () => !!koffi };
