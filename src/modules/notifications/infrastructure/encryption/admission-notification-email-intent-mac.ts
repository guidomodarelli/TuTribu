/** Authenticates complete grouped notification content with exact native clocks and retained keys. @module admission-notification-email-intent-mac */
import "server-only";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { ADMISSION_NOTIFICATION_EMAIL_INTENT_MAC_DOMAIN } from "../../constants/admission-notification-email-intent";
import type { AdmissionNotificationEmailIntentContext } from "../../domain/entities/admission-notification-email-intent";

/**
 * Keeps this full-intent contract separate from the unchanged legacy notification recovery MAC.
 * @param config - Current external scope/recovery guard and private nonextractable payload keyring.
 * @returns Exact sign/verify operations; neither operation persists or returns the trusted destination.
 */
export function createAdmissionNotificationEmailIntentMac(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
  /** @param keyId - Original active/retained payload key. @returns Current private material. @throws MessagingCryptographyError when recovery or retained-key availability closes. */
  const key = (keyId: string) => {
    if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
    const material = ring.keys.get(keyId);
    if (!material) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
    return material;
  };
  /** @param context - Complete immutable private intent plus transient current trusted address. @param keyId - Exact signing key. @returns Fixed-order consumed bytes, independent of jsonb object order and Date precision. */
  const data = (context: AdmissionNotificationEmailIntentContext, keyId: string) => {
    const intent = context.intent, manifest = intent.manifest, identity = manifest.identity;
    if (!Number.isSafeInteger(context.createdAtMicroseconds) || !Number.isSafeInteger(context.deadlineAtMicroseconds) || context.deadlineAtMicroseconds <= context.createdAtMicroseconds) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
    return new TextEncoder().encode(JSON.stringify([
      ADMISSION_NOTIFICATION_EMAIL_INTENT_MAC_DOMAIN, keyId, config.environment, config.securityEpoch,
      context.tribeId, context.deliveryId, context.originalDeliveryId, context.connectionId, context.connectionVersion,
      context.contributingLeaderUserId, context.recipientUserId, context.normalizedRecipientEmail, context.idempotencyKey,
      context.queuedUsagePolicyVersion, context.createdAtMicroseconds, context.deadlineAtMicroseconds,
      intent.format, intent.kind, intent.groupId, intent.groupVersion, intent.channel, intent.senderId, intent.subject, intent.text, intent.href,
      manifest.format, identity.tribeId, identity.recipientUserId, identity.audience, identity.mode, identity.preferenceVersion,
      identity.emailSettingsVersion, identity.window.timeZone, identity.window.startsAtMicroseconds, identity.window.closesAtMicroseconds,
      identity.individualObligationId, manifest.items.map((item) => [item.obligationId, item.admissionRequestId, item.event, item.createdAtMicroseconds, item.deadlineAtMicroseconds]),
    ]));
  };
  return {
    /** @param context - Exact newly prepared intent. @returns Only its own key reference and private HMAC. */
    async sign(context: AdmissionNotificationEmailIntentContext) {
      return { keyId: ring.activeKeyId, mac: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key(ring.activeKeyId), data(context, ring.activeKeyId))) };
    },
    /** @param context - Original complete consumed intent with freshly trusted current email. @param signed - Original retained key reference and private MAC. @returns Whether every consumed byte and exact native timestamp remains authentic. */
    async verify(context: AdmissionNotificationEmailIntentContext, signed: { keyId: string; mac: Uint8Array }): Promise<boolean> {
      return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key(signed.keyId), new Uint8Array(signed.mac), data(context, signed.keyId));
    },
  };
}
