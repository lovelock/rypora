<script lang="ts">
  let {
    onSelect,
    onClose,
  }: { onSelect: (rows: number, columns: number) => void; onClose: () => void } = $props();

  const size = 8;
  let rows = $state(0);
  let columns = $state(0);

  function choose(): void {
    if (rows > 0 && columns > 0) {
      onSelect(rows, columns);
    }
    onClose();
  }
</script>

<div class="table-picker" role="dialog" aria-label="插入表格">
  <button class="picker-backdrop" aria-label="关闭" onclick={onClose}></button>
  <div class="picker-panel">
    <div class="picker-grid">
      {#each Array.from({ length: size }) as _, r}
        <div class="picker-row">
          {#each Array.from({ length: size }) as _, c}
            <button
              type="button"
              class="picker-cell"
              class:active={r < rows && c < columns}
              aria-label={`${r + 1} 行 ${c + 1} 列`}
              onmouseenter={() => {
                rows = r + 1;
                columns = c + 1;
              }}
              onclick={choose}
            ></button>
          {/each}
        </div>
      {/each}
    </div>
    <p class="picker-label">{rows > 0 ? `${rows} × ${columns}` : "选择行列"}</p>
  </div>
</div>

<style>
  .table-picker {
    position: absolute;
    right: 8px;
    bottom: calc(100% + 6px);
    z-index: 60;
  }

  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .picker-panel {
    position: relative;
    z-index: 1;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
  }

  .picker-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-row {
    display: flex;
    gap: 2px;
  }

  .picker-cell {
    width: 12px;
    height: 12px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg);
    cursor: pointer;
  }

  .picker-cell.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .picker-label {
    margin: 6px 0 0;
    text-align: center;
    color: var(--muted);
    font-size: 11px;
  }
</style>
