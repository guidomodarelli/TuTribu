import type { TribeEventOccurrenceTarget } from "@/lib/events/tribe-event-post-event-api-client";

/**
 * Browser-wide registries of the occurrence mutations still in flight.
 *
 * The occurrence detail remounts its activity per opening, so a mutation can
 * outlive the instance that started it. A new instance waits for them before
 * its first load, so reopening the detail never reads the state from before a
 * mutation that is about to commit. Each block owns its own registry (post-event
 * resources and reactions, conversation comments), so a load only waits for
 * the mutations that change what it reads.
 */

const OCCURRENCE_TARGET_KEY_SEPARATOR = "|";

function buildOccurrenceTargetKey({ eventId, originalStartsAt, tribeSlug }: TribeEventOccurrenceTarget) {
  return [tribeSlug, eventId, originalStartsAt].join(OCCURRENCE_TARGET_KEY_SEPARATOR);
}

/**
 * Pending mutations of one block, keyed by occurrence.
 */
type OccurrenceMutationRegistry = {
  /**
   * Registers a mutation of one occurrence until it settles (fulfilled or
   * rejected). The caller keeps handling the promise result.
   */
  track: (target: TribeEventOccurrenceTarget, mutation: Promise<unknown>) => void;
  /**
   * Resolves once every mutation of the occurrence registered so far settled.
   * Never rejects: a failed mutation still lets the load read the server state.
   */
  waitFor: (target: TribeEventOccurrenceTarget) => Promise<void>;
};

function createOccurrenceMutationRegistry(): OccurrenceMutationRegistry {
  const pendingMutationsByOccurrence = new Map<string, Set<Promise<unknown>>>();

  return {
    track(target, mutation) {
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
    },
    async waitFor(target) {
      const pendingMutations = pendingMutationsByOccurrence.get(buildOccurrenceTargetKey(target));

      if (pendingMutations) {
        await Promise.allSettled([...pendingMutations]);
      }
    },
  };
}

const postEventMutationRegistry = createOccurrenceMutationRegistry();
const conversationMutationRegistry = createOccurrenceMutationRegistry();

/**
 * Registers a post-event mutation (resources save or reaction request) of one
 * occurrence until it settles. The caller keeps handling the promise result.
 *
 * @param target - Occurrence the mutation writes to.
 * @param mutation - In-flight request of the mutation.
 */
export function trackTribeEventOccurrenceMutation(
  target: TribeEventOccurrenceTarget,
  mutation: Promise<unknown>
): void {
  postEventMutationRegistry.track(target, mutation);
}

/**
 * Resolves once every post-event mutation of the occurrence registered so far
 * settled. Never rejects.
 *
 * @param target - Occurrence about to be loaded.
 */
export function waitForTribeEventOccurrenceMutations(
  target: TribeEventOccurrenceTarget
): Promise<void> {
  return postEventMutationRegistry.waitFor(target);
}

/**
 * Registers a conversation mutation (comment creation or deletion) of one
 * occurrence until it settles. The caller keeps handling the promise result.
 *
 * @param target - Occurrence whose conversation the mutation writes to.
 * @param mutation - In-flight request of the mutation.
 */
export function trackTribeEventConversationMutation(
  target: TribeEventOccurrenceTarget,
  mutation: Promise<unknown>
): void {
  conversationMutationRegistry.track(target, mutation);
}

/**
 * Resolves once every conversation mutation of the occurrence registered so
 * far settled. Never rejects.
 *
 * @param target - Occurrence whose conversation is about to be loaded.
 */
export function waitForTribeEventConversationMutations(
  target: TribeEventOccurrenceTarget
): Promise<void> {
  return conversationMutationRegistry.waitFor(target);
}
