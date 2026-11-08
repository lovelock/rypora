// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, test, vi } from "vitest";

const { saveAttachment } = vi.hoisted(() => ({ saveAttachment: vi.fn() }));
vi.mock("../src/lib/ipc", () => ({ saveAttachment }));

import { documentPath } from "../src/lib/editor/live-preview";
import { createEditorState } from "../src/lib/editor/setup";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [] as unknown as DOMRectList,
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
});

function render(doc = "hello") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: createEditorState(doc, [documentPath.of("/w/notes/a.md")]),
    parent,
  });
  return { parent, view };
}

function pasteEvent(
  items: Array<{ type: string; getAsFile: () => File | null }>,
): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { items, getData: () => "", types: [] },
  });
  return event;
}

describe("image paste", () => {
  test("saves the image and inserts a link", async () => {
    saveAttachment.mockResolvedValue("assets/pasted-1.png");
    const { parent, view } = render();
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

    view.contentDOM.dispatchEvent(pasteEvent([{ type: "image/png", getAsFile: () => file }]));

    await vi.waitFor(() => expect(saveAttachment).toHaveBeenCalled());
    expect(saveAttachment.mock.calls[0][0]).toBe("/w/notes/a.md");
    expect(view.state.doc.toString()).toContain("![](assets/pasted-1.png)");

    view.destroy();
    parent.remove();
  });

  test("ignores non-image clipboard data", () => {
    saveAttachment.mockClear();
    const { parent, view } = render();

    view.contentDOM.dispatchEvent(pasteEvent([{ type: "text/plain", getAsFile: () => null }]));

    expect(saveAttachment).not.toHaveBeenCalled();
    view.destroy();
    parent.remove();
  });
});
