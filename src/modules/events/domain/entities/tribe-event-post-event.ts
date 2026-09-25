import type { TRIBE_EVENT_OCCURRENCE_REACTION } from "@/src/modules/events/constants/tribe-event-post-event";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Post-event resources of one occurrence, keyed by its stable identity
 * (`eventId@originalStartsAt`).
 */

export type TribeEventOccurrenceReaction =
  (typeof TRIBE_EVENT_OCCURRENCE_REACTION)[keyof typeof TRIBE_EVENT_OCCURRENCE_REACTION];

/**
 * Stable identity of one occurrence inside a tribe.
 */
export type TribeEventOccurrenceReference = {
  eventId: string;
  originalStartsAt: string;
};

/**
 * Recording of the occurrence: an external video already parsed from a
 * supported provider URL (same model as course lessons), plus the original
 * link so members can open it outside the embed.
 */
export type TribeEventOccurrenceRecording = {
  externalVideoId: string;
  provider: VideoProvider;
  sourceUrl: string;
};

export type TribeEventOccurrenceMaterial = {
  title: string;
  url: string;
};

/**
 * Aggregated "¿Cómo estuvo?" reactions: one count per reaction and the
 * viewer's own reaction (null when they did not react).
 */
export type TribeEventOccurrenceReactionSummary = {
  counts: Record<TribeEventOccurrenceReaction, number>;
  viewerReaction: TribeEventOccurrenceReaction | null;
};

/**
 * One message of the occurrence conversation. `canDelete` is resolved for the
 * viewer (author or event manager); the email is never exposed.
 */
export type TribeEventOccurrenceComment = {
  authorImageUrl: string | null;
  authorName: string;
  canDelete: boolean;
  content: string;
  createdAt: string;
  id: string;
};
