import type { Platform } from "./platform";
import { parentDirectory } from "./paths";

export type Shortcut = "new-file" | "new-folder" | "open-folder" | "rename";

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchShortcut(event: ShortcutEvent, platform: Platform): Shortcut | null {
  if (event.altKey) {
    return null;
  }

  const mod =
    platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && key === "n") {
    return event.shiftKey ? "new-folder" : "new-file";
  }
  if (mod && !event.shiftKey && key === "o") {
    return "open-folder";
  }
  if (!mod && !event.shiftKey && event.key === "F2") {
    return "rename";
  }
  return null;
}

export interface SelectedEntry {
  path: string;
  isDir: boolean;
}

export function newEntryParent(root: string, selected: SelectedEntry | null): string {
  if (!selected) {
    return root;
  }
  return selected.isDir ? selected.path : parentDirectory(selected.path);
}
