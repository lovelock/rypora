import { syntaxTree } from "@codemirror/language";
import { Facet, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { computeInlineRanges } from "./preview-model";
import { BulletWidget, CodeBlockWidget, ImageWidget, RuleWidget, TaskWidget } from "./widgets";
import { resolveRelative } from "../utils/paths";

export const documentPath = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
});

interface BuiltDecorations {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

function activeLinesOf(state: EditorState): Set<number> {
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const start = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to).number;
    for (let line = start; line <= end; line += 1) {
      activeLines.add(line);
    }
  }
  return activeLines;
}

function buildBlocks(state: EditorState): DecorationSet {
  const activeLines = activeLinesOf(state);
  const tree = syntaxTree(state);
  const decorations: Range<Decoration>[] = [];
  const seen = new Set<number>();

  tree.iterate({
    from: 0,
    to: state.doc.length,
    enter(ref) {
      if (ref.name === "FencedCode") {
        if (seen.has(ref.from)) {
          return false;
        }
        const start = state.doc.lineAt(ref.from);
        const end = state.doc.lineAt(Math.min(ref.to, state.doc.length));
        for (let line = start.number; line <= end.number; line += 1) {
          if (activeLines.has(line)) {
            return false;
          }
        }
        seen.add(ref.from);
        const codeNode = ref.node.getChild("CodeText");
        const infoNode = ref.node.getChild("CodeInfo");
        const code = codeNode
          ? state.doc.sliceString(codeNode.from, codeNode.to)
          : "";
        const lang = infoNode
          ? state.doc.sliceString(infoNode.from, infoNode.to)
          : "";
        decorations.push(
          Decoration.replace({
            block: true,
            widget: new CodeBlockWidget(code, lang, ref.from),
          }).range(start.from, end.to),
        );
        return false;
      }

      if (ref.name === "HorizontalRule") {
        const line = state.doc.lineAt(ref.from);
        if (!activeLines.has(line.number)) {
          decorations.push(
            Decoration.replace({
              block: true,
              widget: new RuleWidget(ref.from),
            }).range(line.from, line.to),
          );
        }
        return false;
      }

      return undefined;
    },
  });

  return Decoration.set(decorations, true);
}

const blockField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlocks(state);
  },
  update(_value, transaction) {
    return buildBlocks(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function build(view: EditorView): BuiltDecorations {
  const state = view.state;
  const activeLines = activeLinesOf(state);

  const tree = syntaxTree(state);
  const path = state.facet(documentPath);
  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const hide = (from: number, to: number): void => {
    if (to <= from) {
      return;
    }
    decorations.push(Decoration.replace({}).range(from, to));
    atomic.push(Decoration.replace({}).range(from, to));
  };

  const replace = (
    from: number,
    to: number,
    widget: ImageWidget | TaskWidget | BulletWidget,
  ): void => {
    if (to <= from) {
      return;
    }
    decorations.push(Decoration.replace({ widget }).range(from, to));
    atomic.push(Decoration.replace({ widget }).range(from, to));
  };

  for (const visible of view.visibleRanges) {
    for (const range of computeInlineRanges(
      tree,
      state.doc,
      activeLines,
      visible.from,
      visible.to,
    )) {
      if (range.kind === "hide") {
        hide(range.from, range.to);
      } else {
        decorations.push(
          Decoration.mark({ class: range.cls }).range(range.from, range.to),
        );
      }
    }

    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(ref) {
        switch (ref.name) {
          case "Image": {
            const urlNode = ref.node.getChild("URL");
            if (!urlNode || activeLines.has(state.doc.lineAt(ref.from).number)) {
              return false;
            }
            const marks: SyntaxNode[] = [];
            for (
              let child = ref.node.firstChild;
              child;
              child = child.nextSibling
            ) {
              if (child.name === "LinkMark") {
                marks.push(child);
              }
            }
            const alt =
              marks.length >= 2
                ? state.doc.sliceString(marks[0].to, marks[1].from)
                : "";
            const src = state.doc.sliceString(urlNode.from, urlNode.to);
            replace(
              ref.from,
              ref.to,
              new ImageWidget(resolveRelative(path, src), alt, ref.from),
            );
            return false;
          }

          case "TaskMarker": {
            if (activeLines.has(state.doc.lineAt(ref.from).number)) {
              return false;
            }
            const raw = state.doc.sliceString(ref.from, ref.to);
            replace(
              ref.from,
              ref.to,
              new TaskWidget(/\[[xX]\]/.test(raw), ref.from, ref.to),
            );
            return false;
          }

          case "Link": {
            if (activeLines.has(state.doc.lineAt(ref.from).number)) {
              return false;
            }

            const marks: SyntaxNode[] = [];
            let url = "";
            let urlNode: SyntaxNode | null = null;
            for (
              let child = ref.node.firstChild;
              child;
              child = child.nextSibling
            ) {
              if (child.name === "LinkMark") {
                marks.push(child);
              } else if (child.name === "URL") {
                url = state.doc.sliceString(child.from, child.to);
                urlNode = child;
              }
            }

            if (!url || marks.length < 2) {
              return false;
            }

            for (const mark of marks) {
              hide(mark.from, mark.to);
            }
            if (urlNode) {
              hide(urlNode.from, urlNode.to);
            }
            decorations.push(
              Decoration.mark({
                class: "cm-preview-link",
                attributes: { "data-href": url },
              }).range(marks[0].to, marks[1].from),
            );
            return true;
          }

          case "Blockquote": {
            const start = state.doc.lineAt(ref.from);
            const end = state.doc.lineAt(Math.min(ref.to, state.doc.length));
            for (let line = start.number; line <= end.number; line += 1) {
              decorations.push(
                Decoration.line({ class: "cm-preview-quote" }).range(
                  state.doc.line(line).from,
                ),
              );
            }
            return true;
          }

          case "QuoteMark": {
            if (!activeLines.has(state.doc.lineAt(ref.from).number)) {
              hide(ref.from, ref.to);
            }
            return false;
          }

          case "ListMark": {
            const raw = state.doc.sliceString(ref.from, ref.to);
            if (
              !activeLines.has(state.doc.lineAt(ref.from).number) &&
              /^[-*+]$/.test(raw)
            ) {
              replace(ref.from, ref.to, new BulletWidget());
            } else {
              decorations.push(
                Decoration.mark({ class: "cm-preview-listmark" }).range(
                  ref.from,
                  ref.to,
                ),
              );
            }
            return false;
          }

          default:
            return undefined;
        }
      },
    });
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

const previewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const built = build(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        const built = build(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

const linkClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.ctrlKey || event.metaKey)) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    const element = target?.closest("[data-href]") as HTMLElement | null;
    const href = element?.dataset.href;
    if (!href) {
      return false;
    }
    window.dispatchEvent(
      new CustomEvent("rypora:open-link", {
        detail: { href, path: view.state.facet(documentPath) },
      }),
    );
    event.preventDefault();
    return true;
  },
});

export function livePreview(): Extension {
  return [
    blockField,
    previewPlugin,
    EditorView.atomicRanges.of(
      (view) => view.plugin(previewPlugin)?.atomic ?? Decoration.none,
    ),
    linkClick,
  ];
}
