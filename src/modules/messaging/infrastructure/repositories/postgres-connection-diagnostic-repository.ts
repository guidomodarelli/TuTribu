/** Confirms a local connection diagnostic and its exact capability in the caller's guarded transaction. @module postgres-connection-diagnostic-repository */
import "server-only";
import { sql } from "drizzle-orm";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_REASON, VERIFICATION_TRANSITION_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-challenge";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { ContactVerificationWriter } from "@/src/modules/academy-admissions/domain/repositories/contact-verification-repository";
import type { VerificationFailureBudget } from "@/src/modules/academy-admissions/domain/repositories/verification-failure-budget";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { CONNECTION_DIAGNOSTIC_OUTCOME, CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME, CONNECTION_DIAGNOSTIC_VERIFY_OPERATION } from "@/src/modules/messaging/constants/connection-diagnostic";
import { VERIFICATION_CAPABILITY_STATE, VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import type { ConnectionDiagnosticVerifier, ConnectionDiagnosticVerificationResult, VerifyConnectionDiagnosticCommand } from "@/src/modules/messaging/domain/repositories/connection-diagnostic-repository";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { authorizeConnectionDiagnostic } from "./postgres-connection-diagnostic-authorizer";
import { readMessagingCandidatePreparationState } from "./postgres-messaging-candidate-preparation";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Consumes only the identity and result fields necessary to confirm the owned diagnostic. */
type DiagnosticRow = { id: string; channel: VerificationChallengeScope["channel"]; sender_id: string; template_id: string | null; template_language: string | null; challenge_id: string; outcome: string };
/** Keeps the consumed contact country in the private envelope/delivery boundary. */
type ChallengeRow = { contact_type: "email" | "phone"; normalized_contact: string; channel: VerificationChallengeScope["channel"]; purpose: string; verification_epoch: number | null; delivery_id: string; failed_attempts: number; state: string; is_current: boolean };

/** Performs no credential decryption, RPC, global verification or admission-proof transition. */
export class PostgresConnectionDiagnosticRepository implements ConnectionDiagnosticVerifier {
  /**
   * @param database - Current guarded transaction shared with the original operation ledger.
   * @param readSecurityConfig - Local external epoch/recovery reader, without an outbound request.
   * @param verification - Shared local-code writer bound to this exact transaction and owner authority.
   * @param failureBudget - The same account limiter used by verification, locked before the challenge.
   */
  constructor(private readonly database: RequestDatabase, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly verification: ContactVerificationWriter, private readonly failureBudget: VerificationFailureBudget) {}

  /**
   * Revalidates current SQL leader/session/recency/resource without reading protected credential bytes.
   * @param command - Exact private resource and operation currently being confirmed.
   * @returns Nothing while scope, authority and all locked time bounds remain live.
   * @throws MessagingSecretAccessError when current authority or external security scope changes.
   */
  private async authorize(command: VerifyConnectionDiagnosticCommand): Promise<void> {
    await authorizeConnectionDiagnostic(this.database, command.context, this.readSecurityConfig);
  }

  /**
   * Consumes the received code once and records evidence exclusively for the exact configured channel/version.
   * @param command - Original ledger claim and current sensitive-leader scope.
   * @returns A safe minimal diagnostic result without code, credential, destination or admission proof.
   * @throws MessagingSecretAccessError after an effective local write if authority changes, forcing rollback.
   */
  async verify(command: VerifyConnectionDiagnosticCommand): Promise<ConnectionDiagnosticVerificationResult> {
    const denied = (code: Extract<ConnectionDiagnosticVerificationResult, { outcome: "denied" }>["code"]): ConnectionDiagnosticVerificationResult => ({ outcome: CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.denied, code });
    await this.authorize(command);
    const context = command.context;
    const operation = (await this.database.execute(sql`select id from public.academy_admission_operations where id=${command.ledgerId} and actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type=${CONNECTION_DIAGNOSTIC_VERIFY_OPERATION} and idempotency_key=${command.operationId} and state=${OPERATION_STATE.started} for share`)).rows[0];
    if (!operation) return denied(MESSAGING_ERROR_CODE.permissionDenied);
    const target = (await this.database.execute<DiagnosticRow>(sql`select id,channel,sender_id,template_id,template_language,challenge_id,outcome from public.messaging_connection_diagnostics where id=${command.diagnosticId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and leader_user_id=${context.actorUserId}`)).rows[0];
    if (!target) return denied(MESSAGING_ERROR_CODE.resourceUnavailable);
    // Lock capability before the diagnostic/challenge, preserving the issuer's resource-to-challenge order.
    const capability = (await this.database.execute<{ id: string; sender_id: string; template_id: string | null; template_language: string | null; state: string; checked_at: string | null }>(sql`select id,sender_id,template_id,template_language,state,checked_at from public.messaging_connection_capabilities where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and channel=${target.channel} for update`)).rows[0];
    const resource = (await this.database.execute<{ email_sender_id: string | null; sms_sender_id: string | null; whatsapp_sender_id: string | null; whatsapp_template_id: string | null; whatsapp_template_language: string | null }>(sql`select email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion} for share`)).rows[0];
    if (!capability || !resource || capability.checked_at === null || capability.sender_id !== target.sender_id || capability.template_id !== target.template_id || capability.template_language !== target.template_language) return denied(MESSAGING_ERROR_CODE.resourceUnavailable);
    const senderId = target.channel === VERIFICATION_EMAIL_CHANNEL ? resource.email_sender_id : target.channel === ADMISSION_PHONE_CHANNEL.sms ? resource.sms_sender_id : resource.whatsapp_sender_id;
    if (senderId !== target.sender_id || target.channel === ADMISSION_PHONE_CHANNEL.whatsapp && (resource.whatsapp_template_id !== target.template_id || resource.whatsapp_template_language !== target.template_language)) return denied(MESSAGING_ERROR_CODE.missingCapability);
    await this.failureBudget.lockAccount(context.actorUserId);
    const challenge = (await this.database.execute<ChallengeRow>(sql`select contact_type,normalized_contact,channel,purpose,verification_epoch,delivery_id,failed_attempts,state,is_current from public.contact_verification_challenges where id=${target.challenge_id} and user_id=${context.actorUserId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and security_epoch=${context.securityEpoch} for update`)).rows[0];
    // Resend also holds challenge before diagnostic, including when it uses another channel's capability.
    const diagnostic = (await this.database.execute<DiagnosticRow>(sql`select id,channel,sender_id,template_id,template_language,challenge_id,outcome from public.messaging_connection_diagnostics where id=${command.diagnosticId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and leader_user_id=${context.actorUserId} for update`)).rows[0];
    if (!diagnostic || diagnostic.outcome !== CONNECTION_DIAGNOSTIC_OUTCOME.pending || diagnostic.channel !== target.channel || diagnostic.challenge_id !== target.challenge_id || diagnostic.sender_id !== capability.sender_id || diagnostic.template_id !== capability.template_id || diagnostic.template_language !== capability.template_language) return denied(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (!challenge || challenge.purpose !== ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic || challenge.verification_epoch !== null || challenge.channel !== diagnostic.channel) return denied(MESSAGING_ERROR_CODE.resourceUnavailable);
    const delivery = (await this.database.execute<{ recipient_country: string | null }>(sql`select recipient_country from public.message_deliveries where id=${challenge.delivery_id} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and source_resource_id=${diagnostic.id} and actor_user_id=${context.actorUserId} and purpose=${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic}`)).rows[0];
    if (!delivery || challenge.contact_type === ADMISSION_CONTACT_TYPE.phone && !delivery.recipient_country) return denied(MESSAGING_ERROR_CODE.resourceUnavailable);
    const scope: VerificationChallengeScope = { userId: context.actorUserId, tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, securityEpoch: context.securityEpoch, purpose: ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic, verificationEpoch: null, channel: diagnostic.channel, contact: challenge.contact_type === ADMISSION_CONTACT_TYPE.email ? { type: ADMISSION_CONTACT_TYPE.email, value: challenge.normalized_contact } : { type: ADMISSION_CONTACT_TYPE.phone, value: challenge.normalized_contact, country: delivery.recipient_country! } };
    await this.authorize(command);
    const verification = await this.verification.validate({ scope, challengeId: diagnostic.challenge_id, operationId: command.ledgerId, code: command.code });
    if (verification.outcome === VERIFICATION_TRANSITION_OUTCOME.denied) {
      const code = verification.reason === VERIFICATION_CHALLENGE_REASON.expired ? MESSAGING_ERROR_CODE.challengeExpired : verification.reason === VERIFICATION_CHALLENGE_REASON.accountRateLimited || verification.reason === VERIFICATION_CHALLENGE_REASON.attemptsExhausted ? MESSAGING_ERROR_CODE.verificationAttemptsExceeded : MESSAGING_ERROR_CODE.challengeInvalidated;
      return denied(code);
    }
    if (verification.outcome === VERIFICATION_TRANSITION_OUTCOME.wrongCode) {
      const failed = (await this.database.execute<{ failed_attempts: number }>(sql`select failed_attempts from public.contact_verification_challenges where id=${diagnostic.challenge_id}`)).rows[0].failed_attempts >= ADMISSION_LIMIT.verificationChallengeFailureCount;
      if (failed) await this.database.execute(sql`update public.messaging_connection_diagnostics set outcome=${CONNECTION_DIAGNOSTIC_OUTCOME.failed} where id=${diagnostic.id}`);
      await this.authorize(command);
      return denied(failed ? MESSAGING_ERROR_CODE.verificationAttemptsExceeded : MESSAGING_ERROR_CODE.verificationCodeIncorrect);
    }
    if (verification.purpose !== ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic || verification.proofId !== null) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.unexpectedFailure);
    const capabilityState = capability.state === VERIFICATION_CAPABILITY_STATE.unavailable ? VERIFICATION_CAPABILITY_STATE.unavailable : VERIFICATION_CAPABILITY_STATE.prepared;
    await this.database.execute(sql`update public.messaging_connection_diagnostics set outcome=${CONNECTION_DIAGNOSTIC_OUTCOME.verified},validated_at=${verification.verifiedAt} where id=${diagnostic.id}`);
    await this.database.execute(sql`update public.messaging_connection_capabilities set state=${capabilityState},tested_at=${verification.verifiedAt} where id=${capability.id}`);
    const candidateState = await readMessagingCandidatePreparationState(this.database, context);
    if (candidateState !== null) await this.database.execute(sql`update public.tenant_messaging_connections set state=${candidateState},version=version+1,updated_at=${verification.verifiedAt} where id=${context.connectionId} and tribe_id=${context.tribeId} and is_candidate and not is_selected and candidate_version=${context.connectionVersion} and state<>${candidateState}`);
    await this.authorize(command);
    return { outcome: CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified, diagnosticId: diagnostic.id, connectionVersion: context.connectionVersion, channel: diagnostic.channel, validatedAt: verification.verifiedAt, capabilityState };
  }
}
