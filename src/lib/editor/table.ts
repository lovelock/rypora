import type { Text } from "@codemirror/state";

const MIN_SIZE = 1;
const MAX_SIZE = 8;

function clampSize(value: number): number {
  const size = Math.trunc(value) || MIN_SIZE;
  return Math.min(Math.max(size, MIN_SIZE), MAX_SIZE);
}

function row(cells: string[], value: string): string {
  return `| ${Array.from({ length: cells.length }, () => value).join(" | ")} |`;
}

export function buildTableTemplate(rows: number, columns: number): string {
  const cols = Array.from({ length: clampSize(columns) }, () => "");
  const total = clampSize(rows);
  const header = row(cols, "");
  const separator = row(cols, "---");
  const body = Array.from({ length: Math.max(total - 1, 0) }, () => header);
  return [header, separator, ...body].join("\n");
}

export interface TableInsertion {
  changes: { from: number; to: number; insert: string };
  anchor: number;
}

export function tableInsertion(
  doc: Text,
  from: number,
  to: number,
  rows: number,
  columns: number,
): TableInsertion {
  const line = doc.lineAt(from);
  const emptyLine = line.text.trim() === "";
  const lead = emptyLine ? (line.from > 0 ? "\n" : "") : "\n\n";
  const trail = emptyLine ? "\n" : "\n\n";

  return {
    changes: {
      from,
      to,
      insert: `${lead}${buildTableTemplate(rows, columns)}${trail}`,
    },
    anchor: from + lead.length + 2,
  };
}
