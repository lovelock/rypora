import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  Eol,
  FileContent,
  FileNode,
  IndexStatus,
  SearchHit,
  TextHit,
  WorkspaceSnapshot,
} from "./types";

export function openWorkspace(path: string): Promise<WorkspaceSnapshot> {
  return invoke("open_workspace", { path });
}

export function getTree(): Promise<FileNode> {
  return invoke("get_tree");
}

export function refreshIndex(): Promise<void> {
  return invoke("refresh_index");
}

export function createEntry(parent: string, name: string, isDir: boolean): Promise<string> {
  return invoke("create_entry", { parent, name, isDir });
}

export function renameEntry(path: string, newName: string): Promise<string> {
  return invoke("rename_entry", { path, newName });
}

export function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

export function moveEntry(src: string, destDir: string): Promise<string> {
  return invoke("move_entry", { src, destDir });
}

export function readFile(path: string): Promise<FileContent> {
  return invoke("read_file", { path });
}

export function writeFile(
  path: string,
  text: string,
  eol: Eol,
  expectedMtimeMs: number,
): Promise<number> {
  return invoke("write_file", { path, text, eol, expectedMtimeMs });
}

export function saveFileAs(path: string, text: string, eol: Eol): Promise<number> {
  return invoke("save_file_as", { path, text, eol });
}

export function searchFiles(query: string, limit = 50): Promise<SearchHit[]> {
  return invoke("search_files", { query, limit });
}

export function loadConfig(): Promise<AppConfig> {
  return invoke("load_config_command");
}

export function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config_command", { config });
}

export function revealItem(path: string): Promise<void> {
  return invoke("reveal_item", { path });
}

export function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

export function searchText(
  query: string,
  limit: number,
  excludePaths: string[],
): Promise<TextHit[]> {
  return invoke("search_text", { query, limit, excludePaths });
}

export function indexStatus(): Promise<IndexStatus> {
  return invoke("index_status");
}

export function reindexWorkspace(): Promise<void> {
  return invoke("reindex_workspace");
}
