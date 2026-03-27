# Concurrency, Observability, and Performance

Design client and server flows assuming concurrent execution, partial failures, retries, and out-of-order completion from the start.

## Goal

Reduce hard-to-reproduce bugs and improve operational debugging by making concurrency, observability, and performance explicit engineering concerns.

## Observability Rules

### Structured logs

Use structured logs by default so events can be filtered, correlated, and aggregated across environments.

Prefer including:

- event or message name
- `requestId` and `traceId` when available
- feature or use-case context
- duration and outcome
- safe resource identifiers

Do not log secrets, tokens, raw provider payloads, session data, or internal stack traces in user-facing surfaces.

```ts
logger.info({
  message: "Community created",
  communityId,
  requestId,
  durationMs,
});
```

### Request correlation

Treat request correlation as mandatory for server-side flows that cross boundaries such as route handlers, use cases, repositories, or external providers.

Every important request flow should be traceable through a stable correlation identifier such as `requestId` or `traceId`.

### Actionable metrics

Measure the operational signals that help detect regressions early.

Track at least:

- latency for critical flows
- error rate
- retry rate when retries exist
- throughput for high-traffic paths

## Client Concurrency Rules

### Effects may re-run

Assume `useEffect` can run more than once, especially in Strict Mode and during rapid state changes.

Do not rely on an effect running exactly once unless the framework explicitly guarantees it.

### Cancel async work

Cancel or invalidate asynchronous work when the component unmounts or when the effect dependencies change.

Prefer `AbortController` for fetch-based work and an equivalent cleanup strategy for other async APIs.

```ts
useEffect(() => {
  const controller = new AbortController();

  fetch("/api/data", { signal: controller.signal })
    .then((response) => response.json())
    .then((data) => setData(data))
    .catch((error) => {
      if (error.name !== "AbortError") {
        console.error(error);
      }
    });

  return () => controller.abort();
}, []);
```

### Guard against stale or out-of-order responses

When multiple requests can overlap, ensure only the latest relevant response updates UI state.

Use request sequencing, refs, or equivalent invalidation patterns to prevent older responses from overwriting newer state.

```ts
const requestIdRef = useRef(0);

useEffect(() => {
  const requestId = ++requestIdRef.current;

  fetchData().then((result) => {
    if (requestId === requestIdRef.current) {
      setData(result);
    }
  });
}, [dependency]);
```

### Avoid stale state updates

Use functional updates when the next value depends on the previous state.

```ts
setCount((previousCount) => previousCount + 1);
```

### Client logging

Keep production client logging sparse, contextual, and safe.

Prefer reporting actionable failures to the approved observability platform instead of leaving noisy console output in production code.

## Server Concurrency Rules

### Assume concurrent mutations

Design every write path assuming multiple requests may target the same resource at nearly the same time.

Do not rely on the browser or UI ordering to guarantee consistency.

### Idempotency and retries

Critical mutations should be safe under retries, duplicated submissions, and transient transport failures.

Prefer:

- idempotency keys for retryable create operations
- deterministic conflict handling for repeated writes
- explicit retry policies only where side effects are safe

### Shared-resource protection

Protect shared state with the correct consistency mechanism for the use case.

Common options include:

- database transactions
- optimistic concurrency with version checks
- unique constraints for write deduplication
- queueing or serialization where required by the domain

### Error boundaries

Classify errors by responsibility and exposure level.

Expose safe, stable messages externally and keep detailed diagnostics in internal logs.

## Performance and Resilience Rules

### Avoid event-loop blocking

Keep CPU-heavy or blocking work out of latency-sensitive request paths unless it is explicitly bounded and justified.

Prefer asynchronous I/O, batching, background processing, or precomputation when appropriate.

### Reduce unnecessary work

Avoid duplicate requests, overfetching, and repeated expensive computations in both client and server flows.

Prefer:

- batching related operations
- caching when data staleness is acceptable
- debouncing or throttling for high-frequency user input
- one primary server-side data entrypoint per route when possible

### Design for partial failure

Assume provider calls, network requests, and downstream services can fail independently.

Handle timeouts, retries, and fallback behavior intentionally instead of letting failures leak as generic runtime errors.

## Common Antipatterns

| Problem | Description | Consequence |
| --- | --- | --- |
| Race conditions | Multiple operations update the same state without coordination | Inconsistent or corrupted data |
| Memory leaks | Async work continues after the owner is gone | Growing memory usage and noisy warnings |
| Insufficient logs | Events lack context or correlation | Slow and unreliable debugging |
| Overfetching | The system requests more data or more often than needed | Higher latency and wasted resources |
| Stale state | Updates rely on outdated values | Intermittent UI and business bugs |

## Notes

- Treat concurrency as a default condition, not an edge case.
- Keep consistency guarantees on the server, not in the client.
- Put external DTO mapping and provider-specific resilience logic in infrastructure, not in domain or presentational UI.
- Follow repository security rules when logging or handling failures.
- Use this document for decision guidance; keep `AGENTS.md` focused on compact mandatory rules.
