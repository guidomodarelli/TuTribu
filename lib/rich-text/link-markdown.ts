/**
 * Pure helpers for the rich-text link layer: URL normalization, markdown
 * link (de)serialization, plain-text autolink parsing, and editor link
 * bookkeeping. None of these touch the DOM, so they are unit-testable in
 * isolation and shared by the renderer, the editor hook, and persistence.
 */

import {
  KNOWN_TOP_LEVEL_DOMAINS,
  LINK_MARKDOWN_ALLOWED_PROTOCOL,
  LINK_MARKDOWN_ESCAPE_PATTERN,
  LINK_MARKDOWN_ESCAPE_VALUE,
  LINK_MARKDOWN_FORMAT,
  LINK_MARKDOWN_MATCH_GROUP,
  LINK_MARKDOWN_URL_PAREN,
  LINK_PATTERN,
  LINK_PROTOCOL_PREFIX,
  PREVIEW_LINK_KEY_SEPARATOR,
  RICH_LINK_KIND,
  RICH_PREVIEW_LINK_SOURCE,
  RICH_TEXT_EDITOR_TEXT,
  RICH_TEXT_EDITOR_WORD_DIRECTION,
  RICH_TEXT_SEGMENT_TYPE,
  TEXT_DIFF_FALLBACK_INDEX,
} from "@/lib/rich-text/link-markdown-constants";
import type {
  RichLink,
  RichPreviewSegment,
  RichTextSegment,
  RichTextSelectionRange,
} from "@/lib/rich-text/link-markdown-types";

const EMAIL_LOCAL_PART_SEPARATOR = "@";

/** Separator between the labels of a host name (`sub.example.com`). */
const LINK_HOST_LABEL_SEPARATOR = ".";

/** A linkable host needs at least a domain label and a TLD label. */
const MINIMUM_HOST_LABELS = 2;

/**
 * Normalizes a raw markdown URL into a safe absolute `http(s)` URL, or `null`
 * when it is not a usable web link. Bare domains gain an `https://` prefix.
 *
 * A candidate that contains whitespace is returned as its parsed `href`, which
 * percent-encodes those characters. The renderer's `LINK_PATTERN.markdown` URL
 * group forbids whitespace, so persisting the raw candidate would serialize a
 * `[text](url with space)` link that cannot be read back and renders as broken
 * markdown. Whitespace-free candidates are returned verbatim to preserve their
 * exact form (no trailing slash, stable synchronization checks).
 *
 * A scheme-less candidate that parses into userinfo (`john.doe@example.com`) is
 * rejected: the `bareDomain` pattern allows `@` in its trailing class, so an
 * email or literal slips through and prepending `https://` would yield
 * `https://john.doe@example.com`, where the browser reads `john.doe` as
 * credentials for `example.com`. That turns the value into a misleading
 * outbound link, against the convention that email addresses are not linked.
 * The check uses the parsed `username`/`password` rather than a naive `@` scan
 * so a legitimate `@` past the authority (a path or query) still links.
 */
export function normalizeMarkdownUrl(
  rawUrl: string | null | undefined
): string | null {
  const trimmedUrl = rawUrl?.trim();

  if (!trimmedUrl) {
    return null;
  }

  const hasExplicitProtocol = LINK_PATTERN.protocolPrefix.test(trimmedUrl);
  const candidateUrl = hasExplicitProtocol
    ? trimmedUrl
    : LINK_PATTERN.bareDomain.test(trimmedUrl)
      ? LINK_PROTOCOL_PREFIX.default + trimmedUrl
      : null;

  if (!candidateUrl) {
    return null;
  }

  try {
    const url = new URL(candidateUrl);

    if (
      url.protocol !== LINK_MARKDOWN_ALLOWED_PROTOCOL.http &&
      url.protocol !== LINK_MARKDOWN_ALLOWED_PROTOCOL.https
    ) {
      return null;
    }

    if (!hasExplicitProtocol && (url.username || url.password)) {
      return null;
    }

    return LINK_PATTERN.containsWhitespace.test(candidateUrl)
      ? url.href
      : candidateUrl;
  } catch {
    return null;
  }
}

