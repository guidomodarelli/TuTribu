/** @vitest-environment node */
/** Exercises native WebCrypto one-way proposal scoping without mocking a platform library. @module personal-invitation-browser-scope-tests */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";

describe("personal invitation browser recovery scope", () => {
  it("should remain stable for one proposal and distinct for another without retaining token material", async () => {
    const token = randomBytes(32).toString("base64url"), otherToken = randomBytes(32).toString("base64url");
    const scope = await createPersonalInvitationBrowserScope(token);
    expect(scope).toMatch(/^[a-f0-9]{64}$/);
    expect(await createPersonalInvitationBrowserScope(token)).toBe(scope);
    expect(await createPersonalInvitationBrowserScope(otherToken)).not.toBe(scope);
    expect(scope).not.toContain(token);
  });
  it("should reject non-canonical proposals before accepting a recovery identity", async () => {
    await expect(createPersonalInvitationBrowserScope("invalid")).rejects.toThrow("invalid_input");
  });
});
