/** Applies monotonic transport observations without granting contact, send or quota authority. @module message-status-observation */
import type { MessageDeliveryAttempt } from "../entities/message-delivery-attempt";
import type { MessageStatusObservation } from "../repositories/message-status-lookup";
import { MESSAGE_ATTEMPT_STATE } from "../../constants/message-delivery";

/**
 * Keeps terminal evidence and never replaces an accepted transport with uncertainty.
 * @param current - Actual locked attempt state.
 * @param observed - Minimal owned provider-read classification.
 * @returns The next original attempt state; equality means no new transport fact.
 */
export function reconcileMessageAttemptState(current: MessageDeliveryAttempt["state"], observed: MessageStatusObservation["outcome"]): MessageDeliveryAttempt["state"] {
  if (current === MESSAGE_ATTEMPT_STATE.delivered || current === MESSAGE_ATTEMPT_STATE.rejected) return current;
  if (current === MESSAGE_ATTEMPT_STATE.accepted && observed === MESSAGE_ATTEMPT_STATE.unknown) return current;
  return observed;
}
