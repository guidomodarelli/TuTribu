/** Resolves private keys of the operation payload keyring behind the external recovery guard. @module operation-payload-keyring */
import "server-only";
import { MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { MessagingCryptographyError } from "./messaging-cryptography-error";

/**
 * @param config - Current external recovery guard and nonextractable payload keyring.
 * @returns The payload keyring and a resolver of its active or retained private keys.
 */
export function readOperationPayloadKeyring(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
  /** @param keyId - Active or retained own key id. @returns Current private HMAC key. @throws MessagingCryptographyError when external recovery is closed or a key is absent. */
  const key = (keyId: string) => {
    if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
    const material = ring.keys.get(keyId);
    if (!material) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
    return material;
  };
  return { ring, key };
}
