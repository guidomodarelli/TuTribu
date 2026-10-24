/** Protects a new immutable notification recovery intent with its own domain and retained payload key. @module notification-recovery-payload-mac */
import "server-only";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import { NOTIFICATION_DELIVERY_RECOVERY_PAYLOAD_DOMAIN } from "../../constants/notification-delivery-recovery";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { MessagingCryptographyError } from "./messaging-cryptography-error";

/** Carries only locked immutable references; no code, credential or recipient address is persisted. */
export type NotificationRecoveryPayloadContext = {
  tribeId: string;
  deliveryId: string;
  originalDeliveryId: string;
  connectionId: string;
  connectionVersion: number;
  obligationId: string;
  recipientRef: string;
  senderId: string;
  createdAt: Date;
  deadlineAt: Date;
};

/**
 * Signs explicit recovery references, preserving the original obligation and deadline.
 * @param config - Current external epoch and nonextractable payload keyring.
 * @returns Independent sign/verify operations for the exact new recovery intent.
 */
export function createNotificationRecoveryPayloadMac(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
  /** @param keyId - Active or retained own key id. @returns Current private HMAC key. @throws MessagingCryptographyError when external recovery is closed or a key is absent. */
  const key = (keyId: string) => {
    if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
    const material = ring.keys.get(keyId);
    if (!material) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
    return material;
  };
  /** @param context - Locked immutable recovery tuple. @param keyId - Exact own active/retained key. @returns Fixed-order bytes independent of PostgreSQL jsonb object ordering. */
  const data = (context: NotificationRecoveryPayloadContext, keyId: string) => new TextEncoder().encode(JSON.stringify([
    NOTIFICATION_DELIVERY_RECOVERY_PAYLOAD_DOMAIN, keyId, config.environment, config.securityEpoch,
    context.tribeId, context.deliveryId, context.originalDeliveryId, context.connectionId,
    context.connectionVersion, context.obligationId, context.recipientRef, context.senderId,
    context.createdAt.toISOString(), context.deadlineAt.toISOString(),
  ]));
  return {
    /** @param context - Exact new locked intent. @returns Active key id and private MAC, never plaintext address or content. */
    async sign(context: NotificationRecoveryPayloadContext) {
      return { keyId: ring.activeKeyId, mac: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key(ring.activeKeyId), data(context, ring.activeKeyId))) };
    },
    /** @param keyId - Original retained key id. @param mac - Persisted private MAC. @param context - Original immutable tuple. @returns Whether this exact original recovery payload remains authentic. */
    async verify(keyId: string, mac: Uint8Array, context: NotificationRecoveryPayloadContext): Promise<boolean> {
      return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key(keyId), new Uint8Array(mac), data(context, keyId));
    },
  };
}
