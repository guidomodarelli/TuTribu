/** Models candidate activation requirements without replacing a selected connection or mutating policy/usage. @module tenant-messaging-connection */
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS, MESSAGING_CONNECTION_REQUIREMENT } from "@/src/modules/messaging/constants/messaging-connection-lifecycle";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE, MESSAGING_CAPABILITY_PUBLIC_STATE, MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { CONNECTION_DIAGNOSTIC_OUTCOME } from "@/src/modules/messaging/constants/connection-diagnostic";
import type { ConnectionDiagnostic } from "./connection-diagnostic";
import type { MessagingConnectionVersion, MessagingConnectionCapability } from "./messaging-connection-version";
import type { MessagingCountryPolicy } from "../repositories/messaging-usage-policy-repository";

/** Mutable lifecycle and immutable effective configuration carry separate version counters. */
export type TenantMessagingConnection = Readonly<{
  id: string; tribeId: string; providerId: string; leaderUserId: string; version: number;
  state: "draft" | "ready" | "active" | "degraded" | "suspended" | "disconnected"; stateReason: string | null;
  environment: string; securityEpoch: string; isSelected: boolean; isCandidate: boolean;
  selectedVersion: number | null; candidateVersion: number | null; retiredAt: Date | null; createdAt: Date; updatedAt: Date;
}>;
/** Application/persistence derive these current facts; this pure assessment grants no secret access. */
export type MessagingConnectionActivationFacts = {
  expectedVersion: number; currentLeaderUserId: string; environment: string; securityEpoch: string; recoveryLocked: boolean; now: Date;
  requiredChannels: readonly ("email" | "sms" | "whatsapp")[]; usagePolicy: MessagingCountryPolicy | null; diagnostics: readonly ConnectionDiagnostic[];
};
/** Closed own reasons are translated by application rather than displayed as provider errors. */
export type MessagingConnectionActivationReason = "version_conflict" | "owner_changed" | "resource_unavailable" | "credential_not_validated" | "test_mode" | "capability_required" | "diagnostic_required" | "countries_required";

/** @param identity - Server-owned resource, current contributing leader and external security scope. @returns A draft candidate with no selected version or implicitly enabled capability. */
export function createDefaultMessagingConnection(identity: { id: string; tribeId: string; providerId: string; leaderUserId: string; environment: string; securityEpoch: string; createdAt: Date }): TenantMessagingConnection {
  return { ...identity, version: 1, state: MESSAGING_CONNECTION_STATE.draft, stateReason: null, isSelected: false, isCandidate: true, selectedVersion: null, candidateVersion: 1, retiredAt: null, updatedAt: identity.createdAt };
}

/**
 * Matches local diagnostic evidence to the exact prepared capability and inclusive activation window.
 * @param diagnostic - Local confirmation, never a transport receipt.
 * @param connection - Exact current contributing leader and tenant.
 * @param version - Exact immutable configuration version.
 * @param capability - Exact channel/sender/template/language preparation.
 * @param now - Current authoritative time.
 * @returns Whether the local confirmation can support this activation.
 */
function diagnosticMatches(diagnostic: ConnectionDiagnostic, connection: TenantMessagingConnection, version: MessagingConnectionVersion, capability: MessagingConnectionCapability, now: Date): boolean {
  const ageMs = diagnostic.validatedAt ? now.getTime() - diagnostic.validatedAt.getTime() : Number.NaN;
  return diagnostic.outcome === CONNECTION_DIAGNOSTIC_OUTCOME.verified && diagnostic.tribeId === connection.tribeId && diagnostic.connectionId === connection.id && diagnostic.connectionVersion === version.version && diagnostic.leaderUserId === connection.leaderUserId && diagnostic.channel === capability.channel && diagnostic.senderId === capability.senderId && diagnostic.templateId === capability.templateId && diagnostic.templateLanguage === capability.templateLanguage && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS;
}

/**
 * Checks only candidate activation; selected active connections do not require daily re-diagnosis.
 * @param connection - Current candidate metadata under owner locks.
 * @param version - Current exact configuration, credential and prepared capabilities.
 * @param facts - Authoritative current ownership/security/dependencies/usage and local diagnostics.
 * @returns A closed requirement or permission to propose the owner's atomic selected/candidate transition.
 */
