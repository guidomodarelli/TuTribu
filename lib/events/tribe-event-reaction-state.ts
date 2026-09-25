import type { TribeEventPostEventView } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";

/**
 * Pure optimistic math of the "¿Cómo estuvo?" reactions: one reaction per
 * member, where tapping the current reaction removes it.
 */

export type TribeEventReactionSummary = TribeEventPostEventView["reactions"];

/**
 * Reaction the viewer wants after tapping `tapped`.
 *
 * @param current - Reaction currently shown for the viewer.
 * @param tapped - Reaction button the viewer tapped.
 * @returns The tapped reaction, or null when it was already selected.
 */
export function getNextTribeEventReaction(
  current: TribeEventOccurrenceReaction | null,
  tapped: TribeEventOccurrenceReaction
): TribeEventOccurrenceReaction | null {
  return current === tapped ? null : tapped;
}

/**
 * Applies the viewer's intended reaction on top of the last persisted
 * summary (the baseline), moving the viewer's vote between counts.
 *
 * @param baseline - Summary confirmed by the server.
 * @param intendedReaction - Reaction the viewer wants now (null: none).
 * @returns The optimistic summary to render.
 */
export function applyOptimisticTribeEventReaction(
  baseline: TribeEventReactionSummary,
  intendedReaction: TribeEventOccurrenceReaction | null
): TribeEventReactionSummary {
  if (baseline.viewerReaction === intendedReaction) {
    return baseline;
  }

  const counts = { ...baseline.counts };

  if (baseline.viewerReaction) {
    counts[baseline.viewerReaction] = Math.max(0, counts[baseline.viewerReaction] - 1);
  }

  if (intendedReaction) {
    counts[intendedReaction] += 1;
  }

  return { counts, viewerReaction: intendedReaction };
}
