import { convertFileSrc } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { resolveRelative } from "../utils/paths";
import { stripFrontmatter } from "../utils/frontmatter";

const REMOTE = /^(?:https?:|data:|blob:|\/\/)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

export function renderMarkdownHtml(markdown: string, docPath: string): string {
  const raw = marked.parse(stripFrontmatter(markdown), { gfm: true, async: false }) as string;
  const rewritten = rewriteImages(raw, docPath);

  return DOMPurify.sanitize(rewritten, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "button"],
    FORBID_ATTR: ["style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp|asset|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  }) as string;
}

function rewriteImages(html: string, docPath: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const image of template.content.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    if (!source || REMOTE.test(source)) {
      continue;
    }

    const local = decodePath(source);
    if (SCHEME.test(local) && !WINDOWS_DRIVE.test(local)) {
      continue;
    }
    image.setAttribute("src", convertFileSrc(resolveRelative(docPath, local)));
  }

  return template.innerHTML;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
