/**
 * Timing policy of the Mercado Pago return screen: an exponential backoff
 * between status checks with a ceiling, and a cap on automatic checks after
 * which the member refreshes manually. Pure values and helpers, safe for
 * presentational components and client hooks.
 *
 * @module subscription-return-polling
 */

/**
 * Backoff policy: the first check runs 3 s after the return screen renders,
 * each following wait doubles up to 30 s, and automatic checks stop after 8
 * attempts (about 2 min 45 s in total), so an unconfirmed return never polls
 * the server (and, through it, Mercado Pago) forever.
 */
export const SUBSCRIPTION_RETURN_POLLING = {
  backoffMultiplier: 2,
  initialDelayMs: 3_000,
  maxAttempts: 8,
  maxDelayMs: 30_000,
} as const;

/**
 * UI phase of the return screen: `checking` while automatic checks run and
 * `exhausted` once the cap is reached and a manual refresh is offered.
 */
export const SUBSCRIPTION_RETURN_POLLING_PHASE = {
  checking: "checking",
  exhausted: "exhausted",
} as const;

export type SubscriptionReturnPollingPhase = "checking" | "exhausted";

/**
 * Wait before the next automatic check.
 *
 * @param completedAttempts - Checks already performed in this polling run.
 * @returns Delay in milliseconds: 3 s, 6 s, 12 s, 24 s, then 30 s.
 */
export function getSubscriptionReturnPollDelayMs(
  completedAttempts: number
): number {
  return Math.min(
    SUBSCRIPTION_RETURN_POLLING.initialDelayMs *
      SUBSCRIPTION_RETURN_POLLING.backoffMultiplier ** completedAttempts,
    SUBSCRIPTION_RETURN_POLLING.maxDelayMs
  );
}
