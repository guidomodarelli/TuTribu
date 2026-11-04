/** Creates hosting security whose keys were never enrolled, as after a rotation without enrollment. @module admission-unenrolled-security-config */
import { randomBytes, randomUUID } from "node:crypto";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput, type MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/**
 * @param config - Enrolled synthetic configuration whose deployment identity is kept.
 * @returns The same environment and epoch with fresh independent keys that have no enrolled proof.
 */
export async function createUnenrolledSecurityConfig(config: MessagingSecurityConfig): Promise<MessagingSecurityConfig> {
  const keyrings = {} as Record<MessagingKeyPurpose, MessagingKeyringInput>;
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) { const id = randomUUID(); keyrings[purpose] = { activeKeyId: id, keys: [{ id, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] }; }
  return createMessagingSecurityConfig({ environment: config.environment, securityEpoch: config.securityEpoch, recoveryLocked: false, keyrings });
}
