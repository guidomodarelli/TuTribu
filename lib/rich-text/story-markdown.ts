import { parseRichTextSegments } from "@/lib/rich-text/link-markdown";
import { RICH_TEXT_SEGMENT_TYPE } from "@/lib/rich-text/link-markdown-constants";

/**
 * Block-level markdown subset for long-form tribe story content.
 *
 * It builds on top of the shared link parser (`parseRichTextSegments`) without
 * touching it, adding paragraphs, unordered lists (`- item` / `* item`) and
 * inline bold (`**text**`). Everything else stays plain text, so the renderer
 * never interprets raw HTML.
 */

export const STORY_BLOCK_TYPE = {
  list: "list",
  paragraph: "paragraph",
} as const;

export const STORY_INLINE_TYPE = {
  bold: "bold",
  link: "link",
  text: "text",
} as const;

export type StoryInlineSegment =
  | { text: string; type: typeof STORY_INLINE_TYPE.bold }
  | { text: string; type: typeof STORY_INLINE_TYPE.text }
  | { text: string; type: typeof STORY_INLINE_TYPE.link; url: string };

export type StoryBlock =
  | { segments: StoryInlineSegment[]; type: typeof STORY_BLOCK_TYPE.paragraph }
  | { items: StoryInlineSegment[][]; type: typeof STORY_BLOCK_TYPE.list };

const LINE_BREAK_PATTERN = /\r?\n/;
const LIST_ITEM_PATTERN = /^\s*[-*]\s+(.*)$/;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const PARAGRAPH_LINE_SEPARATOR = "\n";

function parseInlineLinks(text: string): StoryInlineSegment[] {
  return parseRichTextSegments(text).map((segment) =>
    segment.type === RICH_TEXT_SEGMENT_TYPE.link
      ? { text: segment.text, type: STORY_INLINE_TYPE.link, url: segment.url }
      : { text: segment.text, type: STORY_INLINE_TYPE.text }
  );
}

function parseInlineSegments(text: string): StoryInlineSegment[] {
  const segments: StoryInlineSegment[] = [];
  let lastIndex = 0;

  for (const boldMatch of text.matchAll(BOLD_PATTERN)) {
    const matchIndex = boldMatch.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push(...parseInlineLinks(text.slice(lastIndex, matchIndex)));
    }

    segments.push({ text: boldMatch[1], type: STORY_INLINE_TYPE.bold });
    lastIndex = matchIndex + boldMatch[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(...parseInlineLinks(text.slice(lastIndex)));
  }

  return segments;
}

const EXCERPT_SEGMENT_SEPARATOR = " ";
const EXCERPT_ELLIPSIS = "…";

/**
 * Flattens the parsed story into plain text (formatting stripped) and trims it
 * to `maxLength`, for SEO descriptions and previews.
 */
export function buildStoryPlainTextExcerpt(
  content: string,
  maxLength: number
): string {
  const plainText = parseStoryBlocks(content)
    .flatMap((block) =>
      block.type === STORY_BLOCK_TYPE.paragraph
        ? block.segments.map((segment) => segment.text)
        : block.items.flatMap((itemSegments) =>
            itemSegments.map((segment) => segment.text)
          )
    )
    .join(EXCERPT_SEGMENT_SEPARATOR)
    .replace(/\s+/g, EXCERPT_SEGMENT_SEPARATOR)
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return plainText.slice(0, maxLength - EXCERPT_ELLIPSIS.length).trimEnd() +
    EXCERPT_ELLIPSIS;
}

export function parseStoryBlocks(content: string): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: StoryInlineSegment[][] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({
        segments: parseInlineSegments(
          paragraphLines.join(PARAGRAPH_LINE_SEPARATOR)
        ),
        type: STORY_BLOCK_TYPE.paragraph,
      });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ items: listItems, type: STORY_BLOCK_TYPE.list });
      listItems = [];
    }
  };

  for (const line of content.split(LINE_BREAK_PATTERN)) {
    const listItemMatch = LIST_ITEM_PATTERN.exec(line);

    if (listItemMatch) {
      flushParagraph();
      listItems.push(parseInlineSegments(listItemMatch[1]));
      continue;
    }

    flushList();

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}
