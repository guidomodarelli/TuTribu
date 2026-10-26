/** Defines immutable effective connection configuration and independent credential/capability facts. @module messaging-connection-version */
import { MESSAGING_CONNECTION_CONFIGURATION_FIELDS, MESSAGING_CONNECTION_REQUIREMENT } from "@/src/modules/messaging/constants/messaging-connection-lifecycle";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MessagingConnectionConfigurationError } from "../errors/messaging-connection-configuration-error";

/** Effective resource references belong to one version, never a mutable global sender. */
export type MessagingConnectionConfiguration = Readonly<{ emailSenderId: string | null; smsSenderId: string | null; whatsappSenderId: string | null; whatsappTemplateId: string | null; whatsappTemplateLanguage: string | null }>;
/** Exact prepared resource facts remain distinct from a received-code diagnostic. */
export type MessagingConnectionCapability = Readonly<{ channel: "email" | "sms" | "whatsapp"; state: "unprepared" | "prepared" | "unavailable"; senderId: string; templateId: string | null; templateLanguage: string | null }>;
/** Private version metadata excludes plaintext credential and protected diagnostic destination. */
export type MessagingConnectionVersion = Readonly<{
  connectionId: string; tribeId: string; version: number; secretRef: string | null; environment: string; securityEpoch: string;
  configuration: MessagingConnectionConfiguration;
  credential: Readonly<{ status: "not_validated" | "valid" | "invalid" | "unavailable"; validatedAt: Date | null; isTestMode: boolean | null }>;
  capabilities: readonly MessagingConnectionCapability[]; retiredAt: Date | null; createdAt: Date;
}>;

/**
 * Preserves a no-op and proposes new unproven metadata for an effective edit.
 * @param current - Current exact immutable version.
 * @param configuration - Proposed effective configuration already normalized by its boundary.
 * @param nextSecretRef - An envelope bound to the new version; plaintext is never part of this model.
 * @param now - Authoritative owner time after current resource locks.
 * @returns Existing version for no-op or a new version requiring credential and channel checks.
 * @throws MessagingConnectionConfigurationError when retired or attempting to reuse another version's envelope.
 */
export function prepareMessagingConnectionVersion(current: MessagingConnectionVersion, configuration: MessagingConnectionConfiguration, nextSecretRef: string | null, now: Date): { changed: boolean; version: MessagingConnectionVersion } {
  if (current.retiredAt) throw new MessagingConnectionConfigurationError(MESSAGING_CONNECTION_REQUIREMENT.resourceUnavailable);
  const changed = nextSecretRef !== current.secretRef || MESSAGING_CONNECTION_CONFIGURATION_FIELDS.some((field) => configuration[field] !== current.configuration[field]);
  if (!changed) return { changed: false, version: current };
  if (!nextSecretRef || nextSecretRef === current.secretRef) throw new MessagingConnectionConfigurationError(MESSAGING_CONNECTION_REQUIREMENT.secretVersionRequired);
  return { changed: true, version: { ...current, version: current.version + 1, configuration: { ...configuration }, secretRef: nextSecretRef, credential: { status: MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated, validatedAt: null, isTestMode: null }, capabilities: [], retiredAt: null, createdAt: now } };
}
