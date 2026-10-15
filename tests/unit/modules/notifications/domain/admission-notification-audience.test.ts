/** Exercises the business audience of every canonical admission notification event. @module admission-notification-audience-test */
import { describe, expect, it } from "vitest";
import { resolveAdmissionNotificationAudience } from "@/src/modules/notifications/domain/policies/admission-notification-audience";

describe("admission notification audience", () => {
  it.each([
    { event: "pending_created", audience: "reviewer" },
    { event: "reminder", audience: "reviewer" },
    { event: "approved", audience: "applicant" },
    { event: "rejected", audience: "applicant" },
    { event: "cancelled", audience: "applicant" },
    { event: "expired", audience: "applicant" },
  ] as const)("should select $audience for the original $event event", ({ event, audience }) => {
    expect(resolveAdmissionNotificationAudience(event)).toBe(audience);
  });
});
