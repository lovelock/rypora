// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { applyPlatform, detectPlatform } from "../src/lib/utils/platform";

describe("detectPlatform", () => {
  test("detects macOS", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
  });

  test("detects Windows", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
  });

  test("detects Linux", () => {
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  test("falls back to linux for unknown UA", () => {
    expect(detectPlatform("SomeBot/1.0")).toBe("linux");
  });
});

describe("applyPlatform", () => {
  test("writes data-platform and returns it", () => {
    const root = document.createElement("html");
    expect(applyPlatform(root, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(root.dataset.platform).toBe("windows");
  });
});
