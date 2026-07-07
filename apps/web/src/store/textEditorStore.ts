import { create } from "zustand";

export interface TextEditorAPI {
  exec: (cmd: string, val?: string) => void;
  wrapSelInStyle: (styles: Record<string, string>) => boolean;
  applyBlockTag: (tag: string, inlineStyles?: Record<string, string>) => void;
  applyBlockStyle: (styles: Record<string, string>) => void;
  insertList: (listTag: "ul" | "ol") => void;
  insertCheckboxLine: () => void;
  insertLink: (url: string) => void;
  applyHighlight: (color: string) => void;
  hasSelection: () => boolean;
}

interface TextEditorStoreState {
  api: TextEditorAPI | null;
  activeItemId: string | null;
  selState: { bold: boolean; italic: boolean; underline: boolean };
  register: (itemId: string, api: TextEditorAPI) => void;
  unregister: (itemId: string) => void;
  setSelState: (s: { bold: boolean; italic: boolean; underline: boolean }) => void;
}

export const useTextEditorStore = create<TextEditorStoreState>((set) => ({
  api: null,
  activeItemId: null,
  selState: { bold: false, italic: false, underline: false },
  register: (activeItemId, api) => set({ api, activeItemId }),
  unregister: (itemId) =>
    set((s) => (s.activeItemId === itemId ? { api: null, activeItemId: null } : s)),
  setSelState: (selState) => set({ selState }),
}));
