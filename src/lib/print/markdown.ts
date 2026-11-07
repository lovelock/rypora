import { convertFileSrc } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { resolveRelative } from "../utils/paths";

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function renderMarkdownHtml(markdown: string, docPath: string): string {
  const raw = marked.parse(markdown, { gfm: true, async: false }) as string;
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
  }) as string;

  return rewriteImages(clean, docPath);
}

function rewriteImages(html: string, docPath: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const image of template.content.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    if (!source || ABSOLUTE.test(source)) {
      continue;
    }
    image.setAttribute("src", convertFileSrc(resolveRelative(docPath, source)));
  }

  return template.innerHTML;
}
