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
  error: string | null;
}

function isUnder(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
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

  setScroll(path: string, top: number): void {
    const tab = this.find(path);
    if (tab) {
      tab.scrollTop = top;
    }
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

  async close(path: string): Promise<boolean> {
    const tab = this.find(path);
    if (!tab) {
      return true;
    }
    if (tab.dirty) {
      if (tab.missing) {
        this.error = "文件已从磁盘删除，请先另存为或强制关闭。";
        return false;
      }
      if (!(await this.save(path, true))) {
        return false;
      }
    }
    this.remove(path);
    return true;
  }

  forceClose(path: string): void {
    this.remove(path);
  }

  async save(path: string, force = false): Promise<boolean> {
    const tab = this.find(path);
    const state = this.states.get(path);
    if (!tab || !state) {
      return false;
    }
    if (tab.missing) {
      this.error = "文件已从磁盘删除，请先另存为。";
      return false;
    }
    if (!tab.dirty && !force) {
      return true;
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
      tab.error = null;
      this.status = "已保存";
      return true;
    } catch (error) {
      const message = String(error);
      if (message.startsWith("conflict:")) {
        tab.conflict = true;
        this.error = "文件已在磁盘上被修改，请选择保留我的或载入磁盘版本。";
      } else {
        tab.error = message;
        this.error = message;
      }
      return false;
    } finally {
      tab.saving = false;
    }
  }

  async saveActive(): Promise<boolean> {
    if (!this.activePath) {
      return true;
    }
    return this.save(this.activePath, true);
  }

  async saveAs(path: string, newPath: string): Promise<boolean> {
    const tab = this.find(path);
    const state = this.states.get(path);
    if (!tab || !state) {
      return false;
    }

    try {
      const text = state.doc.toString();
      const cursor = state.selection.main.head;
      const mtime = await ipc.saveFileAs(newPath, text, tab.eol);
      this.states.delete(path);
      this.states.set(newPath, this.makeState(newPath, text, cursor));
      tab.path = newPath;
      tab.title = basename(newPath);
      tab.mtimeMs = mtime;
      tab.dirty = false;
      tab.missing = false;
      tab.conflict = false;
      tab.error = null;
      if (this.activePath === path) {
        this.activePath = newPath;
      }
      this.loadedVersion += 1;
      return true;
    } catch (error) {
      tab.error = String(error);
      this.error = String(error);
      return false;
    }
  }

  async prepareDelete(path: string): Promise<boolean> {
    for (const tab of this.tabs.filter((entry) => isUnder(entry.path, path))) {
      if (!tab.dirty) {
        continue;
      }
      if (tab.missing) {
        this.error = "有打开的文件已从磁盘删除且尚未保存，请先另存为。";
        return false;
      }
      if (!(await this.save(tab.path, true))) {
        return false;
      }
    }
    return true;
  }

  closeUnder(path: string): void {
    for (const tab of [...this.tabs]) {
      if (isUnder(tab.path, path)) {
        this.remove(tab.path);
      }
    }
  }

  retarget(oldPath: string, newPath: string): void {
    const affected = this.tabs.filter((tab) => isUnder(tab.path, oldPath));
    for (const tab of affected) {
      const next = newPath + tab.path.slice(oldPath.length);
      const state = this.states.get(tab.path);
      const cursor = state?.selection.main.head ?? 0;
      const text = state?.doc.toString() ?? "";
      this.states.delete(tab.path);
      if (state) {
        this.states.set(next, this.makeState(next, text, cursor));
      }
      tab.path = next;
      tab.title = basename(next);
      tab.error = null;
    }
    if (this.activePath && isUnder(this.activePath, oldPath)) {
      this.activePath = newPath + this.activePath.slice(oldPath.length);
    }
    this.loadedVersion += 1;
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
      cursor:
        this.states.get(tab.path)?.selection.main.head ??
        this.pendingCursor.get(tab.path) ??
        0,
      scrollTop: tab.scrollTop,
    }));
  }

  restore(entries: TabState[], active: string | null): void {
    const seen = new Set<string>();
    const restored: Tab[] = [];
    for (const entry of entries) {
      if (seen.has(entry.path)) {
        continue;
      }
      seen.add(entry.path);
      restored.push(this.createTab(entry.path, entry.cursor, entry.scrollTop));
    }
    this.tabs = restored;
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
          tab.error = null;
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
      } catch (error) {
        const message = String(error);
        if (message.startsWith("not-found:")) {
          tab.missing = true;
          this.cancelTimer(tab.path);
        } else {
          tab.error = message;
          this.error = message;
        }
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
      tab.error = String(error);
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
      error: null,
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
      tab.error = null;
      this.loadedVersion += 1;
    } catch (error) {
      const message = String(error);
      if (message.startsWith("not-found:")) {
        tab.missing = true;
      } else {
        tab.error = message;
      }
      this.error = message;
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
    tab.error = null;
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
          this.states.set(path, update.state);
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

  private remove(path: string): void {
    const index = this.tabs.findIndex((tab) => tab.path === path);
    const remaining = this.tabs.filter((tab) => tab.path !== path);
    this.tabs = remaining;
    this.states.delete(path);
    this.pendingCursor.delete(path);
    this.cancelTimer(path);

    if (this.activePath === path) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      this.activePath = next?.path ?? null;
      if (next && !this.states.has(next.path)) {
        void this.readInto(next);
      }
    }
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
