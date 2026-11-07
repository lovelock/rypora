import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorView, WidgetType } from "@codemirror/view";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import { copyText } from "../utils/clipboard";

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly from: number,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(view: EditorView): HTMLElement {
    const image = document.createElement("img");
    image.className = "cm-preview-image";
    image.src = convertFileSrc(this.src);
    image.alt = this.alt;
    image.loading = "lazy";
    image.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    return image;
  }
}

export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.className = "cm-preview-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

export class RuleWidget extends WidgetType {
  constructor(readonly from: number) {
    super();
  }

  eq(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const rule = document.createElement("hr");
    rule.className = "cm-preview-rule";
    rule.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    return rule;
  }
}

export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-preview-task";
    checkbox.checked = this.checked;
    checkbox.addEventListener("change", () => {
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: checkbox.checked ? "[x]" : "[ ]",
        },
      });
    });
    return checkbox;
  }
}

export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly lang: string,
    readonly from: number,
  ) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return other.code === this.code && other.lang === this.lang;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-preview-codeblock";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-preview-copy";
    button.textContent = "复制";
    button.title = "复制代码";
    button.setAttribute("aria-label", "复制代码");
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.copy(button);
    });

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = this.code;
    pre.appendChild(code);
    wrapper.append(button, pre);

    wrapper.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });

    void this.highlight(code);
    return wrapper;
  }

  private async copy(button: HTMLButtonElement): Promise<void> {
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    const copied = await copyText(this.code.replace(/^\n+|\n+$/g, ""));
    button.textContent = copied ? "已复制" : "复制失败";
    window.setTimeout(() => {
      button.textContent = "复制";
      button.disabled = false;
    }, 1500);
  }

  private async highlight(block: HTMLElement): Promise<void> {
    const description = LanguageDescription.matchLanguageName(languages, this.lang, true);
    if (!description) {
      return;
    }

    try {
      const support = await description.load();
      const tree = support.language.parser.parse(this.code);
      if (!block.isConnected) {
        return;
      }

      block.textContent = "";
      let position = 0;
      highlightTree(tree, classHighlighter, (from, to, classes) => {
        if (from > position) {
          block.appendChild(document.createTextNode(this.code.slice(position, from)));
        }
        const span = document.createElement("span");
        if (classes) {
          span.className = classes;
        }
        span.textContent = this.code.slice(from, to);
        block.appendChild(span);
        position = to;
      });

      if (position < this.code.length) {
        block.appendChild(document.createTextNode(this.code.slice(position)));
      }
    } catch {
      block.textContent = this.code;
    }
  }
}
