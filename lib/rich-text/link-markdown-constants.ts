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

/**
 * Regular expressions used to detect links in plain text.
 *
 * The URL character classes exclude both `)` and `]` so a URL wrapped in
 * brackets or parentheses (`[https://example.com/path]`) stops at the closing
 * delimiter instead of swallowing it into the link target. Balanced `(...)`
 * inside the URL is still matched through the dedicated paren-balancing group.
 */
export const LINK_PATTERN = {
  bareDomain: /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)\]]*$/,
  containsWhitespace: /\s/,
  bareUrl:
    /(?:https?:\/\/[^\s<>)\]]*(?:\([^\s<>()]*\)[^\s<>)\]]*)*|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)\]]*(?:\([^\s<>()]*\)[^\s<>)\]]*)*)/g,
  hostBoundary: /[/?#:]/,
  markdown: /\[((?:\\[\s\S]|[^\]\\])+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)/g,
  protocolPrefix: /^https?:\/\//i,
  trailingPunctuation: /[.,!?;:]+$/,
  whitespace: /^\s+$/,
} as const;

/**
 * Public top-level domains recognized when auto-linking a scheme-less bare
 * domain found in prose. `new URL()` accepts any syntactically valid hostname,
 * so without this allowlist Spanish abbreviations like `EE.UU.` or
 * end-of-sentence transitions like `China.Por` would resolve to bogus hosts and
 * become clickable links. It covers the common gTLDs plus every assigned
 * two-letter ccTLD; unknown suffixes such as `uu` or `por` are intentionally
 * absent. This gates only the automatic detection path: explicit `http(s)://`
 * URLs and links the user pastes deliberately bypass it and stay permissive.
 */
export const KNOWN_TOP_LEVEL_DOMAINS = new Set<string>([
  // Common generic TLDs.
  "com", "net", "org", "info", "biz", "name", "pro", "int", "edu", "gov",
  "mil", "app", "dev", "io", "co", "ai", "xyz", "online", "site", "tech",
  "store", "shop", "blog", "me", "tv", "cc", "live", "life", "world", "fun",
  "space", "website", "page", "web", "link", "click", "news", "media",
  "studio", "design", "art", "email", "cloud", "digital", "network", "agency",
  "company", "group", "team", "work", "works", "today", "ltd", "inc", "llc",
  "academy", "school", "courses", "education", "events", "social", "chat",
  "video", "photo", "photos", "games", "game", "finance", "money", "health",
  "fit", "run", "travel", "tours", "global", "international", "solutions",
  "systems", "consulting", "marketing", "software", "host", "hosting", "wiki",
  // Two-letter country-code TLDs.
  "ac", "ad", "ae", "af", "ag", "al", "am", "ao", "aq", "ar", "as", "at",
  "au", "aw", "ax", "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi",
  "bj", "bm", "bn", "bo", "br", "bs", "bt", "bw", "by", "bz", "ca", "cd",
  "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn", "cr", "cu", "cv", "cw",
  "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee", "eg",
  "er", "es", "et", "eu", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gd",
  "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs",
  "gt", "gu", "gw", "gy", "hk", "hm", "hn", "hr", "ht", "hu", "id", "ie",
  "il", "im", "in", "iq", "ir", "is", "it", "je", "jm", "jo", "jp", "ke",
  "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la", "lb",
  "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md",
  "mg", "mh", "mk", "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt",
  "mu", "mv", "mw", "mx", "my", "mz", "na", "nc", "ne", "nf", "ng", "ni",
  "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg", "ph",
  "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro",
  "rs", "ru", "rw", "sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sk",
  "sl", "sm", "sn", "so", "sr", "ss", "st", "sv", "sx", "sy", "sz", "tc",
  "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to", "tr", "tt",
  "tw", "tz", "ua", "ug", "uk", "us", "uy", "uz", "va", "vc", "ve", "vg",
  "vi", "vn", "vu", "wf", "ws", "ye", "yt", "za", "zm", "zw",
]);

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
