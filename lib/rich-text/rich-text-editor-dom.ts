/**
 * DOM helpers that translate between the rich link editor's plain-text offsets
 * and the browser `Selection`/`Range` API. Kept apart from the pure helpers so
 * the latter can be unit-tested without a DOM.
 */

import type { RichTextSelectionRange } from "@/lib/rich-text/link-markdown-types";

/**
 * Returns the plain-text character offset within `editor` for a DOM
 * `(container, offset)` boundary, or `null` when it cannot be resolved.
 */
export function getEditorBoundaryOffset(
  editor: HTMLDivElement,
  container: Node,
  offset: number
): number | null {
  const boundaryRange = document.createRange();

  boundaryRange.selectNodeContents(editor);

  try {
    boundaryRange.setEnd(container, offset);
  } catch {
    return null;
  }

  return boundaryRange.toString().length;
}

/**
 * Reads the current selection as a plain-text offset range within `editor`, or
 * `null` when there is no selection inside the editor.
 */
export function getEditorSelectionRange(
  editor: HTMLDivElement
): RichTextSelectionRange | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  if (!anchorNode || !focusNode) {
    return null;
  }

  if (!editor.contains(anchorNode) || !editor.contains(focusNode)) {
    return null;
  }

  const anchorOffset = getEditorBoundaryOffset(
    editor,
    anchorNode,
    selection.anchorOffset
  );
  const focusOffset = getEditorBoundaryOffset(
    editor,
    focusNode,
    selection.focusOffset
  );

  if (anchorOffset === null || focusOffset === null) {
    return null;
  }

  return {
    end: Math.max(anchorOffset, focusOffset),
    start: Math.min(anchorOffset, focusOffset),
  };
}

/**
 * Resolves a plain-text offset within `editor` to a DOM `(node, offset)`
 * boundary, walking its text nodes.
 */
export function getEditorTextBoundary(
  editor: HTMLDivElement,
  targetOffset: number
): { node: Node; offset: number } {
  const textNodeWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remainingOffset = targetOffset;
  let currentNode = textNodeWalker.nextNode();

  while (currentNode) {
    const currentTextLength = currentNode.textContent?.length ?? 0;

    if (remainingOffset <= currentTextLength) {
      return {
        node: currentNode,
        offset: remainingOffset,
      };
    }

    remainingOffset -= currentTextLength;
    currentNode = textNodeWalker.nextNode();
  }

  return {
    node: editor,
    offset: editor.childNodes.length,
  };
}

/** Restores a plain-text offset range as the live selection inside `editor`. */
export function setEditorSelectionRange(
  editor: HTMLDivElement,
  selectionRange: RichTextSelectionRange
): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const editorRange = document.createRange();
  const startBoundary = getEditorTextBoundary(editor, selectionRange.start);
  const endBoundary = getEditorTextBoundary(editor, selectionRange.end);

  editorRange.setStart(startBoundary.node, startBoundary.offset);
  editorRange.setEnd(endBoundary.node, endBoundary.offset);
  selection.removeAllRanges();
  selection.addRange(editorRange);
}
