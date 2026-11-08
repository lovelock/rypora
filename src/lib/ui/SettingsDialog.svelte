<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  let {
    theme,
    fontSize,
    sidebarWidth,
    onTheme,
    onFontSize,
    onSidebarWidth,
    onClose,
  }: {
    theme: string;
    fontSize: number;
    sidebarWidth: number;
    onTheme: (value: string) => void;
    onFontSize: (value: number) => void;
    onSidebarWidth: (value: number) => void;
    onClose: () => void;
  } = $props();

  const themes = [
    { value: "system", label: "自动" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];

  let dialog = $state<HTMLDivElement | undefined>(undefined);
  let previousFocus: HTMLElement | null = null;

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus();
  });

  onDestroy(() => {
    previousFocus?.focus();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialog) {
      return;
    }

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div class="dialog-overlay">
  <button class="dialog-backdrop" tabindex="-1" aria-label="关闭设置" onclick={onClose}></button>
  <div
    class="dialog settings"
    role="dialog"
    aria-modal="true"
    aria-label="设置"
    tabindex="-1"
    bind:this={dialog}
    onkeydown={handleKeydown}
  >
    <h2>设置</h2>

    <div class="field">
      <span class="label">主题</span>
      <div class="segmented">
        {#each themes as item (item.value)}
          <button
            class:active={theme === item.value}
            aria-pressed={theme === item.value}
            onclick={() => onTheme(item.value)}
          >
            {item.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <label class="label" for="font-size">正文字号</label>
      <div class="range">
        <input
          id="font-size"
          type="range"
          min="13"
          max="22"
          step="1"
          value={fontSize}
          oninput={(event) => onFontSize(Number(event.currentTarget.value))}
        />
        <span class="value">{fontSize}px</span>
      </div>
    </div>

    <div class="field">
      <label class="label" for="sidebar-width">侧栏宽度</label>
      <div class="range">
        <input
          id="sidebar-width"
          type="range"
          min="240"
          max="420"
          step="10"
          value={sidebarWidth}
          oninput={(event) => onSidebarWidth(Number(event.currentTarget.value))}
        />
        <span class="value">{sidebarWidth}px</span>
      </div>
    </div>

    <div class="dialog-actions">
      <button class="primary" onclick={onClose}>完成</button>
    </div>
  </div>
</div>

<style>
  .settings {
    width: 360px;
  }

  .field {
    margin-bottom: 16px;
  }

  .label {
    display: block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  .segmented {
    display: flex;
    gap: 6px;
  }

  .segmented button {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    cursor: pointer;
  }

  .segmented button.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--fg);
  }

  .range {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .range input[type="range"] {
    flex: 1;
    width: auto;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .value {
    width: 44px;
    text-align: right;
    color: var(--muted);
    font-size: 12px;
  }
</style>