export function assessMessagingConnectionActivation(connection: TenantMessagingConnection, version: MessagingConnectionVersion, facts: MessagingConnectionActivationFacts): { allowed: true } | { allowed: false; reason: MessagingConnectionActivationReason } {
  const deny = (reason: MessagingConnectionActivationReason) => ({ allowed: false as const, reason });
  if (facts.expectedVersion !== connection.version) return deny(MESSAGING_CONNECTION_REQUIREMENT.versionConflict);
  if (facts.currentLeaderUserId !== connection.leaderUserId) return deny(MESSAGING_CONNECTION_REQUIREMENT.ownerChanged);
  if (facts.recoveryLocked || connection.retiredAt || version.retiredAt || !connection.isCandidate || connection.state === MESSAGING_CONNECTION_STATE.suspended || connection.state === MESSAGING_CONNECTION_STATE.disconnected || connection.candidateVersion !== version.version || version.connectionId !== connection.id || version.tribeId !== connection.tribeId || connection.environment !== facts.environment || version.environment !== facts.environment || connection.securityEpoch !== facts.securityEpoch || version.securityEpoch !== facts.securityEpoch || !version.secretRef || facts.usagePolicy && facts.usagePolicy.tribeId !== connection.tribeId) return deny(MESSAGING_CONNECTION_REQUIREMENT.resourceUnavailable);
  const credentialValidatedAtMs = version.credential.validatedAt?.getTime();
  if (version.credential.status !== MESSAGING_CREDENTIAL_PUBLIC_STATE.valid || credentialValidatedAtMs === undefined || !Number.isFinite(credentialValidatedAtMs) || credentialValidatedAtMs > facts.now.getTime() || version.credential.isTestMode === null) return deny(MESSAGING_CONNECTION_REQUIREMENT.credentialNotValidated);
  if (version.credential.isTestMode) return deny(MESSAGING_CONNECTION_REQUIREMENT.testMode);
  if (facts.requiredChannels.length === 0) return deny(MESSAGING_CONNECTION_REQUIREMENT.capabilityRequired);
  for (const channel of new Set(facts.requiredChannels)) {
    if (channel !== MESSAGING_PUBLIC_CHANNEL.email && !facts.usagePolicy?.allowedCountries.some((country) => !facts.usagePolicy!.platformRestrictions.some((restriction) => restriction.country === country && restriction.channel === channel && !restriction.allowed))) return deny(MESSAGING_CONNECTION_REQUIREMENT.countriesRequired);
    const senderId = channel === MESSAGING_PUBLIC_CHANNEL.email ? version.configuration.emailSenderId : channel === MESSAGING_PUBLIC_CHANNEL.sms ? version.configuration.smsSenderId : version.configuration.whatsappSenderId;
    const capability = version.capabilities.find((candidate) => candidate.channel === channel && candidate.senderId === senderId && candidate.state === MESSAGING_CAPABILITY_PUBLIC_STATE.prepared && (channel !== MESSAGING_PUBLIC_CHANNEL.whatsapp || Boolean(version.configuration.whatsappTemplateId && version.configuration.whatsappTemplateLanguage) && candidate.templateId === version.configuration.whatsappTemplateId && candidate.templateLanguage === version.configuration.whatsappTemplateLanguage));
    if (!senderId || !capability) return deny(MESSAGING_CONNECTION_REQUIREMENT.capabilityRequired);
    if (!facts.diagnostics.some((diagnostic) => diagnosticMatches(diagnostic, connection, version, capability, facts.now))) return deny(MESSAGING_CONNECTION_REQUIREMENT.diagnosticRequired);
  }
  return { allowed: true };
}

/**
 * Proposes immediate suspension while retaining occupied slots and historical effective versions.
 * @param connection - Current owned lifecycle snapshot.
 * @param reason - Safe owner-selected security cause.
 * @param now - Authoritative transition time.
 * @returns New lifecycle metadata; no secret, policy, counter or selected-version replacement occurs here.
 */
export function suspendMessagingConnection(connection: TenantMessagingConnection, reason: string, now: Date): TenantMessagingConnection {
  if (connection.state === MESSAGING_CONNECTION_STATE.suspended && connection.stateReason === reason || connection.state === MESSAGING_CONNECTION_STATE.disconnected || connection.retiredAt) return connection;
  return { ...connection, state: MESSAGING_CONNECTION_STATE.suspended, stateReason: reason, version: connection.version + 1, updatedAt: now };
}
