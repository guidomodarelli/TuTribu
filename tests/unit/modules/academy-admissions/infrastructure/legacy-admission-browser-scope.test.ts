/** @vitest-environment node */
/** Exercises native browser-compatible digest separation without replacing Web Crypto. @module legacy-admission-browser-scope-tests */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLegacyAdmissionBrowserScope } from "@/lib/academy-admissions/legacy-admission-scope";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";
import { LEGACY_ADMISSION_TOKEN_BYTE_LENGTH } from "@/tests/support/constants/legacy-admission-entry";

describe("historical browser recovery scope", () => {
  it("should preserve one-way original identity while separating another historical URL and a personal permission", async () => {
    const token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url"), otherToken = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url");
    const scope = await createLegacyAdmissionBrowserScope(token);
    expect(LEGACY_ADMISSION_ARRIVAL.scopePattern.test(scope)).toBe(true);
    expect(scope.includes(token)).toBe(false);
    expect(await createLegacyAdmissionBrowserScope(token)).toBe(scope);
    expect(await createLegacyAdmissionBrowserScope(otherToken)).not.toBe(scope);
    expect(await createPersonalInvitationBrowserScope(token)).not.toBe(scope);
  });
  it("should reject malformed proposals before producing a recoverable original reference", async () => {
    await expect(createLegacyAdmissionBrowserScope("not-an-arrival")).rejects.toThrow("invalid_input");
  });
});
