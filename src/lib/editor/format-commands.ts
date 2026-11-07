export interface WrapResult {
  changes: { from: number; to: number; insert: string };
  selection: { anchor: number; head: number };
}

export function toggleWrap(
  text: string,
  from: number,
  to: number,
  marker: string,
): WrapResult {
  const length = marker.length;

  if (
    from >= length &&
    text.slice(from - length, from) === marker &&
    text.slice(to, to + length) === marker
  ) {
    const start = from - length;
    const end = to + length;
    return {
      changes: { from: start, to: end, insert: text.slice(from, to) },
      selection: { anchor: start, head: start + (to - from) },
    };
  }

  if (from === to) {
    return {
      changes: { from, to, insert: `${marker}${marker}` },
      selection: { anchor: from + length, head: from + length },
    };
  }

  const selected = text.slice(from, to);
  if (selected.includes("\n")) {
    const wrapped = selected
      .split("\n")
      .map((line) => (line.length > 0 ? `${marker}${line}${marker}` : line))
      .join("\n");
    return {
      changes: { from, to, insert: wrapped },
      selection: { anchor: from, head: from + wrapped.length },
    };
  }

  return {
    changes: { from, to, insert: `${marker}${selected}${marker}` },
    selection: { anchor: from, head: to + length * 2 },
  };
}

export function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin =
    text
      .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ")
      .match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  return cjk + latin;
}
