/** Keeps queue eligibility separate from possible-send evidence and provider delivery. @module message-delivery-policy */
import type { MessageDelivery } from "@/src/modules/messaging/domain/entities/message-delivery";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";

/**
 * Allows reclamation only for a due, live queued obligation with no external marker.
 * @param delivery - Current own obligation and lease state.
 * @param now - Authoritative time sampled after the caller's waits.
 * @param recordedAttempt - Whether an attempt marker already exists, including unknown/accepted outcomes.
 * @returns Whether a new claim may be considered; persistence still owns SKIP LOCKED and CAS.
 */
export function isMessageDeliveryClaimEligible(delivery: Pick<MessageDelivery, "state" | "dueAt" | "deadlineAt" | "leaseUntil">, now: Date, recordedAttempt: boolean): boolean {
  return Number.isFinite(now.getTime()) && !recordedAttempt && delivery.state === MESSAGE_DELIVERY_STATE.queued
    && delivery.dueAt <= now && delivery.deadlineAt > now && (delivery.leaseUntil === null || delivery.leaseUntil <= now);
}

/**
 * Treats every persisted marker as possible external dispatch, without inferring whether RPC began.
 * @param attempt - Original marker, or null when no marker has been recorded.
 * @returns Whether replay must avoid another POST and preserve the external reservation.
 */
export function hasPossibleMessageDispatch(attempt: MessageDeliveryAttempt | null): boolean { return attempt !== null; }
