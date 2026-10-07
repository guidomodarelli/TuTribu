/** Exercises queue and marker semantics without treating provider delivery as contact authority. @module message-delivery-policy-tests */
import { describe, expect, it } from "vitest";
import { isMessageDeliveryClaimEligible, hasPossibleMessageDispatch } from "@/src/modules/messaging/domain/policies/message-delivery-policy";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";

describe("message delivery eligibility", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const queued = { state: "queued" as const, dueAt: new Date("2026-10-06T11:59:00Z"), deadlineAt: new Date("2026-10-06T12:05:00Z"), leaseUntil: null };

  it("should permit due work and an exactly expired lease only when no marker exists", () => {
    expect(isMessageDeliveryClaimEligible(queued, now, false)).toBe(true);
    expect(isMessageDeliveryClaimEligible({ ...queued, leaseUntil: now }, now, false)).toBe(true);
    expect(isMessageDeliveryClaimEligible({ ...queued, leaseUntil: new Date("2026-10-06T12:00:01Z") }, now, false)).toBe(false);
    expect(isMessageDeliveryClaimEligible({ ...queued, dueAt: new Date("2026-10-06T12:00:01Z") }, now, false)).toBe(false);
    expect(isMessageDeliveryClaimEligible({ ...queued, deadlineAt: now }, now, false)).toBe(false);
    expect(isMessageDeliveryClaimEligible(queued, new Date(Number.NaN), false)).toBe(false);
  });

  it.each(["accepted", "delivered", "failed", "unknown", "suppressed", "cancelled"] as const)("should exclude the %s obligation from another claim", (state) => {
    expect(isMessageDeliveryClaimEligible({ ...queued, state }, now, false)).toBe(false);
  });

  it.each(["in_flight", "unknown", "accepted", "delivered", "rejected"] as const)("should preserve possible send evidence for a %s marker and never reclaim it", (state) => {
    const attempt: MessageDeliveryAttempt = { id: "synthetic-attempt", deliveryId: "synthetic-delivery", tribeId: "synthetic-tribe", connectionId: "synthetic-connection", connectionVersion: 1, sequence: 1, reservationId: "synthetic-reservation", leaseToken: "synthetic-lease", sendAuthorizedAt: now, authorizedUsagePolicyVersion: 1, recipientCountry: null, state, completedAt: null, correlationId: null, providerMessageId: null, safeReason: null, version: 1 };
    expect(hasPossibleMessageDispatch(attempt)).toBe(true);
    expect(isMessageDeliveryClaimEligible(queued, now, hasPossibleMessageDispatch(attempt))).toBe(false);
  });
});
