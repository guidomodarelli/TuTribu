/** @vitest-environment node */
/** Tells a temporary platform lock apart from a rotation that invalidates a saved import, with real imported hosting keys. @module allowlist-import-protection-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertAllowlistImportProtection, type AllowlistImportProtection } from "@/src/modules/academy-admissions/infrastructure/repositories/allowlist-import-protection";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";

/** @returns Real hosting security and the protection a preview saved under it. */
async function fixture() {
  const config = await readMessagingHostingSecurityConfig(createAdmissionSyntheticHostingEnvironment());
  const protectedWith: AllowlistImportProtection = { environment: config.environment, securityEpoch: config.securityEpoch, key: { purpose: MESSAGING_KEY_PURPOSE.operationPayload, keyId: config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].activeKeyId } };
  return { config, protectedWith };
}

describe("allowlist import protection", () => {
  it("should accept the same environment, epoch and retained key the import was saved with", async () => {
    const { config, protectedWith } = await fixture();
    expect(() => assertAllowlistImportProtection(config, protectedWith)).not.toThrow();
  });

  it("should raise the platform lock itself, never a known import denial, so the original stays resumable", async () => {
    const { config, protectedWith } = await fixture();
    let caught: unknown;
    try { assertAllowlistImportProtection({ ...config, recoveryLocked: true }, protectedWith); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(MessagingCryptographyError);
    expect(caught).toMatchObject({ code: MESSAGING_CRYPTO_ERROR.recoveryLocked });
    expect(caught).not.toBeInstanceOf(AdmissionOperationError);
  });

  it.each([
    ["a rotated epoch", (protectedWith: AllowlistImportProtection) => ({ ...protectedWith, securityEpoch: randomUUID() })],
    ["another environment", (protectedWith: AllowlistImportProtection) => ({ ...protectedWith, environment: "synthetic-other-environment" })],
    ["a key that is no longer retained", (protectedWith: AllowlistImportProtection) => ({ ...protectedWith, key: { ...protectedWith.key, keyId: randomUUID() } })],
  ])("should close the import for good after %s, so the leader needs a new preview", async (_label, change) => {
    const { config, protectedWith } = await fixture();
    expect(() => assertAllowlistImportProtection(config, change(protectedWith))).toThrow(expect.objectContaining({ code: "resource_unavailable" }));
  });
});
