/** Preserves aggregate retention rejection and unknown commit outcomes without private material. @module messaging-retention-error */
import { MESSAGING_SECRET_RETENTION } from "../../constants/messaging-retention";

/** Keeps the aggregate maintenance boundary independent from provider and leaf diagnostics. */
export type MessagingRetentionErrorCode = "invalid_input" | "permission_denied" | "resource_unavailable" | "operation_unresolved";

/** Describes the whole atomic batch while retaining an optional private original cause. */
export class MessagingRetentionError extends Error {
  /** @param code - Closed private rejection or uncertain completion. @param options - Server-only original cause. */
  constructor(public readonly code: MessagingRetentionErrorCode, options?: ErrorOptions) {
    super(`MessagingRetention.${MESSAGING_SECRET_RETENTION.operation} failed: ${code}`, options);
    this.name = new.target.name;
  }
}
