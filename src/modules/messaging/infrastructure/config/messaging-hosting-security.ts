/** Reads live hosting settings without a provider-key fallback or mutable imported-key cache. @module messaging-hosting-security */
import "server-only";
import { z } from "zod";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { createMessagingSecurityConfig, type MessagingKeyringInput, type MessagingKeyPurpose, type MessagingSecurityConfig } from "./messaging-security-config";
import type {MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingProtectionKeyState } from "../../domain/repositories/messaging-protection-key-rotation";
import { createMessagingProtectionKeyTopology } from "./messaging-protection-key-state";

/** This is the application's own hosting-secret input contract, never a provider/SQL response schema. */
const hostingKeyringsSchema = z.record(z.enum(MESSAGING_KEY_PURPOSE), z.strictObject({ activeKeyId: z.string().trim().min(1), keys: z.array(z.strictObject({ id: z.string().trim().min(1), materialBase64: z.string().min(1) })).min(1) }));
type HostingEnvironment = Readonly<Record<string, string | undefined>>;

/** @param environment - Current own hosting-secret input. @returns Parsed configuration input, without decoding or importing any key. @throws MessagingCryptographyError when the own input is unavailable. */
function parseHostingKeyrings(environment: HostingEnvironment) {
  let input: unknown;
  try { input = JSON.parse(environment[MESSAGING_HOSTING_ENV.keyrings] ?? ""); }
  catch (error) { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration, { cause: error }); }
  const parsed = hostingKeyringsSchema.safeParse(input);
  if (!parsed.success) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
  return parsed.data;
}

/** @param environment - Current external settings. @returns Closed deployment and key-routing metadata without decoding/importing/selecting crypto keys. @throws MessagingCryptographyError before reading keyring input when recovery or deployment identity is unavailable. */
export function readMessagingHostingProtectionKeyState(environment: HostingEnvironment = process.env): MessagingProtectionKeyState {
  const facts = readMessagingHostingSecurityFacts(environment);
  if (facts.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  const keyrings = parseHostingKeyrings(environment);
  return { ...facts, keyrings: createMessagingProtectionKeyTopology((purpose) => {
    const keyIds = keyrings[purpose].keys.map((key) => key.id).sort();
    if (new Set(keyIds).size !== keyIds.length || !keyIds.includes(keyrings[purpose].activeKeyId)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
    return { activeKeyId: keyrings[purpose].activeKeyId, keyIds };
  }) };
}

/** @param environment - Current external hosting settings. @returns Closed recovery state without reading/importing any keyring. */
export function readMessagingRecoveryLock(environment: HostingEnvironment = process.env): boolean {
  return environment[MESSAGING_HOSTING_ENV.recoveryLock] !== MESSAGING_RECOVERY_LOCK_VALUE.unlocked;
}

/** @param environment - Current non-secret hosting identity/recovery settings. @returns Closed external facts without reading, parsing or importing keyrings. */
export function readMessagingHostingSecurityFacts(environment:HostingEnvironment=process.env):MessagingSecurityFacts{
  const deployment=environment[MESSAGING_HOSTING_ENV.environment]?.trim()??"",securityEpoch=environment[MESSAGING_HOSTING_ENV.securityEpoch]?.trim()??"";
  return{environment:deployment,securityEpoch,recoveryLocked:readMessagingRecoveryLock(environment)||!deployment||!securityEpoch};
}

/**
 * Imports an explicit live snapshot; the crypto owner enforces length/separation and closed recovery behavior.
 * @param environment - Current hosting secrets, never browser input or per-tribe provider credentials.
 * @returns Nonextractable independent keys, epoch and recovery state without retaining raw material.
 * @throws MessagingCryptographyError with a safe top-level diagnostic and private original cause.
 */
export async function readMessagingHostingSecurityConfig(environment: HostingEnvironment = process.env): Promise<MessagingSecurityConfig> {
  const deployment = environment[MESSAGING_HOSTING_ENV.environment]?.trim(), securityEpoch = environment[MESSAGING_HOSTING_ENV.securityEpoch]?.trim(), recovery = environment[MESSAGING_HOSTING_ENV.recoveryLock];
  if (!deployment || !securityEpoch || recovery !== MESSAGING_RECOVERY_LOCK_VALUE.locked && recovery !== MESSAGING_RECOVERY_LOCK_VALUE.unlocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
  const sources = parseHostingKeyrings(environment);
  const keyrings = {} as Record<MessagingKeyPurpose, MessagingKeyringInput>, material: Uint8Array[] = [];
  try {
    for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) {
      const source = sources[purpose];
      keyrings[purpose] = { activeKeyId: source.activeKeyId, keys: source.keys.map((key) => {
        let decoded: string;
        try { decoded = atob(key.materialBase64); }
        catch (error) { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration, { cause: error }); }
        const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
        material.push(bytes);
        return { id: key.id, material: bytes };
      }) };
    }
    return await createMessagingSecurityConfig({ environment: deployment, securityEpoch, recoveryLocked: recovery === MESSAGING_RECOVERY_LOCK_VALUE.locked, keyrings });
  } finally { for (const bytes of material) bytes.fill(0); }
}
