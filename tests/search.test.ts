// @vitest-environment jsdom
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { describe, expect, test } from "vitest";
import { createEditorState } from "../src/lib/editor/setup";

function render(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ state: createEditorState(doc), parent });
  return { parent, view };
}

describe("find and replace", () => {
  test("opens the search panel with the keyboard shortcut", () => {
    const { parent, view } = render("hello world");

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
    );

    expect(parent.querySelector(".cm-search")).not.toBeNull();
    view.destroy();
    parent.remove();
  });

  test("opens the search panel programmatically", () => {
    const { parent, view } = render("hello world");

    expect(openSearchPanel(view)).toBe(true);
    expect(parent.querySelector(".cm-search")).not.toBeNull();

    view.destroy();
    parent.remove();
  });
});
