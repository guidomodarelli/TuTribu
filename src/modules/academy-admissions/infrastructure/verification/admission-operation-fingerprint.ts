/** Protects normalized intents with native HMAC and retained key ids, never raw payload persistence. */
import "server-only";
import type { AdmissionIntentValue, AdmissionOperationCommand } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { ADMISSION_OPERATION_FINGERPRINT_DOMAIN } from "@/src/modules/academy-admissions/constants/admission-operation";
import { MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Orders object keys recursively while preserving the normalized intent's array order and values. */
function canonicalJson(value: AdmissionIntentValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const object = value as { readonly [key: string]: AdmissionIntentValue };
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

/**
 * Creates a per-operation MAC helper; rotating the active key preserves replay via retained old keys.
 * @param config - Current private payload-MAC keyring and recovery facts.
 * @returns Native signing/verification without retaining the normalized payload.
 */
export function createAdmissionOperationFingerprint(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
  const material = (command: AdmissionOperationCommand, keyId: string) => new TextEncoder().encode(JSON.stringify([ADMISSION_OPERATION_FINGERPRINT_DOMAIN, keyId, config.environment, command.actorUserId, command.tribeId, command.operationType, command.idempotencyKey, canonicalJson(command.intent)]));
  const key = (keyId: string) => {
    if (config.recoveryLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const current = ring.keys.get(keyId);
    if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    return current;
  };
  return {
    /** Signs a new claim under the active independent payload key. */
    async sign(command: AdmissionOperationCommand) {
      const keyId = ring.activeKeyId;
      return { keyId, digest: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key(keyId), material(command, keyId))) };
    },
    /** Compares the current normalized intent with the exact stored key and MAC using Web Crypto. */
    verify(command: AdmissionOperationCommand, keyId: string, digest: Uint8Array): Promise<boolean> {
      return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key(keyId), Uint8Array.from(digest), material(command, keyId));
    },
  };
}
