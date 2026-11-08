// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { buildTableTemplate, tableInsertion } from "../src/lib/editor/table";

describe("buildTableTemplate", () => {
  test("builds a header, separator and body rows", () => {
    expect(buildTableTemplate(2, 3)).toBe(
      "|  |  |  |\n| --- | --- | --- |\n|  |  |  |",
    );
  });

  test("supports a header-only table", () => {
    expect(buildTableTemplate(1, 2)).toBe("|  |  |\n| --- | --- |");
  });

  test("clamps rows and columns to 1..8", () => {
    expect(buildTableTemplate(0, 0)).toBe("|  |\n| --- |");
    expect(buildTableTemplate(99, 99).split("\n")).toHaveLength(9);
  });
});

describe("tableInsertion", () => {
  test("inserts a table on an empty line and places the cursor in the first cell", () => {
    const doc = "hello\n\nworld";
    const state = EditorState.create({ doc, selection: { anchor: 6 } });

    const { changes, anchor } = tableInsertion(state.doc, 6, 6, 2, 2);
    const next = state.update({ changes, selection: { anchor } }).state;

    expect(next.doc.toString()).toBe(
      "hello\n\n|  |  |\n| --- | --- |\n|  |  |\n\nworld",
    );
    expect(next.selection.main.anchor).toBe(9);
  });

  test("separates the table from text when inserting mid-line", () => {
    const doc = "hello world";
    const state = EditorState.create({ doc, selection: { anchor: 5 } });

    const { changes, anchor } = tableInsertion(state.doc, 5, 5, 1, 1);
    const next = state.update({ changes, selection: { anchor } }).state;

    expect(next.doc.toString()).toBe("hello\n\n|  |\n| --- |\n\n world");
    expect(next.selection.main.anchor).toBe(9);
  });
});
