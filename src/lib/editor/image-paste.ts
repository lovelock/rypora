import { EditorView } from "@codemirror/view";
import { saveAttachment } from "../ipc";
import { attachmentName, imageMarkdown, MAX_ATTACHMENT_SIZE } from "./attachment";
import { documentPath } from "./live-preview";

function reportError(message: string): void {
  window.dispatchEvent(new CustomEvent("rypora:error", { detail: { message } }));
}

function firstImage(event: ClipboardEvent): { file: File; mime: string } | null {
  const items = event.clipboardData?.items;
  if (!items) {
    return null;
  }

  for (const item of items) {
    if (!item.type.startsWith("image/") || !attachmentName(item.type)) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      return { file, mime: item.type };
    }
  }
  return null;
}

async function insertImage(
  file: File,
  mime: string,
  notePath: string,
  view: EditorView,
): Promise<void> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    reportError("图片太大（最大 20MB）。");
    return;
  }

  const name = attachmentName(mime);
  if (!name) {
    reportError("不支持的图片格式。");
    return;
  }

  const state = view.state;
  const range = state.selection.main;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const relative = await saveAttachment(notePath, name, bytes);
    if (view.state !== state) {
      reportError("图片已保存，但笔记已切换，未插入。");
      return;
    }

    const text = imageMarkdown(relative);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
      scrollIntoView: true,
    });
    view.focus();
  } catch (error) {
    reportError(`图片保存失败：${String(error)}`);
  }
}

export const imagePaste = EditorView.domEventHandlers({
  paste(event, view) {
    const image = firstImage(event);
    const notePath = view.state.facet(documentPath);
    if (!image || !notePath) {
      return false;
    }

    void insertImage(image.file, image.mime, notePath, view);
    return true;
  },
});
