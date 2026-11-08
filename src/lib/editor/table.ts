import type { Text } from "@codemirror/state";

export const MAX_TABLE_SIZE = 8;
export const INSERT_TABLE_EVENT = "rypora:insert-table";

const MIN_SIZE = 1;

function clampSize(value: number): number {
  const size = Math.trunc(value) || MIN_SIZE;
  return Math.min(Math.max(size, MIN_SIZE), MAX_TABLE_SIZE);
}

function row(columns: number, value: string): string {
  return `| ${Array.from({ length: columns }, () => value).join(" | ")} |`;
}

export function buildTableTemplate(rows: number, columns: number): string {
  const cols = clampSize(columns);
  const total = clampSize(rows);
  const header = row(cols, "");
  const separator = row(cols, "---");
  const body = Array.from({ length: total - 1 }, () => header);
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
  const lead = from === 0 ? "" : emptyLine ? "\n" : "\n\n";
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
