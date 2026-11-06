export interface HighlightPart {
  text: string;
  hit: boolean;
}

export function splitByIndices(text: string, indices: number[]): HighlightPart[] {
  const chars = Array.from(text);
  const hits = new Set(indices.filter((index) => index >= 0 && index < chars.length));
  if (chars.length === 0) {
    return [];
  }
  if (hits.size === 0) {
    return [{ text, hit: false }];
  }

  const parts: HighlightPart[] = [];
  let buffer = "";
  let bufferHit = hits.has(0);

  for (let index = 0; index < chars.length; index += 1) {
    const hit = hits.has(index);
    if (hit !== bufferHit) {
      if (buffer) {
        parts.push({ text: buffer, hit: bufferHit });
      }
      buffer = "";
      bufferHit = hit;
    }
    buffer += chars[index];
  }

  if (buffer) {
    parts.push({ text: buffer, hit: bufferHit });
  }
  return parts;
}