/**
 * Extracts the top-level domain (the last dot-separated label of the host) from
 * a bare or scheme-prefixed candidate, lowercased, or `null` when the candidate
 * has no host label past a dot. The host ends at the first path, query,
 * fragment, or port boundary so a path segment is never mistaken for the TLD.
 */
export function getCandidateTopLevelDomain(candidate: string): string | null {
  const host = candidate
    .replace(LINK_PATTERN.protocolPrefix, "")
    .split(LINK_PATTERN.hostBoundary)[0];
  const labels = host.split(LINK_HOST_LABEL_SEPARATOR);

  if (labels.length < MINIMUM_HOST_LABELS) {
    return null;
  }

  return labels[labels.length - 1].toLowerCase() || null;
}

/**
 * Normalizes a candidate for the automatic detection path. Scheme-prefixed URLs
 * are trusted and normalized as-is; a scheme-less bare domain is only accepted
 * when its TLD is a recognized public suffix, so prose abbreviations such as
 * `EE.UU.` or `China.Por` stay plain text instead of resolving to bogus hosts.
 * Explicit paste-as-link flows keep using `normalizeMarkdownUrl` directly and
 * stay permissive.
 */
export function normalizeAutolinkUrl(candidate: string): string | null {
  if (LINK_PATTERN.protocolPrefix.test(candidate)) {
    return normalizeMarkdownUrl(candidate);
  }

  const topLevelDomain = getCandidateTopLevelDomain(candidate);

  if (!topLevelDomain || !KNOWN_TOP_LEVEL_DOMAINS.has(topLevelDomain)) {
    return null;
  }

  return normalizeMarkdownUrl(candidate);
}

/** Strips the `http(s)://` prefix from a value for synchronization checks. */
export function removeLinkProtocolPrefix(value: string): string {
  return value.trim().replace(LINK_PATTERN.protocolPrefix, "");
}

/** Whether a link's visible text matches its URL ignoring the protocol. */
export function isLinkSynchronized(text: string, url: string): boolean {
  return removeLinkProtocolPrefix(text) === removeLinkProtocolPrefix(url);
}

/** Returns the protocol prefix of a URL, defaulting to `https://`. */
export function getLinkProtocolPrefix(url: string): string {
  const protocolPrefix = url.match(LINK_PATTERN.protocolPrefix)?.[0];

  return protocolPrefix ?? LINK_PROTOCOL_PREFIX.default;
}

/**
 * Rebuilds the URL of a synchronized link after its visible text changed, so a
 * link whose label is the URL keeps tracking the edited text.
 */
export function getSynchronizedLinkUrl(
  text: string,
  currentUrl: string
): string | null {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return null;
  }

  return normalizeMarkdownUrl(
    LINK_PATTERN.protocolPrefix.test(trimmedText)
      ? trimmedText
      : getLinkProtocolPrefix(currentUrl) + trimmedText
  );
}

/** Whether the value contains only whitespace. */
export function isWhitespaceOnly(value: string): boolean {
  return LINK_PATTERN.whitespace.test(value);
}

/**
 * Computes the range a word-wise deletion (Ctrl/Alt+Backspace/Delete) should
 * remove from a collapsed caret, mirroring native word deletion.
 */
export function getWordDeletionRange(input: {
  direction:
    | typeof RICH_TEXT_EDITOR_WORD_DIRECTION.backward
    | typeof RICH_TEXT_EDITOR_WORD_DIRECTION.forward;
  selectionRange: RichTextSelectionRange;
  text: string;
}): RichTextSelectionRange {
  if (input.selectionRange.start !== input.selectionRange.end) {
    return input.selectionRange;
  }

  if (input.direction === RICH_TEXT_EDITOR_WORD_DIRECTION.forward) {
    let end = input.selectionRange.end;

    while (end < input.text.length && isWhitespaceOnly(input.text[end])) {
      end += 1;
    }

    while (end < input.text.length && !isWhitespaceOnly(input.text[end])) {
      end += 1;
    }

    return {
      end,
      start: input.selectionRange.start,
    };
  }

  let start = input.selectionRange.start;

  while (start > 0 && isWhitespaceOnly(input.text[start - 1])) {
    start -= 1;
  }

  while (start > 0 && !isWhitespaceOnly(input.text[start - 1])) {
    start -= 1;
  }

  return {
    end: input.selectionRange.end,
    start,
  };
}

