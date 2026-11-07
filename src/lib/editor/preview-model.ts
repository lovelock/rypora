import type { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";

export type PreviewRange =
  | { kind: "hide"; from: number; to: number }
  | { kind: "style"; from: number; to: number; cls: string };

const HEADING = /^ATXHeading([1-6])$/;
const MARK_NAMES = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark"]);

const STYLE_BY_NODE: Record<string, string> = {
  StrongEmphasis: "cm-preview-strong",
  Emphasis: "cm-preview-em",
  Strikethrough: "cm-preview-strike",
  InlineCode: "cm-preview-code",
};

export function computeInlineRanges(
  tree: Tree,
  doc: Text,
  activeLines: Set<number>,
  from = 0,
  to = doc.length,
): PreviewRange[] {
  const ranges: PreviewRange[] = [];

  const hide = (start: number, end: number): void => {
    if (end <= start || activeLines.has(doc.lineAt(start).number)) {
      return;
    }
    ranges.push({ kind: "hide", from: start, to: end });
  };

  const style = (start: number, end: number, cls: string): void => {
    if (end <= start) {
      return;
    }
    ranges.push({ kind: "style", from: start, to: end, cls });
  };

  tree.iterate({
    from,
    to,
    enter(ref) {
      const heading = HEADING.exec(ref.name);
      if (heading) {
        const first = ref.node.firstChild;
        let contentStart = ref.from;
        if (first && first.name === "HeaderMark") {
          contentStart = first.to;
          while (
            contentStart < ref.to &&
            doc.sliceString(contentStart, contentStart + 1) === " "
          ) {
            contentStart += 1;
          }
          hide(ref.from, contentStart);
        }
        style(contentStart, ref.to, `cm-preview-h${heading[1]}`);
        return false;
      }

      const cls = STYLE_BY_NODE[ref.name];
      if (cls) {
        const marks: { from: number; to: number }[] = [];
        for (
          let child: SyntaxNode | null = ref.node.firstChild;
          child;
          child = child.nextSibling
        ) {
          if (MARK_NAMES.has(child.name)) {
            marks.push({ from: child.from, to: child.to });
          }
        }
        if (marks.length > 0) {
          for (const mark of marks) {
            hide(mark.from, mark.to);
          }
          style(marks[0].to, marks[marks.length - 1].from, cls);
        }
        return false;
      }

      return undefined;
    },
  });

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return ranges;
}
