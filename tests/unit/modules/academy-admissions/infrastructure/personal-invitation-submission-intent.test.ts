/** Exercises actual browser storage and strict own personal original-reference contracts. @module personal-invitation-submission-intent-tests */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { clearPersonalInvitationSubmissionIntent, readPersonalInvitationSubmissionIntent, writePersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";

afterEach(() => window.sessionStorage.clear());

describe("personal canje original reference", () => {
  it("should preserve only the exact operation reference within its viewer, academy and personal proposal", () => {
    const scope = { viewerId: randomUUID(), slug: "synthetic-academy", personalScope: "a".repeat(64) }, record = { ...scope, operationId: randomUUID() };
    writePersonalInvitationSubmissionIntent(record);
    expect(readPersonalInvitationSubmissionIntent(scope)).toEqual(record);
    expect(readPersonalInvitationSubmissionIntent({ ...scope, viewerId: randomUUID() })).toBeNull();
    expect(readPersonalInvitationSubmissionIntent({ ...scope, slug: "another-academy" })).toBeNull();
    expect(readPersonalInvitationSubmissionIntent({ ...scope, personalScope: "b".repeat(64) })).toBeNull();
    clearPersonalInvitationSubmissionIntent(scope);
    expect(readPersonalInvitationSubmissionIntent(scope)).toBeNull();
  });

  it.each(["invitationToken", "verificationCode", "proofId", "sessionId", "phone", "confirmed", "state", "result"])("should reject %s before persisting a reference", (field) => {
    expect(() => writePersonalInvitationSubmissionIntent({ viewerId: randomUUID(), slug: "synthetic-academy", personalScope: "a".repeat(64), operationId: randomUUID(), [field]: "synthetic-private-value" })).toThrow();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("should discard an unusable stored reference and never infer accepted progress from it", () => {
    const scope = { viewerId: randomUUID(), slug: "synthetic-academy", personalScope: "a".repeat(64) };
    writePersonalInvitationSubmissionIntent({ ...scope, operationId: randomUUID() });
    window.sessionStorage.setItem(window.sessionStorage.key(0)!, "{");
    expect(readPersonalInvitationSubmissionIntent(scope)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
