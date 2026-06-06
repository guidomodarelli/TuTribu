import type { MouseEvent } from "react";

import {
  RICH_TEXT_SEGMENT_TYPE,
} from "@/lib/rich-text/link-markdown-constants";
import { parseRichTextSegments } from "@/lib/rich-text/link-markdown";
import styles from "./styles.module.scss";

const LINK_TARGET = "_blank";
const LINK_REL = "noreferrer";

type RichTextContentProps = {
  content: string;
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * Renders persisted rich text (markdown links plus auto-detected URLs) as plain
 * text interleaved with safe `<a>` links.
 *
 * It intentionally renders an inline fragment instead of a wrapper element so it
 * can compose inside any container without altering layout-sensitive behavior
 * such as `-webkit-line-clamp` on an ancestor. The link is the component's BEM
 * block element (`RichTextContent__link`).
 */
export function RichTextContent({ content, onLinkClick }: RichTextContentProps) {
  const segments = parseRichTextSegments(content);

  return (
    <>
      {segments.map((segment, segmentIndex) =>
        segment.type === RICH_TEXT_SEGMENT_TYPE.link ? (
          <a
            className={styles.RichTextContent__link}
            href={segment.url}
            key={segment.type + String(segmentIndex)}
            onClick={onLinkClick}
            rel={LINK_REL}
            target={LINK_TARGET}
          >
            {segment.text}
          </a>
        ) : (
          segment.text
        )
      )}
    </>
  );
}
