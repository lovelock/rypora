import { describe, expect, test } from "vitest";
import { splitByIndices } from "../src/lib/utils/highlight";

describe("splitByIndices", () => {
  test("marks single hit characters", () => {
    expect(splitByIndices("abc", [1])).toEqual([
      { text: "a", hit: false },
      { text: "b", hit: true },
      { text: "c", hit: false },
    ]);
  });

  test("returns the whole string when there are no indices", () => {
    expect(splitByIndices("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });

  test("merges consecutive hits", () => {
    expect(splitByIndices("abcd", [1, 2])).toEqual([
      { text: "a", hit: false },
      { text: "bc", hit: true },
      { text: "d", hit: false },
    ]);
  });

  test("ignores out of range indices and duplicates", () => {
    expect(splitByIndices("ab", [0, 0, 9])).toEqual([
      { text: "a", hit: true },
      { text: "b", hit: false },
    ]);
  });

  test("handles unicode by code point", () => {
    expect(splitByIndices("笔记", [1])).toEqual([
      { text: "笔", hit: false },
      { text: "记", hit: true },
    ]);
  });
});