/**
 * Finds the index of the `)` that closes a balanced single-level paren pair
 * opened at `openIndex`, or `null` when the run cannot form one the markdown URL
 * group accepts. A pair is balanced only when nothing but non-paren,
 * non-whitespace characters sit between the parens, mirroring the `\([^()\s]*\)`
 * alternative in `LINK_PATTERN.markdown`.
 */
function findBalancedParenCloseIndex(
  url: string,
  openIndex: number
): number | null {
  for (let index = openIndex + 1; index < url.length; index += 1) {
    const character = url[index];

    if (character === LINK_MARKDOWN_URL_PAREN.close) {
      return index;
    }

    if (
      character === LINK_MARKDOWN_URL_PAREN.open ||
      isWhitespaceOnly(character)
    ) {
      return null;
    }
  }

  return null;
}

/**
 * Percent-encodes the parentheses a URL cannot keep literal inside a
 * `[text](url)` target, so an explicit link whose URL contains an unmatched or
 * nested `(`/`)` (for example `https://example.com/a)b`) serializes to markdown
 * that `LINK_PATTERN.markdown` reads back as the same link instead of truncating
 * the target at the stray paren and spilling the rest into plain text.
 *
 * The URL group only matches balanced single-level `(...)` pairs, so those are
 * preserved verbatim (keeping links like `.../Foo_(bar)` intact); every other
 * paren becomes `%28`/`%29`, which is decoded back to the literal character when
 * the link is opened.
 */
export function escapeMarkdownLinkUrl(url: string): string {
  let escapedUrl = "";
  let index = 0;

  while (index < url.length) {
    const character = url[index];

    if (character === LINK_MARKDOWN_URL_PAREN.open) {
      const closeIndex = findBalancedParenCloseIndex(url, index);

      if (closeIndex !== null) {
        escapedUrl += url.slice(index, closeIndex + 1);
        index = closeIndex + 1;
        continue;
      }

      escapedUrl += LINK_MARKDOWN_URL_PAREN.encodedOpen;
      index += 1;
      continue;
    }

    if (character === LINK_MARKDOWN_URL_PAREN.close) {
      escapedUrl += LINK_MARKDOWN_URL_PAREN.encodedClose;
      index += 1;
      continue;
    }

    escapedUrl += character;
    index += 1;
  }

  return escapedUrl;
}

/** Builds a `[text](url)` markdown link, escaping the label and the URL. */
export function buildMarkdownLinkFromSelection(
  text: string,
  url: string
): string {
  return (
    LINK_MARKDOWN_FORMAT.openLabel +
    escapeMarkdownLinkText(text) +
    LINK_MARKDOWN_FORMAT.openUrl +
    escapeMarkdownLinkUrl(url) +
    LINK_MARKDOWN_FORMAT.closeUrl
  );
}

/** Escapes characters that would break a markdown link label. */
export function escapeMarkdownLinkText(text: string): string {
  return text
    .replace(
      LINK_MARKDOWN_ESCAPE_PATTERN.backslash,
      LINK_MARKDOWN_ESCAPE_VALUE.escapedBackslash
    )
    .replace(
      LINK_MARKDOWN_ESCAPE_PATTERN.lineBreak,
      LINK_MARKDOWN_ESCAPE_VALUE.escapedLineBreak
    )
    .replace(
      LINK_MARKDOWN_ESCAPE_PATTERN.openLabel,
      LINK_MARKDOWN_ESCAPE_VALUE.escapedOpenLabel
    )
    .replace(
      LINK_MARKDOWN_ESCAPE_PATTERN.closeLabel,
      LINK_MARKDOWN_ESCAPE_VALUE.escapedCloseLabel
    );
}

/** Reverses `escapeMarkdownLinkText`, restoring line breaks and literals. */
export function unescapeMarkdownLinkText(text: string): string {
  let unescapedText = "";

  for (let index = 0; index < text.length; index += 1) {
    const currentCharacter = text[index];
    const nextCharacter = text[index + 1];

    if (
      currentCharacter === LINK_MARKDOWN_ESCAPE_VALUE.backslash &&
      nextCharacter
    ) {
      unescapedText +=
        nextCharacter === LINK_MARKDOWN_ESCAPE_VALUE.lineBreakToken
          ? RICH_TEXT_EDITOR_TEXT.lineBreak
          : nextCharacter;
      index += 1;
    } else {
      unescapedText += currentCharacter;
    }
  }

  return unescapedText;
}

