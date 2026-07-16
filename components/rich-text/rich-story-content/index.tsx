import {
  STORY_BLOCK_TYPE,
  STORY_INLINE_TYPE,
  parseStoryBlocks,
} from "@/lib/rich-text/story-markdown";
import type { StoryInlineSegment } from "@/lib/rich-text/story-markdown";
import styles from "./styles.module.scss";

const LINK_TARGET = "_blank";
const LINK_REL = "noreferrer";

type RichStoryContentProps = {
  content: string;
};

function renderInlineSegments(segments: StoryInlineSegment[]) {
  return segments.map((segment, segmentIndex) => {
    const segmentKey = segment.type + String(segmentIndex);

    if (segment.type === STORY_INLINE_TYPE.link) {
      return (
        <a
          className={styles.RichStoryContent__link}
          href={segment.url}
          key={segmentKey}
          rel={LINK_REL}
          target={LINK_TARGET}
        >
          {segment.text}
        </a>
      );
    }

    if (segment.type === STORY_INLINE_TYPE.bold) {
      return <strong key={segmentKey}>{segment.text}</strong>;
    }

    return segment.text;
  });
}

/**
 * Renders long-form story content with a safe markdown subset: paragraphs,
 * unordered lists, inline bold, and the shared link syntax. Raw HTML in the
 * content is never interpreted as markup.
 */
export function RichStoryContent({ content }: RichStoryContentProps) {
  const blocks = parseStoryBlocks(content);

  return (
    <div className={styles.RichStoryContent}>
      {blocks.map((block, blockIndex) =>
        block.type === STORY_BLOCK_TYPE.list ? (
          <ul
            className={styles.RichStoryContent__list}
            key={block.type + String(blockIndex)}
          >
            {block.items.map((itemSegments, itemIndex) => (
              <li
                className={styles.RichStoryContent__listItem}
                key={block.type + String(blockIndex) + String(itemIndex)}
              >
                {renderInlineSegments(itemSegments)}
              </li>
            ))}
          </ul>
        ) : (
          <p
            className={styles.RichStoryContent__paragraph}
            key={block.type + String(blockIndex)}
          >
            {renderInlineSegments(block.segments)}
          </p>
        )
      )}
    </div>
  );
}
