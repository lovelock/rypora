import { describe, expect, test } from "vitest";
import { attachmentName, imageMarkdown } from "../src/lib/editor/attachment";

describe("attachmentName", () => {
  test("maps image mime types to extensions", () => {
    expect(attachmentName("image/png", 1)).toBe("pasted-1.png");
    expect(attachmentName("image/jpeg", 1)).toBe("pasted-1.jpg");
    expect(attachmentName("image/svg+xml", 1)).toBe("pasted-1.svg");
  });

  test("rejects other types", () => {
    expect(attachmentName("text/plain", 1)).toBeNull();
  });
});

describe("imageMarkdown", () => {
  test("builds an image link", () => {
    expect(imageMarkdown("assets/a.png")).toBe("![](assets/a.png)");
  });
});