/** Builds a stable React key for a preview link segment. */
export function buildPreviewLinkKey(segment: {
  id?: string;
  source:
    | typeof RICH_PREVIEW_LINK_SOURCE.automatic
    | typeof RICH_PREVIEW_LINK_SOURCE.explicit;
  start: number;
  url: string;
}): string {
  return [segment.source, segment.id ?? String(segment.start), segment.url].join(
    PREVIEW_LINK_KEY_SEPARATOR.value
  );
}

/** Creates a plain-text rendered segment. */
export function createTextSegment(text: string): RichTextSegment {
  return {
    text,
    type: RICH_TEXT_SEGMENT_TYPE.text,
  };
}

/** Creates a link rendered segment. */
export function createLinkSegment(text: string, url: string): RichTextSegment {
  return {
    text,
    type: RICH_TEXT_SEGMENT_TYPE.link,
    url,
  };
}

/** Creates a plain-text editor preview segment. */
export function createTextPreviewSegment(text: string): RichPreviewSegment {
  return {
    text,
    type: RICH_TEXT_SEGMENT_TYPE.text,
  };
}

/** Creates a link editor preview segment with a stable key. */
export function createLinkPreviewSegment(input: {
  end: number;
  id?: string;
  source:
    | typeof RICH_PREVIEW_LINK_SOURCE.automatic
    | typeof RICH_PREVIEW_LINK_SOURCE.explicit;
  start: number;
  text: string;
  url: string;
}): RichPreviewSegment {
  return {
    ...input,
    key: buildPreviewLinkKey(input),
    type: RICH_TEXT_SEGMENT_TYPE.link,
  };
}

/** Splits a matched bare URL from any trailing sentence punctuation. */
export function splitBareUrlMatch(matchedUrl: string): {
  trailingText: string;
  urlText: string;
} {
  const urlText = matchedUrl.replace(LINK_PATTERN.trailingPunctuation, "");

  return {
    trailingText: matchedUrl.slice(urlText.length),
    urlText,
  };
}

/** Whether two `[start, end)` ranges overlap. */
export function rangesOverlap(
  firstRange: { end: number; start: number },
  secondRange: { end: number; start: number }
): boolean {
  return firstRange.start < secondRange.end && secondRange.start < firstRange.end;
}

/** Whether a matched bare URL is actually part of an email address. */
export function isBareUrlMatchInsideEmail(input: {
  content: string;
  matchedIndex: number;
  matchedUrl: string;
}): boolean {
  if (LINK_PATTERN.protocolPrefix.test(input.matchedUrl)) {
    return false;
  }

  return (
    input.matchedUrl.includes(EMAIL_LOCAL_PART_SEPARATOR) ||
    (input.matchedIndex > 0 &&
      input.content[input.matchedIndex - 1] === EMAIL_LOCAL_PART_SEPARATOR)
  );
}

/** Parses plain text into rendered segments, auto-linking bare URLs. */
export function parseBareUrlSegments(content: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(LINK_PATTERN.bareUrl)) {
    const matchedUrl = match[0];
    const { trailingText, urlText } = splitBareUrlMatch(matchedUrl);
    const matchedIndex = match.index ?? 0;
    const isEmailDomain = isBareUrlMatchInsideEmail({
      content,
      matchedIndex,
      matchedUrl,
    });
    const safeUrl = normalizeAutolinkUrl(urlText);

    if (matchedIndex > currentIndex) {
      segments.push(createTextSegment(content.slice(currentIndex, matchedIndex)));
    }

    segments.push(
      safeUrl && !isEmailDomain
        ? createLinkSegment(urlText, safeUrl)
        : createTextSegment(urlText)
    );
    if (trailingText) {
      segments.push(createTextSegment(trailingText));
    }
    currentIndex = matchedIndex + matchedUrl.length;
  }

  if (currentIndex < content.length) {
    segments.push(createTextSegment(content.slice(currentIndex)));
  }

  return segments;
}

