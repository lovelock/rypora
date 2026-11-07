// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { livePreview } from "../src/lib/editor/live-preview";

const { copyText } = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("../src/lib/utils/clipboard", () => ({ copyText }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

let view: EditorView | undefined;
let parent: HTMLDivElement;

function render(doc: string): HTMLElement {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), livePreview()],
  });
  ensureSyntaxTree(state, state.doc.length, 1000);
  view = new EditorView({ state, parent });
  return parent;
}

beforeEach(() => {
  copyText.mockReset();
  copyText.mockResolvedValue(true);
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  parent?.remove();
});

describe("code block copy button", () => {
  test("renders a copy button", () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("复制");
  });

  test("copies the code without fences and shows feedback", async () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledWith("fn main() {}"));
    expect(button.textContent).toBe("已复制");
  });

  test("shows failure feedback when copying fails", async () => {
    copyText.mockResolvedValue(false);
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("复制失败"));
  });

  test("does not copy twice while feedback is showing", async () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    button.click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledTimes(1));
  });

  test("still renders a button for an empty code block", () => {
    const root = render("```\n```\n\n");
    expect(root.querySelector(".cm-preview-copy")).not.toBeNull();
  });
});
