/** Assesses ordinary disconnection independently of urgent security suspension and provider availability. @module messaging-connection-retirement */
import { MESSAGING_CONNECTION_RETIREMENT_REASON } from "../../constants/messaging-connection-retirement";

/** Current owner-supplied dependency facts, never client claims or a provider response. */
export type MessagingConnectionRetirementFacts = {
  isSelected: boolean;
  verificationRequired: boolean;
  admissionsPaused: boolean;
  externalNotificationsEnabled: boolean;
};

/**
 * Checks whether retiring this resource leaves no enabled dependency falsely operational.
 * @param facts - Current selected status and locked admission/notification owner facts.
 * @returns Permission for ordinary retirement or the dependency that still needs resolution.
 * @remarks Suspension must use its separate security transition and must not depend on this assessment.
 */
export function assessMessagingConnectionRetirement(facts: MessagingConnectionRetirementFacts): { allowed: true } | { allowed: false; reason: typeof MESSAGING_CONNECTION_RETIREMENT_REASON[keyof typeof MESSAGING_CONNECTION_RETIREMENT_REASON] } {
  if (!facts.isSelected) return { allowed: true };
  if (facts.verificationRequired && !facts.admissionsPaused) return { allowed: false, reason: MESSAGING_CONNECTION_RETIREMENT_REASON.admissionDependency };
  if (facts.externalNotificationsEnabled) return { allowed: false, reason: MESSAGING_CONNECTION_RETIREMENT_REASON.notificationDependency };
  return { allowed: true };
}
