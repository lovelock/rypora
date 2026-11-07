<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { tabs } from "../state/tabs.svelte";
  import { createEditorState } from "./setup";

  let host: HTMLDivElement | undefined = $state(undefined);
  let view: EditorView | null = $state(null);
  let currentPath: string | null = null;

  onMount(() => {
    view = new EditorView({
      state: createEditorState(""),
      parent: host!,
    });
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
  });

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
