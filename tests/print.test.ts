// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

import { highlightCodeBlocks } from "../src/lib/print/highlight";
import { renderMarkdownHtml } from "../src/lib/print/markdown";

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

  test("rewrites relative image paths", () => {
    const html = renderMarkdownHtml("![x](img/x.png)", "/w/notes/a.md");
    expect(html).toContain("asset://");
    expect(html).toContain("/w/notes/img/x.png");
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
