// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, test, vi } from "vitest";
import { documentPath, livePreview } from "../src/lib/editor/live-preview";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const SAMPLE = `# 标题

这是**粗体**、*斜体*、~~删除线~~和\`行内代码\`。

- [x] 任务
- [ ] 待办

> 引用

\`\`\`rust
fn main() {
    println!("hi");
}
\`\`\`

![图片](img/demo.png)

[链接](../notes/other.md)

---
`;

describe("livePreview", () => {
  test("builds decorations for a representative document without throwing", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: SAMPLE,
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview(),
        documentPath.of("/tmp/smoke/demo.md"),
      ],
    });
    ensureSyntaxTree(state, state.doc.length, 1000);

    const view = new EditorView({
      state,
      parent,
    });

    expect(view.state.doc.toString()).toBe(SAMPLE);
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    expect(parent.querySelector(".cm-preview-codeblock")).not.toBeNull();
    expect(parent.querySelector(".cm-preview-rule")).not.toBeNull();
    expect(parent.querySelector(".cm-preview-task")).not.toBeNull();
    expect(parent.querySelector(".cm-preview-bullet")).not.toBeNull();

    view.destroy();
    parent.remove();
  });

  test("hides every blockquote marker", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const doc = "> a\n> b\n\nplain";
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown({ base: markdownLanguage }), livePreview()],
    });
    ensureSyntaxTree(state, state.doc.length, 1000);

    const view = new EditorView({ state, parent });

    expect(parent.querySelectorAll(".cm-preview-quote").length).toBe(2);
    expect(parent.querySelector(".cm-content")?.textContent ?? "").not.toContain(">");

    view.destroy();
    parent.remove();
  });

  test("keeps the cursor line editable inside frontmatter", () => {
    const doc = "---\ntitle: x\n---\n\n# Hi";
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor: 5 },
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview(),
        documentPath.of("/tmp/a.md"),
      ],
    });
    ensureSyntaxTree(state, state.doc.length, 1000);
    const view = new EditorView({ state, parent });

    expect(parent.querySelectorAll(".cm-preview-frontmatter").length).toBe(2);
    expect(parent.querySelector(".cm-content")?.textContent ?? "").toContain("title: x");

    view.destroy();
    parent.remove();
  });
});

describe("table preview", () => {
  function render(doc: string, anchor: number) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview(),
        documentPath.of("/tmp/smoke/demo.md"),
      ],
    });
    ensureSyntaxTree(state, state.doc.length, 1000);
    const view = new EditorView({ state, parent });
    return { parent, view };
  }

  const TABLE = "| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 3 |\n| 香蕉 | 5 |\n\n尾行";

  test("renders a table widget when the cursor is outside it", () => {
    const { parent, view } = render(TABLE, TABLE.length);
    const table = parent.querySelector(".cm-preview-table");

    expect(table).not.toBeNull();
    expect(table?.querySelector("table")).not.toBeNull();
    expect(table?.textContent).toContain("苹果");
    expect(parent.querySelector(".cm-content")?.textContent ?? "").not.toContain("| --- |");

    view.destroy();
    parent.remove();
  });

  test("shows the source when the cursor is inside the table", () => {
    const { parent, view } = render(TABLE, 0);

    expect(parent.querySelector(".cm-preview-table")).toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent ?? "").toContain("| --- |");

    view.destroy();
    parent.remove();
  });

  test("switches between source and table as the cursor enters and leaves", () => {
    const { parent, view } = render(TABLE, TABLE.length);
    expect(parent.querySelector(".cm-preview-table")).not.toBeNull();

    view.dispatch({ selection: { anchor: 0 } });
    expect(parent.querySelector(".cm-preview-table")).toBeNull();

    view.dispatch({ selection: { anchor: TABLE.length } });
    expect(parent.querySelector(".cm-preview-table")).not.toBeNull();

    view.destroy();
    parent.remove();
  });

  test("renders a table inside a blockquote", () => {
    const doc = "> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n\n尾行";
    const { parent, view } = render(doc, doc.length);
    const table = parent.querySelector(".cm-preview-table");

    expect(table).not.toBeNull();
    expect(table?.querySelector("table")).not.toBeNull();
    expect(table?.querySelectorAll("td").length).toBe(2);

    view.destroy();
    parent.remove();
  });

  test("clicking jumps to the table position after edits above", () => {
    const { parent, view } = render(TABLE, TABLE.length);
    view.dispatch({ changes: { from: 0, insert: "XXXX\n" } });

    const table = parent.querySelector<HTMLElement>(".cm-preview-table");
    expect(table).not.toBeNull();

    table!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(view.state.selection.main.anchor).toBe("XXXX\n".length);

    view.destroy();
    parent.remove();
  });
});

describe("frontmatter preview", () => {
  test("shows frontmatter as source without a rule or heading", () => {
    const doc = "---\ntitle: x\n---\n\n# Hi";
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview(),
        documentPath.of("/tmp/a.md"),
      ],
    });
    ensureSyntaxTree(state, state.doc.length, 1000);
    const view = new EditorView({ state, parent });

    expect(parent.querySelector(".cm-preview-rule")).toBeNull();
    expect(parent.querySelector(".cm-preview-h2")).toBeNull();
    expect(parent.querySelector(".cm-preview-frontmatter")).not.toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent ?? "").toContain("title: x");

    view.destroy();
    parent.remove();
  });
});
