<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { tabs } from "../state/tabs.svelte";
  import { createEditorState } from "./setup";
  import { tableInsertion } from "./table";
  import { findTerm } from "../utils/find-term";

  let host: HTMLDivElement | undefined = $state(undefined);
  let view: EditorView | null = $state(null);
  let currentPath: string | null = null;

  onMount(() => {
    view = new EditorView({
      state: createEditorState(""),
      parent: host!,
    });
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("rypora:insert-table", handleInsertTable);
  });

  function handleInsertTable(event: Event): void {
    const detail = (event as CustomEvent<{ rows?: number; columns?: number }>).detail;
    if (!view || !detail?.rows || !detail?.columns) {
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
    window.removeEventListener("rypora:insert-table", handleInsertTable);
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
