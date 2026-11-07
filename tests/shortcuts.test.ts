import { describe, expect, test } from "vitest";
import { matchShortcut, newEntryParent } from "../src/lib/utils/shortcuts";

function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("matchShortcut", () => {
  test("macOS Cmd+N creates a file", () => {
    expect(matchShortcut(key({ key: "n", metaKey: true }), "macos")).toBe("new-file");
  });

  test("macOS Ctrl+N is left to the editor", () => {
    expect(matchShortcut(key({ key: "n", ctrlKey: true }), "macos")).toBeNull();
  });

  test("macOS Cmd+Shift+N creates a folder", () => {
    expect(matchShortcut(key({ key: "N", metaKey: true, shiftKey: true }), "macos")).toBe(
      "new-folder",
    );
  });

  test("Windows and Linux use Ctrl+N", () => {
    for (const platform of ["windows", "linux"] as const) {
      expect(matchShortcut(key({ key: "n", ctrlKey: true }), platform)).toBe("new-file");
      expect(matchShortcut(key({ key: "n", metaKey: true }), platform)).toBeNull();
    }
  });

  test("Cmd/Ctrl+O opens a folder", () => {
    expect(matchShortcut(key({ key: "o", metaKey: true }), "macos")).toBe("open-folder");
    expect(matchShortcut(key({ key: "o", ctrlKey: true }), "linux")).toBe("open-folder");
  });

  test("F2 renames without a modifier", () => {
    expect(matchShortcut(key({ key: "F2" }), "macos")).toBe("rename");
    expect(matchShortcut(key({ key: "F2", metaKey: true }), "macos")).toBeNull();
  });

  test("Alt disables every shortcut", () => {
    expect(matchShortcut(key({ key: "n", metaKey: true, altKey: true }), "macos")).toBeNull();
  });
});

describe("newEntryParent", () => {
  test("uses the workspace root when nothing is selected", () => {
    expect(newEntryParent("/w", null, false)).toBe("/w");
  });

  test("creates inside a selected directory", () => {
    expect(newEntryParent("/w", "/w/notes", true)).toBe("/w/notes");
  });

  test("creates beside a selected file", () => {
    expect(newEntryParent("/w", "/w/notes/a.md", false)).toBe("/w/notes");
  });
});
