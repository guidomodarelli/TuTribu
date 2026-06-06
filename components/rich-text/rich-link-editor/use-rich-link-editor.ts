"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  RICH_LINK_KIND,
  RICH_LINK_POPOVER_MODE,
  RICH_PREVIEW_LINK_SOURCE,
  RICH_TEXT_CLIPBOARD_DATA_TYPE,
  RICH_TEXT_EDITOR_INPUT_TYPE,
  RICH_TEXT_EDITOR_KEY,
  RICH_TEXT_EDITOR_KEY_LENGTH,
  RICH_TEXT_EDITOR_TEXT,
  RICH_TEXT_EDITOR_WORD_DIRECTION,
} from "@/lib/rich-text/link-markdown-constants";
import {
  deserializeMarkdownForEditor,
  getLinksAfterTextChange,
  getWordDeletionRange,
  isLinkSynchronized,
  normalizeMarkdownUrl,
  parsePreviewSegments,
  rangesOverlap,
  serializeEditorContent,
} from "@/lib/rich-text/link-markdown";
import {
  getEditorSelectionRange,
  setEditorSelectionRange,
} from "@/lib/rich-text/rich-text-editor-dom";
import type {
  ActiveRichPreviewLink,
  RichLink,
  RichPreviewSegment,
  RichTextSelectionRange,
} from "@/lib/rich-text/link-markdown-types";

const EMPTY_TEXT = "";

type RichLinkPopoverMode =
  (typeof RICH_LINK_POPOVER_MODE)[keyof typeof RICH_LINK_POPOVER_MODE];

/** Plain-text content plus tracked links, used to snapshot/restore the editor. */
export type RichLinkEditorDisplayState = {
  content: string;
  links: RichLink[];
};

type UseRichLinkEditorOptions = {
  /** Persisted markdown loaded as the initial editor value. */
  initialMarkdown?: string;
  /** Called whenever the author changes the content (e.g. to clear errors). */
  onContentChange?: () => void;
};

