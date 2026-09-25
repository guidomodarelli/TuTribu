import type { TribeEventOccurrenceTarget } from "@/lib/events/tribe-event-post-event-api-client";

/**
 * Browser-wide registry of the post-event mutations (resources saves and
 * reaction requests) still in flight for each occurrence.
 *
 * The occurrence detail remounts its activity per opening, so a mutation can
 * outlive the instance that started it. A new instance waits for them before
 * its first load, so reopening the detail never reads the state from before a
 * mutation that is about to commit.
 */

const OCCURRENCE_TARGET_KEY_SEPARATOR = "|";

const pendingMutationsByOccurrence = new Map<string, Set<Promise<unknown>>>();

function buildOccurrenceTargetKey({ eventId, originalStartsAt, tribeSlug }: TribeEventOccurrenceTarget) {
  return [tribeSlug, eventId, originalStartsAt].join(OCCURRENCE_TARGET_KEY_SEPARATOR);
}

/**
 * Registers a mutation of one occurrence until it settles (fulfilled or
 * rejected). The caller keeps handling the promise result.
 *
 * @param target - Occurrence the mutation writes to.
 * @param mutation - In-flight request of the mutation.
 */
export function trackTribeEventOccurrenceMutation(
  target: TribeEventOccurrenceTarget,
  mutation: Promise<unknown>
): void {
  const occurrenceKey = buildOccurrenceTargetKey(target);
  const pendingMutations = pendingMutationsByOccurrence.get(occurrenceKey) ?? new Set();

  pendingMutations.add(mutation);
  pendingMutationsByOccurrence.set(occurrenceKey, pendingMutations);

  const forgetMutation = () => {
    pendingMutations.delete(mutation);

    if (pendingMutations.size === 0 && pendingMutationsByOccurrence.get(occurrenceKey) === pendingMutations) {
      pendingMutationsByOccurrence.delete(occurrenceKey);
    }
  };

  // Settlement only unregisters it; the failure is handled by the caller.
  mutation.then(forgetMutation, forgetMutation);
}

/**
 * Resolves once every mutation of the occurrence registered so far settled.
 * Never rejects: a failed mutation still lets the load read the server state.
 *
 * @param target - Occurrence about to be loaded.
 */
export async function waitForTribeEventOccurrenceMutations(
  target: TribeEventOccurrenceTarget
): Promise<void> {
  const pendingMutations = pendingMutationsByOccurrence.get(buildOccurrenceTargetKey(target));

  if (pendingMutations) {
    await Promise.allSettled([...pendingMutations]);
  }
}
