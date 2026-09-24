import { describe, expect, it } from "vitest";

import {
  FRESHNESS_READ_RETRY_DELAYS_MS,
  planFreshnessReadRetry,
} from "@/lib/events/tribe-event-read-retry";

describe("planFreshnessReadRetry", () => {
  it("walks the bounded backoff in order", () => {
    const plannedDelaysMs = FRESHNESS_READ_RETRY_DELAYS_MS.map(
      (_delayMs, retryCount) => planFreshnessReadRetry(retryCount)
    );

    expect(plannedDelaysMs).toEqual([
      { delayMs: 5_000, retryCount: 1 },
      { delayMs: 15_000, retryCount: 2 },
      { delayMs: 45_000, retryCount: 3 },
    ]);
  });

  it("stops once every retry was used", () => {
    expect(planFreshnessReadRetry(FRESHNESS_READ_RETRY_DELAYS_MS.length)).toBeNull();
  });
});
