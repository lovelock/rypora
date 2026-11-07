export type Platform = "macos" | "windows" | "linux";

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return "macos";
  }
  if (/Windows/i.test(ua)) {
    return "windows";
  }
  return "linux";
}

export function applyPlatform(root: HTMLElement, ua?: string): Platform {
  const platform = detectPlatform(ua);
  root.dataset.platform = platform;
  return platform;
}
