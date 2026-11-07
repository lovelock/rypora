// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));

import { copyText } from "../src/lib/utils/clipboard";

beforeEach(() => {
  vi.restoreAllMocks();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("copyText", () => {
  test("uses the Tauri plugin first", async () => {
    writeText.mockResolvedValue(undefined);
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  test("falls back to navigator.clipboard when the plugin fails", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    const webWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: webWrite },
    });
    expect(await copyText("hello")).toBe(true);
    expect(webWrite).toHaveBeenCalledWith("hello");
  });

  test("falls back to execCommand when clipboard API is missing", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: exec,
    });
    expect(await copyText("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  test("returns false when every strategy fails", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    expect(await copyText("hello")).toBe(false);
  });

  test("copies empty text without throwing", async () => {
    writeText.mockResolvedValue(undefined);
    expect(await copyText("")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });
});
