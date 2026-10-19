/** Verifies freshness of the signed response separately from Google's older login time. */
import { describe, expect, it } from "vitest";
import { getGoogleAccountConfirmationTime } from "@/src/modules/auth/domain/policies/google-account-confirmation";

const now = new Date("2026-10-18T15:00:00.750Z");
const current = {
  now,
  intentCreatedAt: new Date("2026-10-18T14:59:55.900Z"),
  tokenIssuedAt: new Date("2026-10-18T15:00:00.000Z"),
  tokenExpiresAt: new Date("2026-10-18T16:00:00.000Z"),
};

describe("Google account confirmation time", () => {
  it("should establish a new server confirmation after an eligible signed response", () => {
    const confirmedAt = getGoogleAccountConfirmationTime(current);
    expect(confirmedAt).toEqual(now);
    expect(confirmedAt).not.toBe(now);
    expect(confirmedAt).not.toEqual(current.tokenIssuedAt);
  });

  it("should accommodate second precision of a response issued during the intent's creation second", () => {
    expect(getGoogleAccountConfirmationTime({ ...current, tokenIssuedAt: new Date("2026-10-18T14:59:55.000Z") })).toEqual(now);
  });

  it.each([
    { tokenIssuedAt: new Date("2026-10-18T14:59:54.000Z") },
    { tokenIssuedAt: new Date("2026-10-18T15:00:01.000Z") },
    { tokenIssuedAt: new Date("2026-10-18T14:50:00.000Z"), intentCreatedAt: new Date("2026-10-18T14:49:59.000Z") },
    { tokenIssuedAt: new Date(Number.NaN) },
    { tokenExpiresAt: now },
    { tokenExpiresAt: new Date(Number.NaN) },
    { intentCreatedAt: new Date(Number.NaN) },
    { intentCreatedAt: new Date("2026-10-18T15:00:01.000Z") },
    { now: new Date(Number.NaN) },
  ])("should not confirm a response outside the current request or its valid lifetime (%j)", (dates) => {
    expect(getGoogleAccountConfirmationTime({ ...current, ...dates })).toBeNull();
  });
});