/** Parses plain text into editor preview segments, auto-linking bare URLs. */
export function parseBareUrlPreviewSegments(
  content: string,
  offset: number,
  suppressedLinks: RichLink[]
): RichPreviewSegment[] {
  const segments: RichPreviewSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(LINK_PATTERN.bareUrl)) {
    const matchedUrl = match[0];
    const { trailingText, urlText } = splitBareUrlMatch(matchedUrl);
    const matchedIndex = match.index ?? 0;
    const absoluteStart = offset + matchedIndex;
    const absoluteEnd = absoluteStart + urlText.length;
    const isEmailDomain = isBareUrlMatchInsideEmail({
      content,
      matchedIndex,
      matchedUrl,
    });
    const safeUrl = normalizeAutolinkUrl(urlText);
    const isSuppressed = suppressedLinks.some((suppressedLink) =>
      rangesOverlap(suppressedLink, {
        end: absoluteEnd,
        start: absoluteStart,
      })
    );

    if (matchedIndex > currentIndex) {
      segments.push(
        createTextPreviewSegment(content.slice(currentIndex, matchedIndex))
      );
    }

    segments.push(
      safeUrl && !isEmailDomain && !isSuppressed
        ? createLinkPreviewSegment({
            end: absoluteEnd,
            source: RICH_PREVIEW_LINK_SOURCE.automatic,
            start: absoluteStart,
            text: urlText,
            url: safeUrl,
          })
        : createTextPreviewSegment(urlText)
    );
    if (trailingText) {
      segments.push(createTextPreviewSegment(trailingText));
    }
    currentIndex = matchedIndex + matchedUrl.length;
  }

  if (currentIndex < content.length) {
    segments.push(createTextPreviewSegment(content.slice(currentIndex)));
  }

  return segments;
}

/**
 * Parses the editor's plain-text content plus its tracked links into preview
 * segments, layering explicit links over auto-detected bare URLs.
 */
export function parsePreviewSegments(
  content: string,
  links: RichLink[]
): RichPreviewSegment[] {
  const segments: RichPreviewSegment[] = [];
  const visibleLinks = links
    .filter((link) => link.end > link.start)
    .sort((firstLink, secondLink) => firstLink.start - secondLink.start);
  const suppressedLinks = visibleLinks.filter(
    (link) => link.kind === RICH_LINK_KIND.suppressed
  );
  let currentIndex = 0;

  visibleLinks.forEach((link) => {
    if (link.start < currentIndex) {
      return;
    }

    if (link.start > currentIndex) {
      segments.push(
        ...parseBareUrlPreviewSegments(
          content.slice(currentIndex, link.start),
          currentIndex,
          suppressedLinks
        )
      );
    }

    const text = content.slice(link.start, link.end);

    segments.push(
      link.kind === RICH_LINK_KIND.explicit
        ? createLinkPreviewSegment({
            end: link.end,
            id: link.id,
            source: RICH_PREVIEW_LINK_SOURCE.explicit,
            start: link.start,
            text,
            url: link.url,
          })
        : createTextPreviewSegment(text)
    );
    currentIndex = link.end;
  });

  if (currentIndex < content.length) {
    segments.push(
      ...parseBareUrlPreviewSegments(
        content.slice(currentIndex),
        currentIndex,
        suppressedLinks
      )
    );
  }

  return segments;
}

/**
 * Whether a markdown link whose URL is not a safe web link is a genuine
 * suppressed autolink (`[some-url.com](#)`) produced by the editor, rather than
 * literal text that merely looks like a markdown link (`[PDF](pendiente)`).
 *
 * Suppression only applies when the label itself is a normalizable URL, which
 * mirrors `serializeEditorContent`. Any other `[text](url)` whose URL cannot be
 * normalized is treated as authored plain text and preserved verbatim.
 */
export function isSuppressedAutolinkMarkdown(
  linkText: string,
  linkUrl: string
): boolean {
  return (
    linkUrl === LINK_MARKDOWN_FORMAT.suppressedUrl &&
    normalizeMarkdownUrl(linkText) !== null
  );
}

/**
 * Parses persisted content (markdown links plus bare URLs) into rendered
 * segments for read-only display.
 */
