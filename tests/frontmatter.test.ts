// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { describe, expect, test, vi } from "vitest";
import { renderMarkdownHtml } from "../src/lib/markdown/render";
import { frontmatterRange, stripFrontmatter } from "../src/lib/utils/frontmatter";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

function range(markdown: string) {
  return frontmatterRange(EditorState.create({ doc: markdown }).doc);
}

describe("frontmatterRange", () => {
  test("finds a leading YAML block", () => {
    expect(range("---\ntitle: x\n---\n\nbody")).toEqual({ from: 0, to: 16 });
  });

  test("ignores an unclosed block", () => {
    expect(range("---\ntitle: x\n\nbody")).toBeNull();
  });

  test("ignores a rule that is not at the start", () => {
    expect(range("body\n\n---\ntitle: x\n---")).toBeNull();
  });

  test("does not treat a document that starts with a rule as frontmatter", () => {
    expect(range("---\n\n# Title\n\ntext\n\n---\n\nMore")).toBeNull();
  });

  test("does not treat markdown between two rules as frontmatter", () => {
    expect(range("---\n# Title\n---\n\nbody")).toBeNull();
  });

  test("ignores a block after a leading blank line", () => {
    expect(range("\n---\ntitle: x\n---")).toBeNull();
  });
});

describe("stripFrontmatter", () => {
  test("removes the leading block", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\n\nbody")).toBe("body");
  });

  test("keeps documents without frontmatter", () => {
    expect(stripFrontmatter("# Hi\n\nbody")).toBe("# Hi\n\nbody");
  });

  test("handles CRLF", () => {
    expect(stripFrontmatter("---\r\ntitle: x\r\n---\r\n\r\nbody")).toBe("body");
  });
});

describe("print rendering", () => {
  test("does not print frontmatter as a heading or rule", () => {
    const html = renderMarkdownHtml("---\ntitle: x\n---\n\n# Hi", "/w/a.md");

    expect(html).not.toContain("title: x");
    expect(html).not.toContain("<hr>");
    expect(html).toContain("<h1>Hi</h1>");
  });

  test("keeps a document that starts with a rule intact", () => {
    const html = renderMarkdownHtml("---\n\n# Title\n\ntext\n\n---\n\nMore", "/w/a.md");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<hr>");
    expect(html).toContain("More");
  });
});
