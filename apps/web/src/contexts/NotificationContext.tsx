"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { nanoid } from "nanoid";

export interface ChatToast {
  id: string;
  itemId: string;
  channelName: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  isMention: boolean;
  createdAt: number;
}

interface NotificationContextValue {
  toasts: ChatToast[];
  unread: Record<string, number>;
  push: (n: Omit<ChatToast, "id" | "createdAt">) => void;
  dismiss: (id: string) => void;
  markRead: (itemId: string) => void;
  registerActive: (itemId: string) => void;
  unregisterActive: (itemId: string) => void;
  isActive: (itemId: string) => boolean;
}

const Ctx = createContext<NotificationContextValue>({
  toasts: [],
  unread: {},
  push: () => {},
  dismiss: () => {},
  markRead: () => {},
  registerActive: () => {},
  unregisterActive: () => {},
  isActive: () => false,
});

export function useNotifications() { return useContext(Ctx); }

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts]   = useState<ChatToast[]>([]);
  const [unread, setUnread]   = useState<Record<string, number>>({});
  const activeItems = useRef<Set<string>>(new Set());
  const timers      = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((n: Omit<ChatToast, "id" | "createdAt">) => {
    // Don't toast for items the user is actively viewing
    if (activeItems.current.has(n.itemId)) return;

    const id = nanoid(8);
    const toast: ChatToast = { ...n, id, createdAt: Date.now() };

    setToasts((prev) => {
      // Cap at 5 visible toasts — drop the oldest
      const next = [...prev, toast];
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });

    setUnread((prev) => ({ ...prev, [n.itemId]: (prev[n.itemId] ?? 0) + 1 }));

    // Auto-dismiss after 4 s
    timers.current[id] = setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const markRead = useCallback((itemId: string) => {
    setUnread((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const registerActive   = useCallback((itemId: string) => { activeItems.current.add(itemId); markRead(itemId); }, [markRead]);
  const unregisterActive = useCallback((itemId: string) => { activeItems.current.delete(itemId); }, []);
  const isActive         = useCallback((itemId: string) => activeItems.current.has(itemId), []);

  return (
    <Ctx.Provider value={{ toasts, unread, push, dismiss, markRead, registerActive, unregisterActive, isActive }}>
      {children}
    </Ctx.Provider>
  );
}
