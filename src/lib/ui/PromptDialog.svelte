<script lang="ts">
  let {
    title,
    initial = "",
    placeholder = "",
    confirmLabel = "确定",
    onConfirm,
    onCancel,
  }: {
    title: string;
    initial?: string;
    placeholder?: string;
    confirmLabel?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  } = $props();

  let value = $state("");

  $effect(() => {
    value = initial;
  });

  let input = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    input?.focus();
    input?.select();
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  }
</script>

<div class="dialog-overlay">
  <button class="dialog-backdrop" aria-label="关闭" onclick={onCancel}></button>
  <form class="dialog" onsubmit={submit}>
    <h2>{title}</h2>
    <input bind:this={input} bind:value {placeholder} />
    <div class="dialog-actions">
      <button type="button" onclick={onCancel}>取消</button>
      <button type="submit" class="primary" disabled={!value.trim()}>{confirmLabel}</button>
    </div>
  </form>
</div>
