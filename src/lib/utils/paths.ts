export function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

export function resolveRelative(docPath: string, href: string): string {
  const stripped = href.split("#")[0].split("?")[0];
  if (!stripped) {
    return docPath;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
    return stripped;
  }
  if (stripped.startsWith("/")) {
    return stripped;
  }

  const base = docPath.slice(0, docPath.lastIndexOf("/") + 1);
  const combined = base + stripped;
  const absolute = combined.startsWith("/");
  const parts: string[] = [];

  for (const part of combined.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return `${absolute ? "/" : ""}${parts.join("/")}`;
}