export function parseRichTextSegments(content: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(LINK_PATTERN.markdown)) {
    const matchedMarkdown = match[0];
    const linkText = unescapeMarkdownLinkText(
      match[LINK_MARKDOWN_MATCH_GROUP.text] ?? ""
    );
    const linkUrl = match[LINK_MARKDOWN_MATCH_GROUP.url] ?? "";
    const matchedIndex = match.index ?? 0;
    const safeUrl = normalizeMarkdownUrl(linkUrl);

    if (matchedIndex > currentIndex) {
      segments.push(
        ...parseBareUrlSegments(content.slice(currentIndex, matchedIndex))
      );
    }

    segments.push(
      safeUrl
        ? createLinkSegment(linkText, safeUrl)
        : isSuppressedAutolinkMarkdown(linkText, linkUrl)
          ? createTextSegment(linkText)
          : createTextSegment(matchedMarkdown)
    );
    currentIndex = matchedIndex + matchedMarkdown.length;
  }

  if (currentIndex < content.length) {
    segments.push(...parseBareUrlSegments(content.slice(currentIndex)));
  }

  return segments;
}

/**
 * Converts persisted markdown into the editor's plain-text content plus the
 * tracked links (explicit and suppressed) needed to re-render it for editing.
 */
export function deserializeMarkdownForEditor(content: string): {
  content: string;
  links: RichLink[];
} {
  const links: RichLink[] = [];
  let displayContent = "";
  let currentIndex = 0;

  for (const match of content.matchAll(LINK_PATTERN.markdown)) {
    const matchedMarkdown = match[0];
    const linkText = unescapeMarkdownLinkText(
      match[LINK_MARKDOWN_MATCH_GROUP.text] ?? ""
    );
    const linkUrl = match[LINK_MARKDOWN_MATCH_GROUP.url] ?? "";
    const matchedIndex = match.index ?? 0;
    const safeUrl = normalizeMarkdownUrl(linkUrl);

    displayContent += content.slice(currentIndex, matchedIndex);

    if (safeUrl) {
      const linkStart = displayContent.length;
      displayContent += linkText;
      links.push({
        end: displayContent.length,
        id: crypto.randomUUID(),
        isSynced: isLinkSynchronized(linkText, safeUrl),
        kind: RICH_LINK_KIND.explicit,
        start: linkStart,
        url: safeUrl,
      });
    } else if (isSuppressedAutolinkMarkdown(linkText, linkUrl)) {
      const linkStart = displayContent.length;
      displayContent += linkText;
      links.push({
        end: displayContent.length,
        id: crypto.randomUUID(),
        kind: RICH_LINK_KIND.suppressed,
        start: linkStart,
      });
    } else {
      displayContent += matchedMarkdown;
    }

    currentIndex = matchedIndex + matchedMarkdown.length;
  }

  displayContent += content.slice(currentIndex);

  return {
    content: displayContent,
    links,
  };
}

/**
 * Serializes the editor's plain-text content plus tracked links back into
 * persisted markdown, emitting `[text](url)` for explicit links and
 * `[text](#)` for suppressed auto-detected URLs.
 */
export function serializeEditorContent(
  content: string,
  links: RichLink[]
): string {
  const persistedLinks = links
    .filter((link) => link.end > link.start)
    .sort((firstLink, secondLink) => firstLink.start - secondLink.start);
  let serializedContent = "";
  let currentIndex = 0;

  persistedLinks.forEach((link) => {
    if (link.start < currentIndex) {
      return;
    }

    serializedContent += content.slice(currentIndex, link.start);
    serializedContent += buildMarkdownLinkFromSelection(
      content.slice(link.start, link.end),
      link.kind === RICH_LINK_KIND.explicit
        ? link.url
        : LINK_MARKDOWN_FORMAT.suppressedUrl
    );
    currentIndex = link.end;
  });

  return serializedContent + content.slice(currentIndex);
}

/**
 * Computes the minimal changed range between two strings: the common prefix
 * end (`start`), the changed-region ends in each string, and the length delta.
 */
