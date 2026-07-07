const { app, BrowserWindow, shell, Menu, Tray, ipcMain, screen, session, desktopCapturer, Notification, globalShortcut, nativeImage } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const isDev = !app.isPackaged;

// The desktop app is a thin shell around the deployed web app — it loads the
// live site (not a bundled static export, which the app's API routes can't be
// exported into). CRECOARD_URL overrides the target (e.g. a staging deploy).
const BASE_URL = isDev
  ? "http://localhost:3000"
  : (process.env.CRECOARD_URL || "https://crecoard.com");

// Some GPU/driver combos refuse to composite hardware-accelerated windows that
// are re-parented into the desktop's WorkerW layer (wallpaper mode renders
// black). Setting CRECOARD_WALLPAPER_SOFTWARE=1 falls back to software
// rendering app-wide, which those setups can composite.
if (process.env.CRECOARD_WALLPAPER_SOFTWARE === "1") {
  app.disableHardwareAcceleration();
  console.log("[wallpaper] hardware acceleration disabled (CRECOARD_WALLPAPER_SOFTWARE=1)");
}

let mainWindow;
let tray = null;
let captureWindow = null;
let isQuitting = false;
let startMainHidden = false; // when opening a pop-out first on startup, keep main in the tray

// ─── Deep links (crecoard://) — OAuth handoff from the system browser ─────────
// Sign-in opens the user's real browser; Supabase redirects back to
// crecoard://auth?... which Windows routes to this app.
const PROTOCOL = "crecoard";
if (isDev && process.platform === "win32") {
  // Unpackaged dev: register "electron.exe <app path>" as the protocol handler
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

let pendingDeepLink = null; // cold start: hold the link until the window is ready

function handleDeepLink(url) {
  if (!url || !url.startsWith(`${PROTOCOL}://`)) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("deep-link", url);
  } else {
    pendingDeepLink = url;
  }
}

// Windows delivers deep links to the second instance's argv — forward and quit
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // A relaunch (e.g. clicking the app while it's in the tray) surfaces the window.
    showMainWindow();
    handleDeepLink(argv.find((a) => typeof a === "string" && a.startsWith(`${PROTOCOL}://`)));
  });
  app.on("open-url", (event, url) => { // macOS
    event.preventDefault();
    handleDeepLink(url);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#1a1b1e",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Keep the renderer's timers at full rate when hidden to the tray, so the
      // reminder poller keeps firing with no window open.
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.loadURL(BASE_URL);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    // "Open pop-out at startup" keeps the main window in the tray so the pop-out
    // is what the user sees first.
    if (!startMainHidden) mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // Cold-start deep link (app launched BY the crecoard:// link)
  mainWindow.webContents.once("did-finish-load", () => {
    const argvLink = process.argv.find((a) => typeof a === "string" && a.startsWith(`${PROTOCOL}://`));
    const link = pendingDeepLink ?? argvLink;
    pendingDeepLink = null;
    if (link) mainWindow.webContents.send("deep-link", link);
  });

  // Open external links in the default browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Close = hide to tray (keep running); real quit is via the tray menu.
  mainWindow.on("close", (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("open-external", (_event, url) => {
  // http(s) only — never shell-execute arbitrary strings from the renderer
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
});

// ─── Native reminder notifications ────────────────────────────────────────────
// The renderer polls the user's due reminders (see DesktopReminders.tsx) and
// calls this to surface each as an OS toast. Clicking it focuses the app and
// tells the renderer where to navigate.
ipcMain.handle("notify", (_event, payload) => {
  try {
    if (!Notification.isSupported()) return { ok: false, error: "notifications unsupported" };
    const title = typeof payload?.title === "string" && payload.title ? payload.title : "Reminder";
    const body = typeof payload?.body === "string" ? payload.body : "";
    const url = typeof payload?.url === "string" ? payload.url : null;
    const n = new Notification({ title, body, icon: path.join(__dirname, "../assets/icon.png") });
    n.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (url) mainWindow.webContents.send("reminder-click", url);
    });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("window-minimize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle("window-maximize-toggle", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle("window-is-maximized", () => {
  const win = BrowserWindow.getFocusedWindow();
  return !!win?.isMaximized();
});

ipcMain.handle("window-close", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

// ─── Pop-out board window ─────────────────────────────────────────────────────
// A plain, resizable, borderless window that shows a board with its functions.
// No desktop-shell integration — just a normal floating window. Light and simple.
let popoutWindow = null;

const fs = require("fs");
function castStateFile() { return path.join(app.getPath("userData"), "popout.json"); }
function savePopoutState(boardId, sizeState) {
  try {
    if (boardId) fs.writeFileSync(castStateFile(), JSON.stringify({ boardId, ...sizeState }));
    else fs.rmSync(castStateFile(), { force: true });
  } catch {}
}
function readPopoutState() {
  try { return JSON.parse(fs.readFileSync(castStateFile(), "utf8")); } catch { return null; }
}

// Small persisted app settings (startup preferences).
function settingsFile() { return path.join(app.getPath("userData"), "settings.json"); }
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; } }
function writeSettings(patch) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); } catch {}
}

