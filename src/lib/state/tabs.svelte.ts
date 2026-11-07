import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { baseExtensions } from "../editor/setup";
import { documentPath } from "../editor/live-preview";
import { countWords } from "../editor/format-commands";
import * as ipc from "../ipc";
import type { Eol, FileContent, TabState } from "../types";
import { basename } from "../utils/paths";

export interface Tab {
  path: string;
  title: string;
  eol: Eol;
  mtimeMs: number;
  dirty: boolean;
  missing: boolean;
  saving: boolean;
  conflict: boolean;
  scrollTop: number;
}

export class TabsStore {
  tabs = $state<Tab[]>([]);
  activePath = $state<string | null>(null);
  status = $state("");
  error = $state<string | null>(null);
  loadedVersion = $state(0);
  cursorLine = $state(1);
  cursorColumn = $state(1);
  wordCount = $state(0);

  private states = new Map<string, EditorState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingCursor = new Map<string, number>();

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.path === this.activePath) ?? null;
  }

  state(path: string): EditorState | null {
    return this.states.get(path) ?? null;
  }

  scrollOf(path: string): number {
    return this.tabs.find((tab) => tab.path === path)?.scrollTop ?? 0;
  }

  find(path: string): Tab | undefined {
    return this.tabs.find((tab) => tab.path === path);
  }

  async open(path: string): Promise<void> {
    const existing = this.find(path);
    if (existing) {
      await this.activate(path);
      return;
    }
    const tab = this.createTab(path);
    this.tabs = [...this.tabs, tab];
    this.activePath = path;
    await this.readInto(tab);
  }

  async activate(path: string): Promise<void> {
    const tab = this.find(path);
    if (!tab) {
      return;
    }
    this.activePath = path;
    if (!this.states.has(path)) {
      await this.readInto(tab);
    }
  }

  async close(path: string): Promise<void> {
    const tab = this.find(path);
    if (!tab) {
      return;
    }
    if (tab.dirty && !tab.missing) {
      await this.save(path, true);
    }

    const index = this.tabs.findIndex((entry) => entry.path === path);
    const remaining = this.tabs.filter((entry) => entry.path !== path);
    this.tabs = remaining;
    this.states.delete(path);
    this.cancelTimer(path);

    if (this.activePath === path) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      this.activePath = next?.path ?? null;
      if (next && !this.states.has(next.path)) {
        await this.readInto(next);
      }
    }
  }

  async save(path: string, force = false): Promise<void> {
    const tab = this.find(path);
    const state = this.states.get(path);
    if (!tab || !state || tab.missing) {
      return;
    }
    if (!tab.dirty && !force) {
      return;
    }

    this.cancelTimer(path);
    tab.saving = true;
    const doc = state.doc;

    try {
      const mtime = await ipc.writeFile(tab.path, doc.toString(), tab.eol, tab.mtimeMs);
      tab.mtimeMs = mtime;
      if (this.states.get(path)?.doc === doc) {
        tab.dirty = false;
      }
      tab.conflict = false;
      this.status = "已保存";
    } catch (error) {
      const message = String(error);
      if (message.startsWith("conflict:")) {
        tab.conflict = true;
      } else {
        this.error = message;
      }
    } finally {
      tab.saving = false;
    }
  }

  async saveActive(): Promise<void> {
    if (this.activePath) {
      await this.save(this.activePath, true);
    }
  }

  noteEdit(path: string, state: EditorState): void {
    this.states.set(path, state);
    const tab = this.find(path);
    if (!tab) {
      return;
    }
    if (!tab.dirty) {
      tab.dirty = true;
    }
    this.scheduleSave(path);
  }

  syncCursor(path: string, state: EditorState): void {
    if (this.activePath !== path) {
      return;
    }
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    this.cursorLine = line.number;
    this.cursorColumn = head - line.from + 1;
    this.wordCount = countWords(state.doc.toString());
  }

  capture(path: string, state: EditorState, scrollTop: number): void {
    this.states.set(path, state);
    const tab = this.find(path);
    if (tab) {
      tab.scrollTop = scrollTop;
    }
  }

  snapshot(): TabState[] {
    return this.tabs.map((tab) => ({
      path: tab.path,
      cursor: this.states.get(tab.path)?.selection.main.head ?? 0,
      scrollTop: tab.scrollTop,
    }));
  }

  restore(tabs: TabState[], active: string | null): void {
    this.tabs = tabs.map((entry) => this.createTab(entry.path, entry.cursor, entry.scrollTop));
    this.activePath = active;
    if (active) {
      const tab = this.find(active);
      if (tab) {
        void this.readInto(tab);
      }
    }
  }

  async handleFsChanged(paths: string[]): Promise<void> {
    for (const tab of [...this.tabs]) {
      if (!paths.includes(tab.path)) {
        continue;
      }

      try {
        const content = await ipc.readFile(tab.path);
        if (tab.missing) {
          tab.missing = false;
          if (!tab.dirty) {
            this.applyContent(tab, content);
          }
          continue;
        }
        if (content.mtimeMs !== tab.mtimeMs) {
          if (tab.dirty) {
            tab.conflict = true;
          } else {
            this.applyContent(tab, content);
          }
        }
      } catch {
        tab.missing = true;
        this.cancelTimer(tab.path);
      }
    }
  }

  async resolveConflict(path: string, useDisk: boolean): Promise<void> {
    const tab = this.find(path);
    if (!tab) {
      return;
    }

    try {
      if (useDisk) {
        const content = await ipc.readFile(path);
        this.applyContent(tab, content);
      } else {
        const content = await ipc.readFile(path);
        tab.mtimeMs = content.mtimeMs;
        tab.conflict = false;
        await this.save(path, true);
      }
    } catch (error) {
      this.error = String(error);
    }
  }

  private createTab(path: string, cursor = 0, scrollTop = 0): Tab {
    this.pendingCursor.set(path, cursor);
    return {
      path,
      title: basename(path),
      eol: "lf",
      mtimeMs: 0,
      dirty: false,
      missing: false,
      saving: false,
      conflict: false,
      scrollTop,
    };
  }

  private async readInto(tab: Tab): Promise<void> {
    try {
      const content = await ipc.readFile(tab.path);
      const cursor = this.pendingCursor.get(tab.path) ?? 0;
      this.pendingCursor.delete(tab.path);
      this.states.set(tab.path, this.makeState(tab.path, content.text, cursor));
      tab.eol = content.eol;
      tab.mtimeMs = content.mtimeMs;
      tab.dirty = false;
      tab.missing = false;
      tab.conflict = false;
      this.loadedVersion += 1;
    } catch (error) {
      tab.missing = true;
      this.error = String(error);
    }
  }

  private applyContent(tab: Tab, content: FileContent): void {
    const cursor = Math.min(
      this.states.get(tab.path)?.selection.main.head ?? 0,
      content.text.length,
    );
    this.states.set(tab.path, this.makeState(tab.path, content.text, cursor));
    tab.eol = content.eol;
    tab.mtimeMs = content.mtimeMs;
    tab.dirty = false;
    tab.missing = false;
    tab.conflict = false;
    this.loadedVersion += 1;
  }

  private makeState(path: string, doc: string, cursor: number): EditorState {
    return EditorState.create({
      doc,
      selection: { anchor: Math.min(cursor, doc.length) },
      extensions: [
        ...baseExtensions(),
        documentPath.of(path),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.noteEdit(path, update.state);
          }
          if (update.docChanged || update.selectionSet) {
            this.syncCursor(path, update.state);
          }
        }),
      ],
    });
  }

  private scheduleSave(path: string): void {
    this.cancelTimer(path);
    this.timers.set(
      path,
      setTimeout(() => {
        this.timers.delete(path);
        void this.save(path);
      }, 400),
    );
  }

  private cancelTimer(path: string): void {
    const timer = this.timers.get(path);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(path);
    }
  }
}

export const tabs = new TabsStore();
