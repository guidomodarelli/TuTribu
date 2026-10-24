/** Creates fresh purpose-separated synthetic material for exact owned native hosts only. */
import { randomBytes, randomUUID } from "node:crypto";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { ADMISSION_SHARED_HOST_FIXTURE } from "./constants/admission-performance";

/** @returns Private environment input kept in server memory; callers must not serialize it into receipts or SQL. */
export function createAdmissionSyntheticHostingEnvironment(): Record<string, string> {
  const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => {
    const keyId = randomUUID(), material = randomBytes(MESSAGING_CRYPTO.keyBytes);
    try { return [purpose, { activeKeyId: keyId, keys: [{ id: keyId, materialBase64: material.toString("base64") }] }]; }
    finally { material.fill(0); }
  }));
  return {
    [MESSAGING_HOSTING_ENV.environment]: ADMISSION_SHARED_HOST_FIXTURE.securityEnvironment,
    [MESSAGING_HOSTING_ENV.securityEpoch]: randomUUID(),
    [MESSAGING_HOSTING_ENV.recoveryLock]: MESSAGING_RECOVERY_LOCK_VALUE.unlocked,
    [MESSAGING_HOSTING_ENV.keyrings]: JSON.stringify(keyrings),
  };
}
