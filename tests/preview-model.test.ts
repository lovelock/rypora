import { Text } from "@codemirror/state";
import { GFM, parser } from "@lezer/markdown";
import { describe, expect, test } from "vitest";
import { computeInlineRanges } from "../src/lib/editor/preview-model";

function run(markdown: string, active: number[] = []) {
  const tree = parser.configure(GFM).parse(markdown);
  const doc = Text.of(markdown.split("\n"));
  return computeInlineRanges(tree, doc, new Set(active));
}

describe("computeInlineRanges", () => {
  test("hides heading markers and styles the content", () => {
    const ranges = run("# 标题");
    expect(ranges).toContainEqual({ kind: "hide", from: 0, to: 2 });
    expect(ranges).toContainEqual({
      kind: "style",
      from: 2,
      to: 4,
      cls: "cm-preview-h1",
    });
  });

  test("hides strong markers and styles inner text", () => {
    const ranges = run("**粗体**");
    expect(ranges).toContainEqual({ kind: "hide", from: 0, to: 2 });
    expect(ranges).toContainEqual({ kind: "hide", from: 4, to: 6 });
    expect(ranges).toContainEqual({
      kind: "style",
      from: 2,
      to: 4,
      cls: "cm-preview-strong",
    });
  });

  test("handles emphasis, strikethrough and inline code", () => {
    expect(run("*斜*")).toContainEqual({
      kind: "style",
      from: 1,
      to: 2,
      cls: "cm-preview-em",
    });
    expect(run("~~删~~")).toContainEqual({
      kind: "style",
      from: 2,
      to: 3,
      cls: "cm-preview-strike",
    });
    expect(run("`码`")).toContainEqual({
      kind: "style",
      from: 1,
      to: 2,
      cls: "cm-preview-code",
    });
  });

  test("keeps markers visible on the active line", () => {
    const ranges = run("# 标题", [1]);
    expect(ranges.some((range) => range.kind === "hide")).toBe(false);
  });

  test("leaves plain paragraphs alone", () => {
    expect(run("普通段落")).toEqual([]);
  });

  test("renders nested emphasis inside headings", () => {
    const ranges = run("## **粗体** 标题");
    expect(ranges).toContainEqual({ kind: "hide", from: 0, to: 3 });
    expect(ranges).toContainEqual({ kind: "hide", from: 3, to: 5 });
    expect(ranges).toContainEqual({ kind: "hide", from: 7, to: 9 });
    expect(ranges).toContainEqual({
      kind: "style",
      from: 5,
      to: 7,
      cls: "cm-preview-strong",
    });
  });

  test("renders nested emphasis inside strong", () => {
    const ranges = run("**a *b* c**");
    expect(ranges).toContainEqual({ kind: "hide", from: 0, to: 2 });
    expect(ranges).toContainEqual({ kind: "hide", from: 4, to: 5 });
    expect(ranges).toContainEqual({ kind: "hide", from: 6, to: 7 });
    expect(ranges).toContainEqual({
      kind: "style",
      from: 5,
      to: 6,
      cls: "cm-preview-em",
    });
  });
});
