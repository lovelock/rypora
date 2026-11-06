<script lang="ts">
  let {
    title,
    message,
    confirmLabel = "确定",
    danger = false,
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();
</script>

<div class="dialog-overlay">
  <button class="dialog-backdrop" aria-label="关闭" onclick={onCancel}></button>
  <div class="dialog" role="dialog" aria-modal="true" tabindex="-1">
    <h2>{title}</h2>
    <p>{message}</p>
    <div class="dialog-actions">
      <button type="button" onclick={onCancel}>取消</button>
      <button type="button" class="primary" class:danger onclick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .danger {
    background: #b42318 !important;
    border-color: #b42318 !important;
  }
</style>
