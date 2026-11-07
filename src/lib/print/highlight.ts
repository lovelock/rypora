import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";

export async function highlightCodeBlocks(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code"));

  await Promise.all(
    blocks.map(async (block) => {
      const language = /(?:^|\s)language-([\w-]+)/.exec(block.className)?.[1];
      if (!language) {
        return;
      }

      const description = LanguageDescription.matchLanguageName(languages, language, true);
      if (!description) {
        return;
      }

      const source = block.textContent ?? "";

      try {
        const support = await description.load();
        const tree = support.language.parser.parse(source);
        const fragment = document.createDocumentFragment();
        let position = 0;

        highlightTree(tree, classHighlighter, (from, to, classes) => {
          if (from > position) {
            fragment.appendChild(document.createTextNode(source.slice(position, from)));
          }
          const span = document.createElement("span");
          if (classes) {
            span.className = classes;
          }
          span.textContent = source.slice(from, to);
          fragment.appendChild(span);
          position = to;
        });

        if (position < source.length) {
          fragment.appendChild(document.createTextNode(source.slice(position)));
        }

        block.replaceChildren(fragment);
      } catch {
        // Keep the plain text when a language parser fails to load.
      }
    }),
  );
}
