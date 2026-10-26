/** Reads selected, tested messaging readiness inside the policy owner's original transaction. @module postgres-admission-verification-readiness-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionVerificationReadinessReader, AdmissionVerificationResourceScope, AdmissionVerificationReadiness } from "../../domain/repositories/admission-verification-readiness-reader";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { VERIFICATION_CAPABILITY_STATE, VERIFICATION_CREDENTIAL_STATUS, VERIFICATION_EMAIL_CHANNEL } from "../../constants/verification-delivery";
import { MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { MESSAGING_PUBLIC_CHANNEL } from "../../constants/messaging-public-contract";

type CapabilityRow = { channel: "email" | "sms" | "whatsapp"; sender_id: string; template_id: string | null; template_language: string | null; state: string; checked_at: Date | null; tested_at: Date | null };
type ResourceRow = { environment: string; security_epoch: string; secret_ref: string | null; credential_validation_status: string; is_test_mode: boolean | null; email_sender_id: string | null; sms_sender_id: string | null; whatsapp_sender_id: string | null; whatsapp_template_id: string | null; whatsapp_template_language: string | null };

/** The caller locks tribe first, then keeps all owner locks until its current decision commits. */
export class PostgresAdmissionVerificationReadinessReader implements AdmissionVerificationReadinessReader {
  /** @param database - The original guarded policy transaction. @param authorize - Mandatory current scope/leader/session check. @param readSecurityConfig - Live local security scope and key availability; no SecretStore/RPC. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase, tribeId: string) => Promise<boolean>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** Checks fixed owner permission before reading readiness, rather than using a resource snapshot as permission. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /** @param scope - Exact selected version and configured main/alternate channels. @returns Closed readiness when any actual resource or tested capability is missing. */
  async read(scope: AdmissionVerificationResourceScope): Promise<AdmissionVerificationReadiness> {
    await this.assertAuthorized(scope.tribeId);
    const usage = (await this.database.execute<{ verification_daily_limit: number; platform_verification_daily_maximum: number }>(sql`select verification_daily_limit,platform_verification_daily_maximum from public.messaging_usage_policies where tribe_id=${scope.tribeId} for share`)).rows[0];
    const closed: AdmissionVerificationReadiness = { channelPrepared: false, smsAlternativePrepared: false, verificationQuotaPositive: Boolean(usage && usage.verification_daily_limit > 0 && usage.platform_verification_daily_maximum > 0) };
    if (scope.connectionId === null || scope.connectionVersion === null) { await this.assertAuthorized(scope.tribeId); return closed; }
    const connection = (await this.database.execute<{ contributed_by_user_id: string | null; state: string }>(sql`select contributed_by_user_id,state from public.tenant_messaging_connections where id=${scope.connectionId} and tribe_id=${scope.tribeId} and is_selected and selected_version=${scope.connectionVersion} and retired_at is null for share`)).rows[0];
    if (!connection || connection.state !== MESSAGING_CONNECTION_STATE.active && connection.state !== MESSAGING_CONNECTION_STATE.degraded) { await this.assertAuthorized(scope.tribeId); return closed; }
    const leader = (await this.database.execute(sql`select id from public.tribe_members where tribe_id=${scope.tribeId} and user_id=${connection.contributed_by_user_id} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} for share`)).rows[0];
    const resource = (await this.database.execute<ResourceRow>(sql`select environment,security_epoch,secret_ref,credential_validation_status,is_test_mode,email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language from public.messaging_connection_versions where connection_id=${scope.connectionId} and tribe_id=${scope.tribeId} and version=${scope.connectionVersion} and retired_at is null for share`)).rows[0];
    if (!leader || !resource || resource.secret_ref === null || resource.credential_validation_status !== VERIFICATION_CREDENTIAL_STATUS.valid || resource.is_test_mode !== false) { await this.assertAuthorized(scope.tribeId); return closed; }
    const credential = (await this.database.execute<{ key_id: string }>(sql`select key_id from public.messaging_secret_envelopes where secret_ref=${resource.secret_ref} and tribe_id=${scope.tribeId} and connection_id=${scope.connectionId} and connection_version=${scope.connectionVersion} and environment=${resource.environment} and security_epoch=${resource.security_epoch} and retired_at is null for share`)).rows[0];
    const capabilities = (await this.database.execute<CapabilityRow>(sql`select channel,sender_id,template_id,template_language,state,checked_at,tested_at from public.messaging_connection_capabilities where connection_id=${scope.connectionId} and tribe_id=${scope.tribeId} and connection_version=${scope.connectionVersion} order by channel for share`)).rows;
    const current = await this.readSecurityConfig();
    await this.assertAuthorized(scope.tribeId);
    if (!credential || current.recoveryLocked || current.environment !== resource.environment || current.securityEpoch !== resource.security_epoch || !current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(credential.key_id)) return closed;
    const prepared = (channel: AdmissionVerificationResourceScope["channel"]): boolean => {
      const capability = capabilities.find((candidate) => candidate.channel === channel);
      const senderId = channel === VERIFICATION_EMAIL_CHANNEL ? resource.email_sender_id : channel === MESSAGING_PUBLIC_CHANNEL.sms ? resource.sms_sender_id : resource.whatsapp_sender_id;
      return Boolean(capability && senderId && capability.sender_id === senderId && capability.state === VERIFICATION_CAPABILITY_STATE.prepared && capability.checked_at && capability.tested_at
        && (channel !== MESSAGING_PUBLIC_CHANNEL.whatsapp || resource.whatsapp_template_id && resource.whatsapp_template_language && capability.template_id === resource.whatsapp_template_id && capability.template_language === resource.whatsapp_template_language));
    };
    return { ...closed, channelPrepared: prepared(scope.channel), smsAlternativePrepared: scope.requiresSmsAlternative && prepared(MESSAGING_PUBLIC_CHANNEL.sms), securityScope: { environment: resource.environment, securityEpoch: resource.security_epoch, credentialKeyId: credential.key_id } };
  }
}
