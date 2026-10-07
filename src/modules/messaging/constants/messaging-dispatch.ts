/** Names bounded dispatch defaults independently of provider retries or idempotency guarantees. @module messaging-dispatch-constants */
/** Uses milliseconds for RPC/run limits and seconds for persisted leases. */
export const MESSAGING_DISPATCH_DEFAULT = { requestTimeoutMs: 15_000, runBudgetMs: 45_000, leaseSeconds: 90, concurrency: 2, batchLimit: 2 } as const;
/** Matches the private SQL claim limits; runtime settings may be more restrictive. */
export const MESSAGING_DISPATCH_BOUND = { maximumBatch: 100, maximumLeaseSeconds: 300, maximumConcurrency: 2, maximumRunBudgetMs: 45_000, maximumRequestTimeoutMs: 15_000 } as const;
/** Distinguishes diagnostics without exposing a request, secret or payload. */
export const MESSAGING_DISPATCH_STAGE = { claim: "claim", authorize: "authorize", send: "send", complete: "complete", late: "late", defer: "defer" } as const;