export function getTextDiff(input: { nextText: string; previousText: string }): {
  delta: number;
  endInNextText: number;
  endInPreviousText: number;
  start: number;
} {
  const minLength = Math.min(input.previousText.length, input.nextText.length);
  let start = 0;

  while (
    start < minLength &&
    input.previousText[start] === input.nextText[start]
  ) {
    start += 1;
  }

  if (
    start === minLength &&
    input.previousText.length === input.nextText.length
  ) {
    return {
      delta: 0,
      endInNextText: start,
      endInPreviousText: start,
      start: TEXT_DIFF_FALLBACK_INDEX.notFound,
    };
  }

  let previousEnd = input.previousText.length;
  let nextEnd = input.nextText.length;

  while (
    previousEnd > start &&
    nextEnd > start &&
    input.previousText[previousEnd - 1] === input.nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    delta: nextEnd - previousEnd,
    endInNextText: nextEnd,
    endInPreviousText: previousEnd,
    start,
  };
}

/**
 * Adjusts tracked link ranges after the editor's plain text changed, shifting,
 * shrinking, or dropping links and keeping synchronized links in step with
 * their visible text.
 *
 * A suppressed autolink is dropped once its visible text is no longer a
 * normalizable URL, mirroring `isSuppressedAutolinkMarkdown`: with nothing left
 * to suppress, the edited text serializes as plain text instead of `[text](#)`,
 * which would otherwise be rendered back as literal markdown.
 */
export function getLinksAfterTextChange(input: {
  links: RichLink[];
  nextText: string;
  previousText: string;
}): RichLink[] {
  const diff = getTextDiff({
    nextText: input.nextText,
    previousText: input.previousText,
  });

  if (diff.start === TEXT_DIFF_FALLBACK_INDEX.notFound) {
    return input.links;
  }

  const insertedText = input.nextText.slice(diff.start, diff.endInNextText);
  const deletedText = input.previousText.slice(
    diff.start,
    diff.endInPreviousText
  );

  return input.links
    .map((link) => {
      if (diff.endInPreviousText <= link.start) {
        return {
          ...link,
          end: link.end + diff.delta,
          start: link.start + diff.delta,
        };
      }

      if (diff.start > link.end) {
        return link;
      }

      if (diff.start === link.end && isWhitespaceOnly(insertedText)) {
        return link;
      }

      // A change that begins exactly at the link's exclusive end boundary and
      // removes text only deletes characters past the link, so the link's own
      // text is untouched and must stay intact. This holds regardless of
      // whether the removed text was whitespace; gating it on whitespace would
      // wrongly shrink the link when a non-whitespace character right after it
      // (for example deleting "X" from "abcX" where only "abc" is linked) is
      // removed. Pure insertions still fall through so non-whitespace typed
      // against the boundary can extend the link.
      if (diff.start === link.end && deletedText.length > 0) {
        return link;
      }

      // When the change starts before the link's start, it deleted part of the
      // link's prefix, so the surviving link text now begins where the changed
      // region ends in the new text. Clamping start there (instead of leaving
      // the stale offset) keeps the link anchored to the remaining text and
      // excludes any replacement text from the link.
      const nextStart =
        diff.start < link.start ? diff.endInNextText : link.start;

      // A deletion can start inside the link and run past its end. Only the
      // removed characters that fell within the link should shrink it; the ones
      // deleted beyond `link.end` were never part of the link, so adding them
      // back to `diff.delta` keeps them from being subtracted from `link.end`.
      const deletedLengthPastLinkEnd = Math.max(
        0,
        diff.endInPreviousText - link.end
      );

      return {
        ...link,
        end: Math.max(
          nextStart,
          link.end + diff.delta + deletedLengthPastLinkEnd
        ),
        start: nextStart,
      };
    })
    .filter((link) => link.end > link.start)
    .filter(
      (link) =>
        link.kind !== RICH_LINK_KIND.suppressed ||
        normalizeMarkdownUrl(input.nextText.slice(link.start, link.end)) !==
          null
    )
    .map((link) => {
      if (link.kind !== RICH_LINK_KIND.explicit) {
        return link;
      }

      const linkText = input.nextText.slice(link.start, link.end);
      const isSynced =
        link.isSynced || isLinkSynchronized(linkText, link.url);
      const syncedUrl = isSynced
        ? getSynchronizedLinkUrl(linkText, link.url)
        : null;

      return {
        ...link,
        isSynced: Boolean(syncedUrl),
        url: syncedUrl ?? link.url,
      };
    });
}
