const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export function attachmentName(mime: string, now = Date.now()): string | null {
  const extension = EXTENSIONS[mime.toLowerCase()];
  return extension ? `pasted-${now}.${extension}` : null;
}

export function imageMarkdown(path: string, alt = ""): string {
  return `![${alt}](${path})`;
}
