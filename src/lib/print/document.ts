import { highlightCodeBlocks } from "./highlight";
import { renderMarkdownHtml } from "../markdown/render";

let printing = false;

export async function buildPrintDocument(markdown: string, docPath: string): Promise<HTMLElement> {
  const article = document.createElement("article");
  article.className = "print-root";
  article.innerHTML = renderMarkdownHtml(markdown, docPath);
  await highlightCodeBlocks(article);
  return article;
}

export async function printDocument(article: HTMLElement, title: string): Promise<boolean> {
  if (printing) {
    return true;
  }
  printing = true;

  const previousTitle = document.title;
  let fallback: number | undefined;

  const cleanup = (): void => {
    printing = false;
    document.documentElement.classList.remove("printing");
    article.remove();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
    if (fallback !== undefined) {
      window.clearTimeout(fallback);
      fallback = undefined;
    }
  };

  document.title = title;
  document.querySelectorAll(".print-root").forEach((node) => node.remove());
  document.body.appendChild(article);
  document.documentElement.classList.add("printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  fallback = window.setTimeout(cleanup, 60_000);

  try {
    await waitForImages(article);
    if (document.fonts) {
      await document.fonts.ready;
    }
    window.print();
    return true;
  } catch {
    cleanup();
    return false;
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const done = (): void => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };

          image.addEventListener("load", done);
          image.addEventListener("error", done);
          window.setTimeout(done, 3000);
        }),
    ),
  );
}
