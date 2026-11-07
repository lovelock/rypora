import { describe, expect, test } from "vitest";
import { findTerm } from "../src/lib/utils/find-term";

describe("findTerm", () => {
  test("finds a chinese term by utf-16 offset", () => {
    expect(findTerm("a\n笔记", "笔记")).toBe(2);
  });

  test("is case insensitive", () => {
    expect(findTerm("Hello World", "hello")).toBe(0);
    expect(findTerm("Hello World", "WORLD")).toBe(6);
  });

  test("returns null when the term is missing", () => {
    expect(findTerm("abc", "zzz")).toBeNull();
    expect(findTerm("abc", "")).toBeNull();
  });
});
