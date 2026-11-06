import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { editorTheme, markdownHighlight } from "./theme";

export function baseExtensions(): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(markdownHighlight),
    editorTheme,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
}

export function createEditorState(doc: string, extra: Extension[] = []): EditorState {
  return EditorState.create({
    doc,
    extensions: [...baseExtensions(), ...extra],
  });
}
