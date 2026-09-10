import { describe, it, expect, afterEach } from "vitest";
import {
  getEditorSelectionRange,
  getEditorTextBoundary,
  setEditorSelectionRange,
} from "@/lib/rich-text/rich-text-editor-dom";

function buildEditor(text: string): HTMLDivElement {
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.append(document.createTextNode(text));
  document.body.append(editor);
  return editor;
}

describe("rich text editor DOM helpers", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("resolves a plain-text offset to a DOM text boundary", () => {
    const editor = buildEditor("el curso");

    const boundary = getEditorTextBoundary(editor, 3);

    expect(boundary.node.textContent).toBe("el curso");
    expect(boundary.offset).toBe(3);
  });

  it("round-trips a selection range through set and get", () => {
    const editor = buildEditor("el curso es lo mejor");

    setEditorSelectionRange(editor, { end: 8, start: 3 });

    expect(getEditorSelectionRange(editor)).toEqual({ end: 8, start: 3 });
  });

  it("returns null when the selection is outside the editor", () => {
    const editor = buildEditor("el curso");
    const outside = document.createElement("p");
    outside.textContent = "afuera";
    document.body.append(outside);

    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(getEditorSelectionRange(editor)).toBeNull();
  });
});
