/** @vitest-environment node */
/** Exercises how the hosting messaging security is classified as a platform requirement before any admission write. @module admission-policy-security-requirement-tests */
import { describe, expect, it } from "vitest";
import { isMessagingHostingSecurityConfigured, readMessagingHostingPlatformRequirement } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { classifyMessagingPlatformSecurityFailure } from "@/src/modules/messaging/infrastructure/config/messaging-platform-security-failure";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";

describe("hosting messaging security as a platform requirement", () => {
  it("should tell a usable hosting configuration from a missing or broken one", async () => {
    const environment = createAdmissionSyntheticHostingEnvironment();
    expect(await isMessagingHostingSecurityConfigured(environment)).toBe(true);
    expect(await isMessagingHostingSecurityConfigured({})).toBe(false);
    expect(await isMessagingHostingSecurityConfigured({ ...environment, [MESSAGING_HOSTING_ENV.keyrings]: "{" })).toBe(false);
  });

  it("should name the platform requirement from the hosting settings alone, as the writers apply it", async () => {
    const environment = createAdmissionSyntheticHostingEnvironment();
    expect(await readMessagingHostingPlatformRequirement(environment)).toBeNull();
    expect(await readMessagingHostingPlatformRequirement({ ...environment, [MESSAGING_HOSTING_ENV.recoveryLock]: MESSAGING_RECOVERY_LOCK_VALUE.locked })).toBe("recovery_locked");
    // An unrecognized lock value, a missing epoch or a missing keyring cannot be imported: the platform has not configured it.
    expect(await readMessagingHostingPlatformRequirement({ ...environment, [MESSAGING_HOSTING_ENV.recoveryLock]: "locked" })).toBe("security_unconfigured");
    expect(await readMessagingHostingPlatformRequirement({ ...environment, [MESSAGING_HOSTING_ENV.securityEpoch]: "" })).toBe("security_unconfigured");
    expect(await readMessagingHostingPlatformRequirement({})).toBe("security_unconfigured");
  });

  it("should classify only platform-owned cryptographic failures, never an identity mismatch or another error", () => {
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration))).toBe("security_unconfigured");
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven))).toBe("security_unconfigured");
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable))).toBe("security_unconfigured");
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked))).toBe("recovery_locked");
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch))).toBeNull();
    expect(classifyMessagingPlatformSecurityFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.authenticationFailed))).toBeNull();
    expect(classifyMessagingPlatformSecurityFailure(new Error("Synthetic unrelated failure"))).toBeNull();
  });
});
