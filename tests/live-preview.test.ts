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
});
