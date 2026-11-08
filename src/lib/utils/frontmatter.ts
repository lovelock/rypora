import type { Text } from "@codemirror/state";

export interface FrontmatterRange {
  from: number;
  to: number;
}

const MAX_LINES = 50;

function isFence(text: string): boolean {
  return /^---[ \t]*\r?$/.test(text);
}

function looksLikeYaml(text: string): boolean {
  return /^[A-Za-z0-9_.-]+\s*:/.test(text) || /^\s*-\s/.test(text);
}

function findEnd(lineCount: number, line: (index: number) => string): number | null {
  if (lineCount < 3 || !isFence(line(1))) {
    return null;
  }

  let hasYaml = false;
  const limit = Math.min(lineCount, MAX_LINES);
  for (let index = 2; index <= limit; index += 1) {
    const text = line(index);
    if (isFence(text)) {
      return hasYaml && index > 2 ? index : null;
    }
    if (text.trim() === "") {
      return null;
    }
    if (looksLikeYaml(text)) {
      hasYaml = true;
    }
  }

  return null;
}

export function frontmatterRange(doc: Text): FrontmatterRange | null {
  const end = findEnd(doc.lines, (index) => doc.line(index).text);
  if (end === null) {
    return null;
  }
  return { from: doc.line(1).from, to: doc.line(end).to };
}

export function stripFrontmatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const end = findEnd(lines.length, (index) => lines[index - 1]);
  if (end === null) {
    return markdown;
  }
  return lines.slice(end).join("\n").replace(/^\n+/, "");
}
