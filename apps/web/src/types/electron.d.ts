export {};

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      openExternal: (url: string) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      isWindowMaximized: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
      // Pop-out board window (a plain resizable borderless window)
      setWallpaperBoard?: (boardId: string) => Promise<{ ok: boolean; error?: string }>;
      clearWallpaper?: () => Promise<{ ok: boolean }>;
      isWallpaperActive?: () => Promise<boolean>;
      popoutMinimize?: () => Promise<void>;
      popoutToggleTop?: () => Promise<boolean>;
      // Deep links (crecoard://) — browser-based OAuth handoff
      onDeepLink?: (cb: (url: string) => void) => () => void;
      // Native OS notifications (reminders)
      notify?: (payload: { title: string; body?: string; url?: string }) => Promise<{ ok: boolean; error?: string }>;
      onReminderClick?: (cb: (url: string) => void) => () => void;
      // Quick-capture popup (closes its own window)
      closeCapture?: () => Promise<void>;
    };
  }
}
