import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch {
    // Tauri 插件不可用时继续降级。
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 浏览器/WebView 没有剪贴板 API 时继续降级。
  }

  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  area.remove();
  return copied;
}
