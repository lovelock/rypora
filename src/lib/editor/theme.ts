import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    fontSize: "var(--editor-font-size, 16px)",
  },
  ".cm-scroller": {
    fontFamily: "var(--editor-font, 'Noto Serif CJK SC', 'Songti SC', Georgia, serif)",
    lineHeight: "1.8",
    overflow: "auto",
  },
  ".cm-content": {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "32px 0 50vh",
    caretColor: "var(--accent)",
  },
  ".cm-line": {
    padding: "0 32px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-widgetBuffer": {
    display: "none",
  },
});

export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, fontFamily: "var(--mono-font, monospace)", color: "var(--code-fg)" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: t.processingInstruction, color: "var(--muted)" },
]);
