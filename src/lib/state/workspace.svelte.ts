import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as ipc from "../ipc";
import type { FileNode } from "../types";

export class WorkspaceStore {
  root = $state<string | null>(null);
  tree = $state<FileNode | null>(null);
  expanded = $state<Set<string>>(new Set());
  selectedPath = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  async openFolder(): Promise<void> {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "打开文件夹",
    });
    if (typeof selected === "string") {
      await this.open(selected);
    }
  }

  async open(path: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const snapshot = await ipc.openWorkspace(path);
      this.root = snapshot.root;
      this.tree = snapshot.tree;
      this.expanded = new Set([snapshot.root]);
      this.selectedPath = null;
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    try {
      this.tree = await ipc.getTree();
    } catch (error) {
      this.error = String(error);
    }
  }

  toggle(path: string): void {
    const next = new Set(this.expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    this.expanded = next;
  }

  expand(path: string): void {
    if (!this.expanded.has(path)) {
      const next = new Set(this.expanded);
      next.add(path);
      this.expanded = next;
    }
  }

  select(path: string): void {
    this.selectedPath = path;
  }
}

export const workspace = new WorkspaceStore();
