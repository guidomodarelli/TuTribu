/**
 * Shared constants for the rich-text link layer.
 *
 * These values back both the read-only renderer (`RichTextContent`) and the
 * rich link editor (`RichLinkEditor` / `useRichLinkEditor`). They are framework
 * safe and free of business rules, so they live under `lib` and can be reused by
 * any feature that needs autolinking plus `[text](url)` markdown support.
 */

/** URL protocols accepted when normalizing a markdown link target. */
export const LINK_MARKDOWN_ALLOWED_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

/** Protocol prepended to bare domains that lack an explicit scheme. */
export const LINK_PROTOCOL_PREFIX = {
  default: "https://",
} as const;

/** Tokens used to assemble and recognize `[text](url)` markdown links. */
export const LINK_MARKDOWN_FORMAT = {
  closeLabel: "]",
  closeUrl: ")",
  openLabel: "[",
  openUrl: "](",
  suppressedUrl: "#",
} as const;

/** Patterns matching characters that must be escaped inside link label text. */
export const LINK_MARKDOWN_ESCAPE_PATTERN = {
  backslash: /\\/g,
  closeLabel: /\]/g,
  lineBreak: /\n/g,
  openLabel: /\[/g,
} as const;

/** Escape sequences paired with `LINK_MARKDOWN_ESCAPE_PATTERN`. */
export const LINK_MARKDOWN_ESCAPE_VALUE = {
  backslash: "\\",
  escapedBackslash: "\\\\",
  escapedCloseLabel: "\\]",
  escapedLineBreak: "\\n",
  escapedOpenLabel: "\\[",
  lineBreakToken: "n",
} as const;

/** Discriminant for the parsed rich-text segments (plain text vs. link). */
export const RICH_TEXT_SEGMENT_TYPE = {
  link: "link",
  text: "text",
} as const;

/** Whether an editor link is explicit (`[text](url)`) or a suppressed autolink. */
export const RICH_LINK_KIND = {
  explicit: "explicit",
  suppressed: "suppressed",
} as const;

/** Origin of a preview link segment: auto-detected URL vs. explicit link. */
export const RICH_PREVIEW_LINK_SOURCE = {
  automatic: "automatic",
  explicit: "explicit",
} as const;

/** Editing modes of the link popover. */
export const RICH_LINK_POPOVER_MODE = {
  actions: "actions",
  edit: "edit",
} as const;

/** Regular expressions used to detect links in plain text. */
export const LINK_PATTERN = {
  bareDomain: /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)]*$/,
  bareUrl:
    /(?:https?:\/\/[^\s<>)]*(?:\([^\s<>()]*\)[^\s<>)]*)*|www\.(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)]*(?:\([^\s<>()]*\)[^\s<>)]*)*)/g,
  markdown: /\[((?:\\[\s\S]|[^\]\\])+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)/g,
  protocolPrefix: /^https?:\/\//i,
  trailingPunctuation: /[.,!?;:]+$/,
  whitespace: /^\s+$/,
} as const;

/** Capture group indexes of `LINK_PATTERN.markdown`. */
export const LINK_MARKDOWN_MATCH_GROUP = {
  text: 1,
  url: 2,
} as const;

/** Sentinel returned by the text diff when no change is found. */
export const TEXT_DIFF_FALLBACK_INDEX = {
  notFound: -1,
} as const;

/** Separator used to build a stable key for preview link segments. */
export const PREVIEW_LINK_KEY_SEPARATOR = {
  value: ":",
} as const;

/** Clipboard data type read on paste inside the editor. */
export const RICH_TEXT_CLIPBOARD_DATA_TYPE = {
  plainText: "text/plain",
} as const;

/** `InputEvent.inputType` values handled by the editor's `beforeInput`. */
export const RICH_TEXT_EDITOR_INPUT_TYPE = {
  deleteContentBackward: "deleteContentBackward",
  deleteContentForward: "deleteContentForward",
  insertLineBreak: "insertLineBreak",
  insertParagraph: "insertParagraph",
  insertText: "insertText",
} as const;

/** Keyboard keys handled by the editor's `keydown`. */
export const RICH_TEXT_EDITOR_KEY = {
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
} as const;

/** Direction of a word-wise deletion. */
export const RICH_TEXT_EDITOR_WORD_DIRECTION = {
  backward: "backward",
  forward: "forward",
} as const;

/** Length of a single editable character. */
export const RICH_TEXT_EDITOR_KEY_LENGTH = {
  character: 1,
} as const;

/** Literal text tokens used by the editor. */
export const RICH_TEXT_EDITOR_TEXT = {
  lineBreak: "\n",
} as const;
