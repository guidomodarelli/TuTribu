/** Evaluates explicit notification recovery without redirecting an OTP or authorizing another uncertain POST. @module notification-delivery-recovery */
import type { MessageDelivery } from "../entities/message-delivery";
import type { MessageDeliveryAttempt } from "../entities/message-delivery-attempt";
import { MESSAGE_DELIVERY_STATE, MESSAGE_ATTEMPT_STATE } from "../../constants/message-delivery";
import { NOTIFICATION_DELIVERY_RECOVERY_REASON, NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../../constants/notification-delivery-recovery";

/** Contains current native facts; browser input cannot supply any authorization flag. */
export type NotificationDeliveryRecoveryFacts = {
  original: Pick<MessageDelivery, "tribeId" | "connectionId" | "environment" | "securityEpoch" | "purpose" | "state" | "deadlineAt">;
  originalAttempt: Pick<MessageDeliveryAttempt, "state"> | null;
  target: { tribeId: string; connectionId: string; environment: string; securityEpoch: string; selected: boolean; active: boolean; emailPrepared: boolean };
  obligationCurrent: boolean;
  now: Date;
};

/** Closed domain reasons are private diagnostics, mapped to safe localized failure at the application boundary. */
export type NotificationDeliveryRecoveryDecision = { allowed: true } | { allowed: false; reason: "notification_recovery_purpose_mismatch" | "notification_recovery_deadline_expired" | "notification_recovery_tenant_mismatch" | "notification_recovery_connection_unchanged" | "notification_recovery_connection_not_ready" | "notification_recovery_security_scope_changed" | "notification_recovery_already_delivered" | "notification_recovery_original_dispatch_unresolved" | "notification_recovery_obligation_unavailable" };

/**
 * Allows a new explicit notification only for a current obligation and a different ready connection in the same tribe.
 * @param facts - Locked current original, target, obligation and authoritative time.
 * @returns A closed decision; unresolved original attempts stay blocked while OG-04 remains unproved.
 */
export function evaluateNotificationDeliveryRecovery(facts: NotificationDeliveryRecoveryFacts): NotificationDeliveryRecoveryDecision {
  const { original, originalAttempt, target } = facts;
  if (original.purpose !== NOTIFICATION_DELIVERY_RECOVERY_PURPOSE) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.notNotification };
  if (!Number.isFinite(facts.now.getTime()) || !Number.isFinite(original.deadlineAt.getTime()) || original.deadlineAt <= facts.now) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.expired };
  if (original.tribeId !== target.tribeId) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.wrongTribe };
  if (original.connectionId === target.connectionId) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.sameConnection };
  if (original.environment !== target.environment || original.securityEpoch !== target.securityEpoch) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.securityScopeChanged };
  if (!target.selected || !target.active || !target.emailPrepared) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.connectionNotReady };
  if (!facts.obligationCurrent) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.noCurrentObligation };
  if (original.state === MESSAGE_DELIVERY_STATE.delivered || originalAttempt?.state === MESSAGE_ATTEMPT_STATE.delivered) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.alreadyDelivered };
  if (original.state === MESSAGE_DELIVERY_STATE.accepted || original.state === MESSAGE_DELIVERY_STATE.unknown || originalAttempt && originalAttempt.state !== MESSAGE_ATTEMPT_STATE.rejected) return { allowed: false, reason: NOTIFICATION_DELIVERY_RECOVERY_REASON.possiblyDispatched };
  return { allowed: true };
}
