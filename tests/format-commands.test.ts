import { describe, expect, test } from "vitest";
import { countWords, toggleWrap } from "../src/lib/editor/format-commands";

describe("toggleWrap", () => {
  test("inserts markers for an empty selection", () => {
    expect(toggleWrap("abc", 1, 1, "**")).toEqual({
      changes: { from: 1, to: 1, insert: "****" },
      selection: { anchor: 3, head: 3 },
    });
  });

  test("wraps a selection", () => {
    expect(toggleWrap("word", 0, 4, "**")).toEqual({
      changes: { from: 0, to: 4, insert: "**word**" },
      selection: { anchor: 0, head: 8 },
    });
  });

  test("unwraps an already wrapped selection", () => {
    expect(toggleWrap("**word**", 2, 6, "**")).toEqual({
      changes: { from: 0, to: 8, insert: "word" },
      selection: { anchor: 0, head: 4 },
    });
  });

  test("wraps every line of a multi-line selection", () => {
    expect(toggleWrap("a\nb", 0, 3, "**")).toEqual({
      changes: { from: 0, to: 3, insert: "**a**\n**b**" },
      selection: { anchor: 0, head: 11 },
    });
  });
});

describe("countWords", () => {
  test("counts latin words", () => {
    expect(countWords("hello world")).toBe(2);
  });

  test("counts cjk characters individually", () => {
    expect(countWords("你好世界")).toBe(4);
  });

  test("counts mixed text", () => {
    expect(countWords("hello 世界")).toBe(3);
  });

  test("ignores whitespace", () => {
    expect(countWords("   ")).toBe(0);
  });
});
