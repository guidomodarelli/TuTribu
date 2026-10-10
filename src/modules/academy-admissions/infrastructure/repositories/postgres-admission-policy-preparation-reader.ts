/** Composes native tenant settings with transaction-bound preflight and current messaging owners. @module postgres-admission-policy-preparation-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";
import type { AdmissionPolicyPreparationReader } from "../../domain/repositories/admission-policy-management";
import type { AdmissionActivationPreflightReader } from "../../domain/repositories/admission-activation-preflight-reader";
import type { MessagingUsagePolicyReader } from "../../domain/repositories/messaging-usage-policy-reader";
import type { AdmissionVerificationReadinessReader } from "@/src/modules/messaging/domain/repositories/admission-verification-readiness-reader";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_PHONE_CHANNEL } from "../../constants/admission-policy";
import { VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Every collaborator is explicitly bound by the composition root to the same current SQL transaction. */
export class PostgresAdmissionPolicyPreparationReader implements AdmissionPolicyPreparationReader {
  /** @param database - Original locked policy transaction. @param preflight - Authoritative cutover owner, with no optimistic default. @param usage - Sole country-list owner. @param readiness - Exact selected tested capability owner. @param readSecurityConfig - Live recovery state and local scope. */
  constructor(private readonly database: RequestDatabase, private readonly preflight: AdmissionActivationPreflightReader, private readonly usage: MessagingUsagePolicyReader, private readonly readiness: AdmissionVerificationReadinessReader, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param policy - Proposed own configuration. @returns Current facts without changing policy/settings, retrieving credentials or sending messages. */
  async read(policy: AdmissionPolicy) {
    const settings = (await this.database.execute<{ access_model: string; admission_enabled: boolean }>(sql`select access_model,admission_enabled from public.tribe_academy_settings where tribe_id=${policy.tribeId} for share`)).rows[0];
    const tribe = (await this.database.execute<{ activated: boolean }>(sql`select admissions_control_activated_at is not null as activated from public.tribes where id=${policy.tribeId}`)).rows[0];
    const preflightComplete = await this.preflight.isPrepared(policy.tribeId);
    const usagePolicy = await this.usage.readForTribe(policy.tribeId);
    const channel = policy.contactType === ADMISSION_CONTACT_TYPE.email ? VERIFICATION_EMAIL_CHANNEL : policy.phoneChannel ?? ADMISSION_PHONE_CHANNEL.sms;
    const readiness = await this.readiness.read({ tribeId: policy.tribeId, connectionId: policy.messagingConnectionId, connectionVersion: policy.messagingConnectionVersion, channel, requiresSmsAlternative: policy.allowSmsAlternative });
    const current = await this.readSecurityConfig();
    const securityScope = readiness.securityScope;
    const securityCurrent = Boolean(securityScope && !current.recoveryLocked && current.environment === securityScope.environment && current.securityEpoch === securityScope.securityEpoch && current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(securityScope.credentialKeyId));
    return { tribeId: policy.tribeId, isAcademy: settings?.access_model === TRIBE_ACCESS_MODEL.academy, controlActivated: Boolean(tribe?.activated), preflightComplete, evaluatorEnabled: Boolean(settings?.admission_enabled), recoveryLocked: current.recoveryLocked,
      configuration: { tribeId: policy.tribeId, channelPrepared: readiness.channelPrepared && securityCurrent, smsAlternativePrepared: readiness.smsAlternativePrepared && securityCurrent, verificationQuotaPositive: readiness.verificationQuotaPositive, usagePolicy, lockedContactType: policy.activatedAt ? policy.contactType : null } };
  }
}
