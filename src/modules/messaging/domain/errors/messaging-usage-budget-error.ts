/** Carries private usage/continuity failures using the owner's existing safe codes. @module messaging-usage-budget-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Preserves the existing contact-resolution diagnostic when no narrower operation is supplied. */
const DEFAULT_USAGE_BUDGET_OPERATION = "resolve";

export class MessagingUsageBudgetError extends Error {
  /**
   * @param code - Closed owner outcome; callers map it to safe Spanish feedback.
   * @param options - Actual private cause and the functional operation that failed, when known.
   */
  constructor(public readonly code: (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE], options?: ErrorOptions & { operation?: string }) {
    super(`MessagingUsageBudget.${options?.operation ?? DEFAULT_USAGE_BUDGET_OPERATION} failed: ${code}`, options);
    this.name = "MessagingUsageBudgetError";
  }
}
