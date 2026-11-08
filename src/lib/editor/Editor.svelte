<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { tabs } from "../state/tabs.svelte";
  import { createEditorState } from "./setup";
  import { attachmentName, imageMarkdown, MAX_ATTACHMENT_SIZE } from "./attachment";
  import { INSERT_TABLE_EVENT, tableInsertion } from "./table";
  import { saveAttachment } from "../ipc";
  import { findTerm } from "../utils/find-term";

  let host: HTMLDivElement | undefined = $state(undefined);
  let view: EditorView | null = $state(null);
  let currentPath: string | null = null;

  onMount(() => {
    const paste = EditorView.domEventHandlers({
      paste(event: ClipboardEvent, target: EditorView) {
        const image = firstImage(event);
        if (!image || !currentPath) {
          return false;
        }
        void insertImage(image.file, image.mime, currentPath, target);
        return true;
      },
    });

    view = new EditorView({
      state: createEditorState("", [paste]),
      parent: host!,
    });
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener(INSERT_TABLE_EVENT, handleInsertTable);
  });

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
    target: EditorView,
  ): Promise<void> {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      tabs.error = "图片太大（最大 20MB）。";
      return;
    }

    const name = attachmentName(mime);
    if (!name) {
      tabs.error = "不支持的图片格式。";
      return;
    }

    const state = target.state;
    const range = state.selection.main;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const relative = await saveAttachment(notePath, name, bytes);
      if (!view || view.state !== state || currentPath !== notePath) {
        tabs.error = "图片已保存，但笔记已切换，未插入。";
        return;
      }

      const text = imageMarkdown(relative);
      target.dispatch({
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from + text.length },
        scrollIntoView: true,
      });
      target.focus();
    } catch (error) {
      tabs.error = `图片保存失败：${String(error)}`;
    }
  }

  function handleInsertTable(event: Event): void {
    const detail = (event as CustomEvent<{ rows?: number; columns?: number }>).detail;
    if (!view || !detail || typeof detail.rows !== "number" || typeof detail.columns !== "number") {
      return;
    }

    const { from, to } = view.state.selection.main;
    const insertion = tableInsertion(view.state.doc, from, to, detail.rows, detail.columns);
    view.dispatch({
      changes: insertion.changes,
      selection: { anchor: insertion.anchor },
      scrollIntoView: true,
    });
    view.focus();
  }

  function handleScroll(): void {
    if (view && currentPath) {
      tabs.setScroll(currentPath, view.scrollDOM.scrollTop);
    }
  }

  onDestroy(() => {
    if (view && currentPath) {
      tabs.capture(currentPath, view.state, view.scrollDOM.scrollTop);
    }
    view?.scrollDOM.removeEventListener("scroll", handleScroll);
    window.removeEventListener(INSERT_TABLE_EVENT, handleInsertTable);
    view?.destroy();
    view = null;
  });

  $effect(() => {
    const path = tabs.activePath;
    const version = tabs.loadedVersion;

    if (!view) {
      return;
    }

    if (currentPath && currentPath !== path) {
      tabs.capture(currentPath, view.state, view.scrollDOM.scrollTop);
      if (tabs.find(currentPath)?.dirty) {
        void tabs.save(currentPath);
      }
    }

    if (!path) {
      currentPath = null;
      return;
    }

    const state = tabs.state(path);
    if (!state) {
      return;
    }

    if (currentPath !== path || (view.state !== state && !view.composing)) {
      currentPath = path;
      view.setState(state);
      tabs.syncCursor(path, state);
      const scroll = untrack(() => tabs.scrollOf(path));
      requestAnimationFrame(() => {
        if (!view) {
          return;
        }
        if (scroll > 0) {
          view.scrollDOM.scrollTop = scroll;
        }
        view.focus();
      });
    }

    const jump = tabs.takeJump(path);
    if (jump && view.state === state) {
      const offset = findTerm(view.state.doc.toString(), jump.term);
      let position = offset;
      if (position === null) {
        const line = Math.min(Math.max(jump.line, 1), view.state.doc.lines);
        position = view.state.doc.line(line).from;
      }
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      view.focus();
    }
  });
</script>

<div class="editor-host" bind:this={host}></div>

<style>
  .editor-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.editor-host .cm-editor) {
    height: 100%;
  }
</style>