/** Imperative + reactive API exposed by `useRichLinkEditor` to the editor UI. */
export type RichLinkEditorController = {
  setEditorElement: (node: HTMLDivElement | null) => void;
  segments: RichPreviewSegment[];
  hasContent: boolean;
  content: string;
  activeLink: ActiveRichPreviewLink | null;
  linkTextInput: string;
  linkUrlInput: string;
  popoverMode: RichLinkPopoverMode;
  setLinkTextInput: (value: string) => void;
  setLinkUrlInput: (value: string) => void;
  setPopoverMode: (mode: RichLinkPopoverMode) => void;
  handleBeforeInput: (event: FormEvent<HTMLDivElement>) => void;
  handleInput: (event: FormEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handlePaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  openLinkPopover: (segment: ActiveRichPreviewLink) => void;
  closeLinkPopover: () => void;
  removeLink: (segment: ActiveRichPreviewLink) => void;
  saveLinkEdit: (segment: ActiveRichPreviewLink) => void;
  serialize: () => string;
  reset: (markdown?: string) => void;
  getDisplayState: () => RichLinkEditorDisplayState;
  loadFromDisplay: (state: RichLinkEditorDisplayState) => void;
};

/**
 * Controls a rich link editor backed by a `contentEditable` element: it owns the
 * plain-text content, the tracked explicit/suppressed links, the link popover
 * state, and the selection bookkeeping, and exposes serialize/reset/snapshot
 * helpers so a feature can persist or restore the value. The DOM rendering lives
 * in `RichLinkEditor`.
 */
export function useRichLinkEditor(
  options: UseRichLinkEditorOptions = {}
): RichLinkEditorController {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const setEditorElement = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
  }, []);
  const pendingSelectionRef = useRef<RichTextSelectionRange | null>(null);

  const [content, setContent] = useState(
    () => deserializeMarkdownForEditor(options.initialMarkdown ?? EMPTY_TEXT).content
  );
  const [links, setLinks] = useState<RichLink[]>(
    () => deserializeMarkdownForEditor(options.initialMarkdown ?? EMPTY_TEXT).links
  );
  const [activeLink, setActiveLink] = useState<ActiveRichPreviewLink | null>(
    null
  );
  const [linkTextInput, setLinkTextInput] = useState("");
  const [linkUrlInput, setLinkUrlInput] = useState("");
  const [popoverMode, setPopoverMode] = useState<RichLinkPopoverMode>(
    RICH_LINK_POPOVER_MODE.actions
  );

  const segments = parsePreviewSegments(content, links);
  const hasContent = content.trim().length > 0;

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const selectionRange = pendingSelectionRef.current;

    if (
      !editor ||
      !selectionRange ||
      !editor.contains(document.activeElement)
    ) {
      return;
    }

    setEditorSelectionRange(editor, selectionRange);
    pendingSelectionRef.current = null;
  }, [content, links]);

  const handleContentChange = (nextContent: string) => {
    setLinks((currentLinks) =>
      getLinksAfterTextChange({
        links: currentLinks,
        nextText: nextContent,
        previousText: content,
      })
    );
    setContent(nextContent);
    options.onContentChange?.();
  };

  const replaceContentText = (
    replacementText: string,
    selectionRange: RichTextSelectionRange
  ) => {
    const nextSelectionOffset = selectionRange.start + replacementText.length;
    const nextContent =
      content.slice(0, selectionRange.start) +
      replacementText +
      content.slice(selectionRange.end);

    pendingSelectionRef.current = {
      end: nextSelectionOffset,
      start: nextSelectionOffset,
    };
    handleContentChange(nextContent);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData(
      RICH_TEXT_CLIPBOARD_DATA_TYPE.plainText
    );
    const pastedUrl = normalizeMarkdownUrl(pastedText);
    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: content.length,
      start: content.length,
    };
    const hasSelectedText = selectionRange.start !== selectionRange.end;

    event.preventDefault();

    if (!pastedUrl || !hasSelectedText) {
      replaceContentText(pastedText, selectionRange);

      return;
    }

    pendingSelectionRef.current = selectionRange;
    setLinks((currentLinks) => [
      ...currentLinks.filter(
        (link) =>
          !rangesOverlap(link, {
            end: selectionRange.end,
            start: selectionRange.start,
          })
      ),
      {
        end: selectionRange.end,
        id: crypto.randomUUID(),
        isSynced: isLinkSynchronized(
          content.slice(selectionRange.start, selectionRange.end),
          pastedUrl
        ),
        kind: RICH_LINK_KIND.explicit,
        start: selectionRange.start,
        url: pastedUrl,
      },
    ]);
    options.onContentChange?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.metaKey) {
      return;
    }

    if (
      event.ctrlKey &&
      event.key !== RICH_TEXT_EDITOR_KEY.backspace &&
      event.key !== RICH_TEXT_EDITOR_KEY.delete
    ) {
      return;
    }

    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: content.length,
      start: content.length,
    };
    let replacementText: string | null = null;
    let replacementRange = selectionRange;

    if (event.key.length === RICH_TEXT_EDITOR_KEY_LENGTH.character) {
      replacementText = event.key;
    }

    if (event.key === RICH_TEXT_EDITOR_KEY.enter) {
      replacementText = RICH_TEXT_EDITOR_TEXT.lineBreak;
    }

    if (event.key === RICH_TEXT_EDITOR_KEY.backspace) {
      replacementText = EMPTY_TEXT;
      replacementRange = event.ctrlKey
        ? getWordDeletionRange({
            direction: RICH_TEXT_EDITOR_WORD_DIRECTION.backward,
            selectionRange,
            text: content,
          })
        : selectionRange.start === selectionRange.end
          ? {
              end: selectionRange.end,
              start: Math.max(selectionRange.start - 1, 0),
            }
          : selectionRange;
    }

    if (event.key === RICH_TEXT_EDITOR_KEY.delete) {
      replacementText = EMPTY_TEXT;
      replacementRange = event.ctrlKey
        ? getWordDeletionRange({
            direction: RICH_TEXT_EDITOR_WORD_DIRECTION.forward,
            selectionRange,
            text: content,
          })
        : selectionRange.start === selectionRange.end
          ? {
              end: Math.min(selectionRange.end + 1, content.length),
              start: selectionRange.start,
            }
          : selectionRange;
    }

    if (replacementText === null) {
      return;
    }

    event.preventDefault();
    replaceContentText(replacementText, replacementRange);
  };

  const handleBeforeInput = (event: FormEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: content.length,
      start: content.length,
    };
    let replacementText: string | null = null;
    let replacementRange = selectionRange;

    if (nativeEvent.inputType === RICH_TEXT_EDITOR_INPUT_TYPE.insertText) {
      replacementText = nativeEvent.data ?? EMPTY_TEXT;
    }

    if (
      nativeEvent.inputType === RICH_TEXT_EDITOR_INPUT_TYPE.insertParagraph ||
      nativeEvent.inputType === RICH_TEXT_EDITOR_INPUT_TYPE.insertLineBreak
    ) {
      replacementText = RICH_TEXT_EDITOR_TEXT.lineBreak;
    }

    if (
      nativeEvent.inputType ===
      RICH_TEXT_EDITOR_INPUT_TYPE.deleteContentBackward
    ) {
      replacementText = EMPTY_TEXT;
      replacementRange =
        selectionRange.start === selectionRange.end
          ? {
              end: selectionRange.end,
              start: Math.max(selectionRange.start - 1, 0),
            }
          : selectionRange;
    }

    if (
      nativeEvent.inputType === RICH_TEXT_EDITOR_INPUT_TYPE.deleteContentForward
    ) {
      replacementText = EMPTY_TEXT;
      replacementRange =
        selectionRange.start === selectionRange.end
          ? {
              end: Math.min(selectionRange.end + 1, content.length),
              start: selectionRange.start,
            }
          : selectionRange;
    }

    if (replacementText === null) {
      return;
    }

    event.preventDefault();
    replaceContentText(replacementText, replacementRange);
  };

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const selectionRange = getEditorSelectionRange(event.currentTarget);

    if (selectionRange) {
      pendingSelectionRef.current = selectionRange;
    }

    handleContentChange(event.currentTarget.textContent ?? EMPTY_TEXT);
  };

  const openLinkPopover = (segment: ActiveRichPreviewLink) => {
    setActiveLink(segment);
    setLinkTextInput(segment.text);
    setLinkUrlInput(segment.url);
    setPopoverMode(RICH_LINK_POPOVER_MODE.actions);
  };

  const closeLinkPopover = () => {
    setActiveLink(null);
    setLinkTextInput(EMPTY_TEXT);
    setLinkUrlInput(EMPTY_TEXT);
    setPopoverMode(RICH_LINK_POPOVER_MODE.actions);
  };

  const removeLink = (segment: ActiveRichPreviewLink) => {
    const shouldSuppressVisibleUrl = Boolean(normalizeMarkdownUrl(segment.text));
    const suppressedLink: RichLink = {
      end: segment.end,
      id: crypto.randomUUID(),
      kind: RICH_LINK_KIND.suppressed,
      start: segment.start,
    };

    setLinks((currentLinks) => {
      const linksWithoutRemovedExplicitLink =
        segment.source === RICH_PREVIEW_LINK_SOURCE.explicit && segment.id
          ? currentLinks.filter((link) => link.id !== segment.id)
          : currentLinks;

      return shouldSuppressVisibleUrl ||
        segment.source === RICH_PREVIEW_LINK_SOURCE.automatic
        ? [...linksWithoutRemovedExplicitLink, suppressedLink]
        : linksWithoutRemovedExplicitLink;
    });

    closeLinkPopover();
  };

  const saveLinkEdit = (segment: ActiveRichPreviewLink) => {
    const nextUrl = normalizeMarkdownUrl(linkUrlInput);
    const nextText = linkTextInput;

    if (!nextUrl || !nextText.trim()) {
      return;
    }

    const nextContent =
      content.slice(0, segment.start) + nextText + content.slice(segment.end);
    const nextEnd = segment.start + nextText.length;
    const nextLinkRange = {
      end: nextEnd,
      start: segment.start,
    };

    pendingSelectionRef.current = {
      end: nextEnd,
      start: nextEnd,
    };
    setContent(nextContent);
    setLinks((currentLinks) => {
      const adjustedLinks = getLinksAfterTextChange({
        links: currentLinks,
        nextText: nextContent,
        previousText: content,
      });

      return [
        ...adjustedLinks.filter((link) => {
          if (segment.id && link.id === segment.id) {
            return false;
          }

          return !rangesOverlap(link, nextLinkRange);
        }),
        {
          end: nextEnd,
          id: segment.id ?? crypto.randomUUID(),
          isSynced: isLinkSynchronized(nextText, nextUrl),
          kind: RICH_LINK_KIND.explicit,
          start: segment.start,
          url: nextUrl,
        },
      ];
    });
    closeLinkPopover();
  };

  const serialize = () => serializeEditorContent(content, links);

  const reset = (markdown?: string) => {
    const nextState = deserializeMarkdownForEditor(markdown ?? EMPTY_TEXT);
    pendingSelectionRef.current = null;
    setContent(nextState.content);
    setLinks(nextState.links);
    closeLinkPopover();
  };

  const getDisplayState = (): RichLinkEditorDisplayState => ({
    content,
    links: links.map((link) => ({ ...link })),
  });

  const loadFromDisplay = (state: RichLinkEditorDisplayState) => {
    pendingSelectionRef.current = null;
    setContent(state.content);
    setLinks(state.links.map((link) => ({ ...link })));
    closeLinkPopover();
  };

  return {
    activeLink,
    closeLinkPopover,
    content,
    getDisplayState,
    handleBeforeInput,
    handleInput,
    handleKeyDown,
    handlePaste,
    hasContent,
    linkTextInput,
    linkUrlInput,
    loadFromDisplay,
    openLinkPopover,
    popoverMode,
    removeLink,
    reset,
    saveLinkEdit,
    segments,
    serialize,
    setEditorElement,
    setLinkTextInput,
    setLinkUrlInput,
    setPopoverMode,
  };
}
