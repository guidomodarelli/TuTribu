/** Names bounded dispatch defaults independently of provider retries or idempotency guarantees. @module messaging-dispatch-constants */
/**
 * Bounds one provider send request in milliseconds.
 * The SC-015 pilot measured 15.2–19.0 s between send authorization and the provider's answer (16.9 s in the email diagnostic),
 * so the former 15 s bound cut accepted requests into `unknown`. 30 s keeps more than 1.5× the slowest observed answer.
 */
const MESSAGING_PROVIDER_SEND_TIMEOUT_MS = 30_000;
/** Read-only provider inspections and status lookups keep their previous bound; they never create a message. */
export const MESSAGING_PROVIDER_READ_TIMEOUT_MS = 15_000;
/** Uses milliseconds for RPC/run limits and seconds for persisted leases. */
export const MESSAGING_DISPATCH_DEFAULT = { requestTimeoutMs: MESSAGING_PROVIDER_SEND_TIMEOUT_MS, runBudgetMs: 45_000, leaseSeconds: 90, concurrency: 2, batchLimit: 2 } as const;
/** Matches the private SQL claim limits; runtime settings may be more restrictive. */
export const MESSAGING_DISPATCH_BOUND = { maximumBatch: 100, maximumLeaseSeconds: 300, maximumConcurrency: 2, maximumRunBudgetMs: 45_000, maximumRequestTimeoutMs: MESSAGING_PROVIDER_SEND_TIMEOUT_MS } as const;
/** Distinguishes diagnostics without exposing a request, secret or payload. */
export const MESSAGING_DISPATCH_STAGE = { claim: "claim", authorize: "authorize", prepare: "prepare", send: "send", complete: "complete", late: "late", defer: "defer", observation: "observation" } as const;