function destroyPopoutWindow() {
  if (popoutWindow) {
    try { popoutWindow.destroy(); } catch {}
    popoutWindow = null;
  }
}

function createPopoutWindow(boardId, saved) {
  destroyPopoutWindow();

  popoutWindow = new BrowserWindow({
    width: saved?.width ?? 1000,
    height: saved?.height ?? 680,
    x: saved?.x, y: saved?.y,
    minWidth: 360, minHeight: 280,
    frame: false,       // borderless
    resizable: true,    // ← the whole point
    movable: true,
    skipTaskbar: false, // it's a real window; show it in the taskbar
    backgroundColor: "#0d0e11",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false, // keep live wallpapers / visualizers animating while occluded
    },
  });

  const q = `board=${encodeURIComponent(boardId ?? "")}&popout=1`;
  popoutWindow.loadURL(`${BASE_URL}/wallpaper?${q}`);
  popoutWindow.maximize(); // open full-screen for an immersive board (user can unmaximize)

  popoutWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[popout] page failed to load (${code} ${desc}) ${url}`);
  });

  // Persist size/position so the pop-out reopens where you left it
  const persist = () => {
    if (!popoutWindow) return;
    const b = popoutWindow.getBounds();
    savePopoutState(boardId ?? null, { x: b.x, y: b.y, width: b.width, height: b.height });
  };
  popoutWindow.on("resize", persist);
  popoutWindow.on("move", persist);
  popoutWindow.on("closed", () => { popoutWindow = null; });

  savePopoutState(boardId ?? null, saved);
  if (boardId) writeSettings({ lastPopoutBoardId: boardId }); // remember for "open pop-out at startup"
  console.log("[popout] board window opened");
  return { ok: true };
}

// IPC names unchanged so preload / TopBar need no edits.
ipcMain.handle("wallpaper-set", (_event, boardId) => createPopoutWindow(boardId, readPopoutState()));
ipcMain.handle("wallpaper-clear", () => {
  destroyPopoutWindow();
  savePopoutState(null);
  // If the main window was hidden for a pop-out-first startup, surface it now so
  // closing the pop-out doesn't leave the user with only the tray.
  if (mainWindow && !mainWindow.isVisible()) showMainWindow();
  return { ok: true };
});
ipcMain.handle("wallpaper-active", () => !!popoutWindow);
// Frameless windows have no OS controls — the page's close button calls this.
ipcMain.handle("popout-minimize", () => { popoutWindow?.minimize(); });
ipcMain.handle("popout-toggle-top", () => {
  if (!popoutWindow) return false;
  const next = !popoutWindow.isAlwaysOnTop();
  popoutWindow.setAlwaysOnTop(next);
  return next;
});

// ─── Tray + background running ────────────────────────────────────────────────
// Closing the main window hides it to the tray (see the window "close" handler)
// so the app keeps running; the renderer's reminder poller stays alive
// (backgroundThrottling:false) and fires reminders with no window open.
function showMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function autoLaunchEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: [] });
  updateTrayMenu();
}

function popoutOnStartupEnabled() { return readSettings().popoutOnStartup === true; }
function setPopoutOnStartup(enabled) { writeSettings({ popoutOnStartup: enabled }); updateTrayMenu(); }

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Crecoard", click: showMainWindow },
    { label: "Quick capture", accelerator: "CommandOrControl+Shift+Space", click: openCaptureWindow },
    { type: "separator" },
    { label: "Launch at startup", type: "checkbox", checked: autoLaunchEnabled(), click: (item) => setAutoLaunch(item.checked) },
    { label: "Open pop-out at startup", type: "checkbox", checked: popoutOnStartupEnabled(), click: (item) => setPopoutOnStartup(item.checked) },
    { type: "separator" },
    { label: "Quit Crecoard", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function buildTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, "../assets/icon.png"));
    tray = new Tray(process.platform === "win32" ? img.resize({ width: 16, height: 16 }) : img);
    tray.setToolTip("Crecoard");
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
    updateTrayMenu();
  } catch (e) {
    console.error("[tray] failed to create:", e);
  }
}

// ─── Global quick-capture ─────────────────────────────────────────────────────
// Ctrl/Cmd+Shift+Space opens a small always-on-top popup to jot a reminder from
// any app. It loads /capture, which creates the reminder and calls capture-close.
function openCaptureWindow() {
  if (captureWindow) { captureWindow.show(); captureWindow.focus(); return; }
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  captureWindow = new BrowserWindow({
    width: 480, height: 214,
    x: Math.round((width - 480) / 2), y: 150,
    frame: false, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: "#0d0e11",
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  captureWindow.loadURL(`${BASE_URL}/capture`);
  let ready = false;
  captureWindow.once("ready-to-show", () => {
    captureWindow.show();
    captureWindow.focus();
    setTimeout(() => { ready = true; }, 250);
  });
  captureWindow.on("blur", () => { if (ready && captureWindow) captureWindow.close(); });
  captureWindow.on("closed", () => { captureWindow = null; });
}

ipcMain.handle("capture-close", () => { if (captureWindow) captureWindow.close(); });

// ─── Auto-update ──────────────────────────────────────────────────────────────
// Checks the GitHub Releases feed (see build.publish) for a newer version,
// downloads it in the background, and installs on quit — with a notify-to-restart
// nudge. Only runs in the packaged app (electron-updater is disabled in dev).
function setupAutoUpdate() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: "Crecoard update ready",
      body: `Version ${info?.version ?? ""} installs on restart — click to restart now.`,
      icon: path.join(__dirname, "../assets/icon.png"),
    });
    n.on("click", () => { isQuitting = true; autoUpdater.quitAndInstall(); });
    n.show();
  });
  autoUpdater.on("error", (err) => console.error("[updater]", err?.message || err));
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error("[updater] check failed:", e?.message || e));
  check();
  setInterval(check, 6 * 60 * 60_000); // re-check every 6h (the app runs in the background)
}

app.on("before-quit", () => { isQuitting = true; destroyPopoutWindow(); });
app.on("will-quit", () => globalShortcut.unregisterAll());

app.whenReady().then(() => {
  // Windows groups notifications/taskbar by AppUserModelID — match the packaged
  // appId so reminder toasts show as "Crecoard", not the Electron default.
  if (process.platform === "win32") app.setAppUserModelId("com.plancraft.app");

  // Allow the app's own pages to use the mic / audio capture (the Visualizer item).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "audioCapture" || permission === "display-capture");
  });

  // System-audio Visualizer: auto-answer getDisplayMedia with the primary screen
  // (video, immediately discarded by the renderer) + Windows loopback audio —
  // so it visualizes whatever is playing on the PC, with no screen-share picker.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: process.platform === "win32" ? "loopback" : undefined }))
      .catch(() => callback({}));
  }, { useSystemPicker: false });

  // Decide the startup pop-out BEFORE creating the main window (ready-to-show reads
  // startMainHidden): the board open at quit, or — when "open pop-out at startup"
  // is on — the last board you popped out. When popping out on startup, keep the
  // main window in the tray so the pop-out is what you see first.
  const savedPopout = readPopoutState();
  const settings = readSettings();
  const startupBoardId = savedPopout?.boardId || (settings.popoutOnStartup ? settings.lastPopoutBoardId : null);
  startMainHidden = !!(settings.popoutOnStartup && startupBoardId);

  createWindow();
  Menu.setApplicationMenu(null);
  buildTray();
  globalShortcut.register("CommandOrControl+Shift+Space", openCaptureWindow);
  setupAutoUpdate();

  if (startupBoardId) {
    setTimeout(() => createPopoutWindow(startupBoardId, savedPopout), 1500);
  }
});

app.on("window-all-closed", () => {
  // With the tray present the app intentionally keeps running in the background;
  // only quit here as a fallback if the tray failed to initialize.
  if (!tray && process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});
