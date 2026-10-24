/** Preserves private candidate-maintenance rejection or an indeterminate commit without exposing database material. @module messaging-candidate-expiration-error */
import { MESSAGING_CANDIDATE_MAINTENANCE } from "../../constants/messaging-candidate-expiration";

/** Names only the stable failures of the private maintenance boundary. */
export type MessagingCandidateExpirationErrorCode = "invalid_input" | "permission_denied" | "connection_incomplete" | "operation_unresolved";

/** Keeps counts unavailable after failure rather than inventing a successful empty batch. */
export class MessagingCandidateExpirationError extends Error {
  /** @param code - Closed own maintenance outcome. @param options - Original private cause for persistence diagnostics. */
  constructor(public readonly code: MessagingCandidateExpirationErrorCode, options?: ErrorOptions) {
    super(`MessagingCandidateMaintenance.${MESSAGING_CANDIDATE_MAINTENANCE.operation} failed: ${code}`, options);
    this.name = "MessagingCandidateExpirationError";
  }
}
