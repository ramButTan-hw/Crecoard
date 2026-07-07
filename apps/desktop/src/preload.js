const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window-maximize-toggle"),
  isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  // Pop-out board window (a plain resizable borderless window)
  setWallpaperBoard: (boardId) => ipcRenderer.invoke("wallpaper-set", boardId),
  clearWallpaper: () => ipcRenderer.invoke("wallpaper-clear"),
  isWallpaperActive: () => ipcRenderer.invoke("wallpaper-active"),
  popoutMinimize: () => ipcRenderer.invoke("popout-minimize"),
  popoutToggleTop: () => ipcRenderer.invoke("popout-toggle-top"),
  // Deep links (crecoard://) — used for browser-based OAuth handoff
  onDeepLink: (cb) => {
    const listener = (_event, url) => cb(url);
    ipcRenderer.on("deep-link", listener);
    return () => ipcRenderer.removeListener("deep-link", listener);
  },
  // Quick-capture popup closes itself after saving (or on Esc).
  closeCapture: () => ipcRenderer.invoke("capture-close"),
  // Native OS notifications (reminders). notify() shows a system toast; the
  // onReminderClick callback fires with the reminder's link when it's clicked.
  notify: (payload) => ipcRenderer.invoke("notify", payload),
  onReminderClick: (cb) => {
    const listener = (_event, url) => cb(url);
    ipcRenderer.on("reminder-click", listener);
    return () => ipcRenderer.removeListener("reminder-click", listener);
  },
});
