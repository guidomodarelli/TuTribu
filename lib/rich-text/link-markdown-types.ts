/**
 * Shared types for the rich-text link layer.
 */

import type {
  RICH_LINK_KIND,
  RICH_PREVIEW_LINK_SOURCE,
  RICH_TEXT_SEGMENT_TYPE,
} from "@/lib/rich-text/link-markdown-constants";

/** A parsed piece of rendered content: either plain text or a link. */
export type RichTextSegment =
  | {
      text: string;
      type: typeof RICH_TEXT_SEGMENT_TYPE.text;
    }
  | {
      text: string;
      type: typeof RICH_TEXT_SEGMENT_TYPE.link;
      url: string;
    };

/**
 * A link tracked by the editor over its plain-text content. Explicit links carry
 * a target URL; suppressed links mark an auto-detected URL the author removed.
 */
export type RichLink =
  | {
      end: number;
      id: string;
      isSynced: boolean;
      kind: typeof RICH_LINK_KIND.explicit;
      start: number;
      url: string;
    }
  | {
      end: number;
      id: string;
      kind: typeof RICH_LINK_KIND.suppressed;
      start: number;
    };

/** A segment of the editor preview: plain text or an interactive link. */
export type RichPreviewSegment =
  | {
      text: string;
      type: typeof RICH_TEXT_SEGMENT_TYPE.text;
    }
  | {
      end: number;
      id?: string;
      key: string;
      source:
        | typeof RICH_PREVIEW_LINK_SOURCE.automatic
        | typeof RICH_PREVIEW_LINK_SOURCE.explicit;
      start: number;
      text: string;
      type: typeof RICH_TEXT_SEGMENT_TYPE.link;
      url: string;
    };

/** The link variant of a preview segment, used when editing a link. */
export type ActiveRichPreviewLink = Extract<
  RichPreviewSegment,
  { type: typeof RICH_TEXT_SEGMENT_TYPE.link }
>;

/** A character offset range within the editor's plain-text content. */
export type RichTextSelectionRange = {
  end: number;
  start: number;
};
