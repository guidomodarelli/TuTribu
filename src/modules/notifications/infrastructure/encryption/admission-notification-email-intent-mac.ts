/** Authenticates complete grouped notification content with exact native clocks and retained keys. @module admission-notification-email-intent-mac */
import "server-only";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT, ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_FORMAT, ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_MAC_DOMAIN, ADMISSION_NOTIFICATION_EMAIL_INTENT_MAC_DOMAIN, ADMISSION_NOTIFICATION_EMAIL_PAYER_BINDING_DOMAIN, ADMISSION_NOTIFICATION_EMAIL_RECIPIENT_BINDING_DOMAIN } from "../../constants/admission-notification-email-intent";
import type { AdmissionNotificationEmailIntent, AdmissionNotificationEmailIntentContext, AdmissionNotificationEmailIntentScope, AdmissionNotificationEmailSealingContext, BoundAdmissionNotificationEmailIntent, OriginalAdmissionNotificationEmailIntentContext } from "../../domain/entities/admission-notification-email-intent";
import { projectAdmissionNotificationEmailContent } from "../../domain/policies/project-admission-notification-email-content";

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
  /** @param context - Exact native delivery scope. @returns After representable original clocks are confirmed. @throws MessagingCryptographyError for an invalid original lifetime. */
  const assertLifetime = (context: AdmissionNotificationEmailIntentScope): void => {
    if (!Number.isSafeInteger(context.createdAtMicroseconds) || !Number.isSafeInteger(context.deadlineAtMicroseconds) || context.deadlineAtMicroseconds <= context.createdAtMicroseconds) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  };
  /** @param context - Complete immutable content and original native scope. @param keyId - Exact retained key. @param domain - Explicit original protocol. @param payer - Raw legacy identity or opaque bound identity. @param recipient - Raw legacy destination or opaque bound destination. @returns Original fixed-order bytes independent of jsonb key order or Date precision. */
  const data = (context: AdmissionNotificationEmailIntentScope & { intent: AdmissionNotificationEmailIntent }, keyId: string, domain: string, payer: string, recipient: string) => {
    const intent = context.intent, manifest = intent.manifest, identity = manifest.identity;
    assertLifetime(context);
    return new TextEncoder().encode(JSON.stringify([
      domain, keyId, config.environment, config.securityEpoch,
      context.tribeId, context.deliveryId, context.originalDeliveryId, context.connectionId, context.connectionVersion,
      payer, context.recipientUserId, recipient, context.idempotencyKey,
      context.queuedUsagePolicyVersion, context.createdAtMicroseconds, context.deadlineAtMicroseconds,
      intent.format, intent.kind, intent.groupId, intent.groupVersion, intent.channel, intent.senderId, intent.subject, intent.text, intent.href,
      manifest.format, identity.tribeId, identity.recipientUserId, identity.audience, identity.mode, identity.preferenceVersion,
      identity.emailSettingsVersion, identity.window.timeZone, identity.window.startsAtMicroseconds, identity.window.closesAtMicroseconds,
      identity.individualObligationId, manifest.items.map((item) => [item.obligationId, item.admissionRequestId, item.event, item.createdAtMicroseconds, item.deadlineAtMicroseconds]),
    ]));
  };
  /** @param context - Original native delivery scope. @param keyId - Exact payload key. @param domain - Independent payer or recipient domain. @param identity - Transient current payer or trusted email. @returns Scoped identity bytes that are never persisted. */
  const bindingData = (context: AdmissionNotificationEmailIntentScope, keyId: string, domain: string, identity: string) => {
    assertLifetime(context);
    return new TextEncoder().encode(JSON.stringify([domain, keyId, config.environment, config.securityEpoch, context.tribeId, context.deliveryId, context.originalDeliveryId, context.connectionId, context.connectionVersion, context.recipientUserId, context.idempotencyKey, context.queuedUsagePolicyVersion, context.createdAtMicroseconds, context.deadlineAtMicroseconds, identity]));
  };
  /** @param context - Original bound intent without reconstructing erased personal data. @param keyId - Exact retained payload key. @returns Its complete authenticated transcript. */
  const boundData = (context: OriginalAdmissionNotificationEmailIntentContext, keyId: string) => data(context, keyId, ADMISSION_NOTIFICATION_EMAIL_INTENT_MAC_DOMAIN, context.intent.payerBinding, context.intent.recipientBinding);
  /** @param binding - Persisted opaque identity MAC. @returns Only decoded MAC bytes, or null for an unreadable private binding. */
  const decodeBinding = (binding: string): Uint8Array | null => {
    try { return Uint8Array.from(atob(binding), (character) => character.charCodeAt(0)); }
    catch { return null; }
  };
  return {
    /** @param context - Existing historical protocol with its still-available original identities. @returns Its unchanged key reference and MAC. @throws MessagingCryptographyError rather than reinterpret another format. */
    async sign(context: AdmissionNotificationEmailIntentContext) {
      if (context.intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_FORMAT) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
      return { keyId: ring.activeKeyId, mac: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key(ring.activeKeyId), data(context, ring.activeKeyId, ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_MAC_DOMAIN, context.contributingLeaderUserId, context.normalizedRecipientEmail))) };
    },
    /** @param context - Complete current content, payer, trusted email and native delivery coordinates. @returns A newly bound complete intent and MAC without persisting either transient identity. */
    async seal(context: AdmissionNotificationEmailSealingContext) {
      const snapshot = { ...context, content: projectAdmissionNotificationEmailContent(context.content) }, keyId = ring.activeKeyId, material = key(keyId);
      const payer = new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, material, bindingData(snapshot, keyId, ADMISSION_NOTIFICATION_EMAIL_PAYER_BINDING_DOMAIN, snapshot.contributingLeaderUserId)));
      const recipient = new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, material, bindingData(snapshot, keyId, ADMISSION_NOTIFICATION_EMAIL_RECIPIENT_BINDING_DOMAIN, snapshot.normalizedRecipientEmail)));
      const intent: BoundAdmissionNotificationEmailIntent = { ...snapshot.content, format: ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT, payerBinding: btoa(String.fromCharCode(...payer)), recipientBinding: btoa(String.fromCharCode(...recipient)) };
      const mac = new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, material, boundData({ ...snapshot, intent }, keyId)));
      return { intent, keyId, mac };
    },
    /** @param context - Exact bound historical content and original native coordinates. @param signed - Original retained key reference and full-content MAC. @returns Historical authenticity only; current permissions and trusted destination require separate checks. */
    async verifyOriginal(context: OriginalAdmissionNotificationEmailIntentContext, signed: { keyId: string; mac: Uint8Array }): Promise<boolean> {
      if (context.intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT) return false;
      return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key(signed.keyId), new Uint8Array(signed.mac), boundData(context, signed.keyId));
    },
    /** @param context - Original complete consumed intent with freshly trusted current email. @param signed - Original retained key reference and private MAC. @returns Whether every consumed byte and exact native timestamp remains authentic. */
    async verify(context: AdmissionNotificationEmailIntentContext, signed: { keyId: string; mac: Uint8Array }): Promise<boolean> {
      if (context.intent.format === ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_FORMAT) return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key(signed.keyId), new Uint8Array(signed.mac), data(context, signed.keyId, ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_MAC_DOMAIN, context.contributingLeaderUserId, context.normalizedRecipientEmail));
      if (context.intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT) return false;
      const original = { ...context, intent: context.intent }, material = key(signed.keyId);
      if (!await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, material, new Uint8Array(signed.mac), boundData(original, signed.keyId))) return false;
      const payer = decodeBinding(original.intent.payerBinding), recipient = decodeBinding(original.intent.recipientBinding);
      if (!payer || !recipient) return false;
      return await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, material, new Uint8Array(payer), bindingData(original, signed.keyId, ADMISSION_NOTIFICATION_EMAIL_PAYER_BINDING_DOMAIN, context.contributingLeaderUserId))
        && await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, material, new Uint8Array(recipient), bindingData(original, signed.keyId, ADMISSION_NOTIFICATION_EMAIL_RECIPIENT_BINDING_DOMAIN, context.normalizedRecipientEmail));
    },
  };
}
