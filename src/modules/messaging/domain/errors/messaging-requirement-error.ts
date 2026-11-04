/** Names the unmet business requirement behind an expected messaging rejection, so the logged cause chain says what the leader still has to resolve. @module messaging-requirement-error */
import type { MessagingConnectionActivationReason } from "../entities/tenant-messaging-connection";
import type { NotificationDeliveryRecoveryDecision } from "../policies/notification-delivery-recovery";

/** Dependency that still uses the selected connection. */
export type MessagingRetirementRequirement = "admission_dependency" | "notification_dependency";
/** Why a chosen Zavu sender or template cannot serve the configured channel. */
export type MessagingChannelResourceRequirement = "sender_mismatch" | "sender_channel_missing" | "sender_whatsapp_templates_unavailable" | "template_mismatch" | "template_not_approved" | "template_language_mismatch";
/** Closed reasons a messaging requirement error can carry. */
export type MessagingRequirementCode = MessagingRetirementRequirement | MessagingChannelResourceRequirement | MessagingConnectionActivationReason | Extract<NotificationDeliveryRecoveryDecision, { allowed: false }>["reason"];

/** Private typed cause of a 4xx rejection: never serialized, only summarized by class name and `code` in diagnostics. */
export class MessagingRequirementError extends Error {
  /** @param code - Closed unmet requirement. */
  constructor(public readonly code: MessagingRequirementCode) {
    super(`Messaging requirement unmet: ${code}`);
    this.name = "MessagingRequirementError";
  }
}
