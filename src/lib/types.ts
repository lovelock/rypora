export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
}

export type Eol = "lf" | "crlf";

export interface FileContent {
  text: string;
  eol: Eol;
  mtimeMs: number;
}

export interface SearchHit {
  path: string;
  relPath: string;
  score: number;
  indices: number[];
}

export interface WorkspaceSnapshot {
  root: string;
  tree: FileNode;
}

export interface TabState {
  path: string;
  cursor: number;
  scrollTop: number;
}

export interface AppConfig {
  lastWorkspace: string | null;
  tabs: TabState[];
  activeTab: string | null;
  theme: string;
  sidebarWidth: number;
  fontSize: number;
}

export type ContextAction = "new-file" | "new-folder" | "rename" | "delete" | "reveal";

export interface TextHit {
  path: string;
  relPath: string;
  title: string;
  score: number;
  snippetHtml: string;
  term: string;
  line: number;
}

export interface IndexStatus {
  phase: string;
  indexed: number;
  total: number;
  generation: number;
  available: boolean;
}
