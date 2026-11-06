<script lang="ts">
  import type { FileNode } from "../types";
  import TreeNode from "./TreeNode.svelte";

  let { tree, onOpen }: { tree: FileNode; onOpen: (path: string) => void } = $props();
</script>

<div class="tree" role="tree">
  {#each tree.children as child (child.path)}
    <TreeNode node={child} depth={0} {onOpen} />
  {/each}
</div>
