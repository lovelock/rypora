// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

import { buildPrintDocument, printDocument } from "../src/lib/print/document";
import { highlightCodeBlocks } from "../src/lib/print/highlight";
import { renderMarkdownHtml } from "../src/lib/markdown/render";

describe("renderMarkdownHtml", () => {
  test("renders headings, lists and tables", () => {
    const html = renderMarkdownHtml(
      "# Title\n\n- a\n- b\n\n| x | y |\n| - | - |\n| 1 | 2 |\n",
      "/w/a.md",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<table>");
  });

  test("removes scripts and event handlers", () => {
    const html = renderMarkdownHtml(
      '<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">',
      "/w/a.md",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  test("removes javascript urls and inline styles", () => {
    const html = renderMarkdownHtml(
      '[x](javascript:alert(1))\n\n<p style="position:fixed">x</p>',
      "/w/a.md",
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("style=");
  });

  test("keeps task-list checkboxes", () => {
    const html = renderMarkdownHtml("- [x] done\n- [ ] todo\n", "/w/a.md");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  test("rewrites relative image paths", () => {
    const html = renderMarkdownHtml("![x](img/x.png)", "/w/notes/a.md");
    expect(html).toContain("asset://");
    expect(html).toContain("/w/notes/img/x.png");
  });

  test("rewrites absolute Windows image paths", () => {
    const html = renderMarkdownHtml("![x](C:\\pics\\a.png)", "C:\\w\\a.md");
    expect(html).toContain("asset://");
    expect(html.toLowerCase()).toContain("pics");
  });

  test("keeps absolute image urls untouched", () => {
    const html = renderMarkdownHtml("![x](https://example.com/a.png)", "/w/a.md");
    expect(html).toContain('src="https://example.com/a.png"');
  });

  test("keeps the fenced code language", () => {
    const html = renderMarkdownHtml("```js\nconst a = 1;\n```", "/w/a.md");
    expect(html).toContain('class="language-js"');
  });
});

describe("highlightCodeBlocks", () => {
  test("adds token spans to fenced code", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<pre><code class="language-js">const a = 1;</code></pre>';

    await highlightCodeBlocks(root);

    expect(root.querySelector(".tok-keyword, .tok-variableName, .tok-number")).not.toBeNull();
  });
});

describe("print document lifecycle", () => {
  beforeEach(() => {
    document.title = "Original";
    document.documentElement.classList.remove("printing");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.querySelectorAll(".print-root").forEach((node) => node.remove());
    document.documentElement.classList.remove("printing");
    document.title = "Original";
  });

  test("builds a print root with highlighted code", async () => {
    const article = await buildPrintDocument("```js\nconst a = 1;\n```", "/w/a.md");
    expect(article.className).toBe("print-root");
    expect(article.querySelector(".tok-keyword, .tok-variableName")).not.toBeNull();
  });

  test("prints, then cleans up on afterprint", async () => {
    const printed = vi.spyOn(window, "print").mockImplementation(() => {});
    const article = await buildPrintDocument("# Note", "/w/a.md");

    const ok = await printDocument(article, "Note");

    expect(ok).toBe(true);
    expect(printed).toHaveBeenCalledTimes(1);
    expect(document.body.contains(article)).toBe(true);
    expect(document.documentElement.classList.contains("printing")).toBe(true);
    expect(document.title).toBe("Note");

    window.dispatchEvent(new Event("afterprint"));

    expect(document.body.contains(article)).toBe(false);
    expect(document.documentElement.classList.contains("printing")).toBe(false);
    expect(document.title).toBe("Original");
  });

  test("cleans up when printing throws", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("no printer");
    });
    const article = await buildPrintDocument("# Note", "/w/a.md");

    expect(await printDocument(article, "Note")).toBe(false);
    expect(document.body.contains(article)).toBe(false);
    expect(document.documentElement.classList.contains("printing")).toBe(false);
    expect(document.title).toBe("Original");
  });

  test("cleans up when afterprint never fires", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "print").mockImplementation(() => {});
    const article = await buildPrintDocument("# Note", "/w/a.md");

    await printDocument(article, "Note");
    vi.advanceTimersByTime(60_000);

    expect(document.body.contains(article)).toBe(false);
    expect(document.title).toBe("Original");
  });
});
