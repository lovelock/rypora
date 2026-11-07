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

export function newEntryParent(
  root: string,
  selectedPath: string | null,
  selectedIsDir: boolean,
): string {
  if (!selectedPath) {
    return root;
  }
  return selectedIsDir ? selectedPath : parentDirectory(selectedPath);
}
