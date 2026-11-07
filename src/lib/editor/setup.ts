import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { editorTheme, markdownHighlight } from "./theme";
import { livePreview } from "./live-preview";
import { toggleWrap } from "./format-commands";

export function baseExtensions(): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(markdownHighlight),
    editorTheme,
    livePreview(),
    keymap.of([
      { key: "Mod-b", run: wrapSelection("**"), preventDefault: true },
      { key: "Mod-i", run: wrapSelection("*"), preventDefault: true },
      { key: "Mod-Shift-x", run: wrapSelection("~~"), preventDefault: true },
      { key: "Mod-e", run: wrapSelection("`"), preventDefault: true },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
  ];
}

function wrapSelection(marker: string) {
  return (view: EditorView): boolean => {
    const range = view.state.selection.main;
    const result = toggleWrap(
      view.state.doc.toString(),
      range.from,
      range.to,
      marker,
    );
    view.dispatch({
      changes: result.changes,
      selection: {
        anchor: result.selection.anchor,
        head: result.selection.head,
      },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

export function createEditorState(doc: string, extra: Extension[] = []): EditorState {
  return EditorState.create({
    doc,
    extensions: [...baseExtensions(), ...extra],
  });
}
