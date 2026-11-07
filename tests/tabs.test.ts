import { beforeEach, describe, expect, test, vi } from "vitest";
import * as ipc from "../src/lib/ipc";
import { tabs } from "../src/lib/state/tabs.svelte";

vi.mock("../src/lib/ipc", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

const readFile = vi.mocked(ipc.readFile);
const writeFile = vi.mocked(ipc.writeFile);
const saveFileAs = vi.mocked(ipc.saveFileAs);

function file(text = "# hi\n", mtimeMs = 1) {
  return { text, eol: "lf" as const, mtimeMs };
}

beforeEach(() => {
  vi.clearAllMocks();
  tabs.tabs = [];
  tabs.activePath = null;
  tabs.error = null;
  tabs.status = "";
});

describe("tabs store", () => {
  test("opens a file and keeps its content in an editor state", async () => {
    readFile.mockResolvedValue(file());
    await tabs.open("/w/a.md");

    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.activePath).toBe("/w/a.md");
    expect(tabs.state("/w/a.md")?.doc.toString()).toBe("# hi\n");
  });

  test("refuses to close a dirty tab whose file is missing", async () => {
    readFile.mockResolvedValue(file());
    await tabs.open("/w/a.md");

    const tab = tabs.find("/w/a.md")!;
    tab.dirty = true;
    tab.missing = true;

    expect(await tabs.close("/w/a.md")).toBe(false);
    expect(tabs.find("/w/a.md")).toBeDefined();
    expect(tabs.error).toContain("另存为");
  });

  test("keeps the tab open when saving fails", async () => {
    readFile.mockResolvedValue(file());
    writeFile.mockRejectedValue("io: disk full");
    await tabs.open("/w/a.md");

    tabs.find("/w/a.md")!.dirty = true;

    expect(await tabs.close("/w/a.md")).toBe(false);
    expect(tabs.find("/w/a.md")).toBeDefined();
  });

  test("save-as rebinds the tab to the new path", async () => {
    readFile.mockResolvedValue(file("body\n"));
    saveFileAs.mockResolvedValue(42);
    await tabs.open("/w/a.md");

    tabs.find("/w/a.md")!.dirty = true;

    expect(await tabs.saveAs("/w/a.md", "/w/b.md")).toBe(true);
    expect(tabs.find("/w/a.md")).toBeUndefined();
    expect(tabs.find("/w/b.md")).toBeDefined();
    expect(tabs.activePath).toBe("/w/b.md");
    expect(tabs.find("/w/b.md")!.mtimeMs).toBe(42);
    expect(tabs.find("/w/b.md")!.dirty).toBe(false);
  });

  test("retarget rewrites tabs under a renamed directory", async () => {
    readFile.mockImplementation(async (path: string) => file(`# ${path}\n`));
    await tabs.open("/w/dir/a.md");
    await tabs.open("/w/dir/sub/b.md");

    tabs.retarget("/w/dir", "/w/renamed");

    expect(tabs.find("/w/renamed/a.md")).toBeDefined();
    expect(tabs.find("/w/renamed/sub/b.md")).toBeDefined();
    expect(tabs.find("/w/dir/a.md")).toBeUndefined();
  });

  test("marks a tab missing only for not-found errors", async () => {
    readFile.mockResolvedValue(file());
    await tabs.open("/w/a.md");

    readFile.mockRejectedValueOnce("not-found: gone");
    await tabs.handleFsChanged(["/w/a.md"]);
    expect(tabs.find("/w/a.md")!.missing).toBe(true);

    readFile.mockResolvedValue(file());
    await tabs.open("/w/b.md");
    readFile.mockRejectedValueOnce("too-large: big");
    await tabs.handleFsChanged(["/w/b.md"]);
    expect(tabs.find("/w/b.md")!.missing).toBe(false);
    expect(tabs.find("/w/b.md")!.error).toContain("too-large");
  });
});
