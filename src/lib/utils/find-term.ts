export function findTerm(text: string, term: string): number | null {
  if (!term) {
    return null;
  }
  const offset = text.toLowerCase().indexOf(term.toLowerCase());
  return offset >= 0 ? offset : null;
}
