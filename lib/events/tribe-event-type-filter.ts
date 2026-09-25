import type {
  TribeEventOccurrenceResult,
  TribeEventType,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_TYPES } from "@/src/modules/events/constants/tribe-events";

/**
 * Pure helpers of the type filter chips. An empty selection means "every
 * type", so the calendar never ends up hiding everything by accident.
 */

/**
 * Adds or removes a type, keeping the catalog order so the URL is stable.
 *
 * @param selectedTypes - Current selection.
 * @param eventType - Type toggled by the viewer.
 * @returns The new selection.
 */
export function toggleEventTypeSelection(
  selectedTypes: readonly TribeEventType[],
  eventType: TribeEventType
): TribeEventType[] {
  const nextTypes = new Set(selectedTypes);

  if (nextTypes.has(eventType)) {
    nextTypes.delete(eventType);
  } else {
    nextTypes.add(eventType);
  }

  return TRIBE_EVENT_TYPES.filter((catalogType) => nextTypes.has(catalogType));
}

/**
 * Occurrences whose type is selected (all of them when none is selected).
 *
 * @param occurrences - Visible occurrences.
 * @param selectedTypes - Selected types.
 * @returns The occurrences to render.
 */
export function filterOccurrencesByEventType(
  occurrences: TribeEventOccurrenceResult[],
  selectedTypes: readonly TribeEventType[]
): TribeEventOccurrenceResult[] {
  if (selectedTypes.length === 0) {
    return occurrences;
  }

  return occurrences.filter((occurrence) => selectedTypes.includes(occurrence.eventType));
}
