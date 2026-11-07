import { describe, expect, test } from "vitest";
import { basename, parentDirectory, resolveRelative } from "../src/lib/utils/paths";

describe("resolveRelative", () => {
  test("resolves parent directories", () => {
    expect(resolveRelative("/w/notes/a.md", "../img/x.png")).toBe("/w/img/x.png");
  });

  test("resolves current directory", () => {
    expect(resolveRelative("/w/notes/a.md", "./x.png")).toBe("/w/notes/x.png");
  });

  test("keeps absolute paths", () => {
    expect(resolveRelative("/w/notes/a.md", "/abs/x.png")).toBe("/abs/x.png");
  });

  test("strips anchors from relative links", () => {
    expect(resolveRelative("/w/notes/a.md", "../b.md#section")).toBe("/w/b.md");
  });

  test("keeps urls untouched", () => {
    expect(resolveRelative("/w/notes/a.md", "https://example.com/a.md")).toBe(
      "https://example.com/a.md",
    );
  });
});

describe("parentDirectory", () => {
  test("returns the containing directory", () => {
    expect(parentDirectory("/w/notes/a.md")).toBe("/w/notes");
  });

  test("returns root for top-level paths", () => {
    expect(parentDirectory("/a.md")).toBe("/");
  });

  test("handles Windows separators", () => {
    expect(parentDirectory("C:\\w\\notes\\a.md")).toBe("C:\\w\\notes");
    expect(parentDirectory("C:\\a.md")).toBe("C:\\");
  });
});

describe("basename", () => {
  test("handles Windows separators", () => {
    expect(basename("C:\\w\\notes\\a.md")).toBe("a.md");
  });
});
