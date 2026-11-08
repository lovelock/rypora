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
    fontFamily: "var(--editor-font)",
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
  ".cm-preview-strong": {
    fontWeight: "700",
  },
  ".cm-preview-em": {
    fontStyle: "italic",
  },
  ".cm-preview-strike": {
    textDecoration: "line-through",
    color: "var(--muted)",
  },
  ".cm-preview-code": {
    padding: "0.08em 0.3em",
    borderRadius: "3px",
    background: "var(--code-bg)",
    fontFamily: "var(--mono-font, monospace)",
    fontSize: "0.92em",
  },
  ".cm-preview-h1": {
    fontSize: "1.9em",
    fontWeight: "700",
    lineHeight: "1.3",
  },
  ".cm-preview-h2": {
    fontSize: "1.55em",
    fontWeight: "700",
    lineHeight: "1.35",
  },
  ".cm-preview-h3": {
    fontSize: "1.3em",
    fontWeight: "700",
  },
  ".cm-preview-h4": {
    fontSize: "1.15em",
    fontWeight: "700",
  },
  ".cm-preview-h5": {
    fontSize: "1.05em",
    fontWeight: "700",
  },
  ".cm-preview-h6": {
    fontSize: "1em",
    fontWeight: "700",
    color: "var(--muted)",
  },
  ".cm-preview-image": {
    display: "block",
    maxWidth: "100%",
    margin: "10px 0",
    borderRadius: "6px",
  },
  ".cm-preview-codeblock": {
    position: "relative",
    margin: "10px 0",
    padding: "10px 14px",
    overflowX: "auto",
    borderRadius: "8px",
    background: "var(--code-bg)",
    fontFamily: "var(--mono-font, monospace)",
    fontSize: "0.9em",
    lineHeight: "1.55",
  },
  ".cm-preview-copy": {
    position: "absolute",
    top: "6px",
    right: "6px",
    padding: "2px 8px",
    border: "1px solid var(--border)",
    borderRadius: "5px",
    background: "var(--bg)",
    color: "var(--muted)",
    fontFamily: "var(--ui-font)",
    fontSize: "11px",
    lineHeight: "1.6",
    cursor: "pointer",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 120ms ease",
  },
  ".cm-preview-codeblock:hover .cm-preview-copy, .cm-preview-copy:focus-visible": {
    opacity: "1",
    pointerEvents: "auto",
  },
  "@media (hover: none)": {
    ".cm-preview-copy": {
      opacity: "1",
      pointerEvents: "auto",
    },
  },
  ".cm-preview-codeblock pre": {
    margin: "0",
    whiteSpace: "pre-wrap",
  },
  ".cm-preview-codeblock code": {
    fontFamily: "inherit",
  },
  ".cm-preview-table": {
    margin: "10px 32px",
    overflowX: "auto",
  },
  ".cm-preview-table table": {
    minWidth: "50%",
    borderCollapse: "collapse",
    fontSize: "0.92em",
    lineHeight: "1.5",
  },
  ".cm-preview-table th, .cm-preview-table td": {
    padding: "4px 10px",
    border: "1px solid var(--border)",
    verticalAlign: "top",
  },
  ".cm-preview-table th": {
    background: "var(--sidebar-bg)",
    fontWeight: "600",
  },
  ".cm-preview-table p": {
    margin: "0",
  },
  ".cm-preview-rule": {
    margin: "18px 0",
    border: "none",
    borderTop: "1px solid var(--border)",
  },
  ".cm-preview-task": {
    width: "15px",
    height: "15px",
    marginRight: "6px",
    verticalAlign: "middle",
    accentColor: "var(--accent)",
  },
  ".cm-preview-link": {
    color: "var(--accent)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  ".cm-preview-quote": {
    borderLeft: "3px solid var(--border)",
    paddingLeft: "16px",
    color: "var(--muted)",
  },
  ".cm-preview-listmark": {
    color: "var(--accent)",
    fontWeight: "700",
  },
  ".cm-preview-bullet": {
    color: "var(--accent)",
    fontWeight: "700",
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
