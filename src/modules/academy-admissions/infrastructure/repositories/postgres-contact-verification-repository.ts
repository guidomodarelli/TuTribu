/**
 * Consumes a current local challenge, failure accounting and proof/envelope effects in one transaction.
 * @module postgres-contact-verification-repository
 */
import "server-only";
import { sql } from "drizzle-orm";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_REASON, VERIFICATION_FAILURE_REPLAY_STATE, VERIFICATION_TRANSITION_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { ContactVerificationChallenge, VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { VerificationFailureBudget } from "@/src/modules/academy-admissions/domain/repositories/verification-failure-budget";
import type { ContactVerificationWriter, ContactVerificationResult, ValidateContactVerificationCommand } from "@/src/modules/academy-admissions/domain/repositories/contact-verification-repository";
import { evaluateContactChallenge, proposeContactChallengeValidation } from "@/src/modules/academy-admissions/domain/policies/verification-challenge-policy";
import { createVerificationCodeMac } from "@/src/modules/academy-admissions/infrastructure/verification/verification-code-mac";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Consumes only owned SQL fields; PostgreSQL rows are not passed through provider/input schemas. */
type ChallengeRow = {
  id: string; user_id: string; tribe_id: string; contact_type: string; normalized_contact: string;
  purpose: VerificationChallengeScope["purpose"]; verification_epoch: number | null;
  connection_id: string; connection_version: number; security_epoch: string; channel: VerificationChallengeScope["channel"];
  state: ContactVerificationChallenge["state"]; version: number; is_current: boolean; created_at: string; expires_at: string;
  failed_attempts: number; verified_at: string | null; invalidated_at: string | null; invalidation_reason: string | null;
  code_mac: Uint8Array | null; mac_key_id: string; code_envelope_id: string | null; delivery_id: string;
};

/**
 * Owns local consumption only; the caller owns issuance, ledger recovery and any diagnostic result transition.
 * No SDK, HTTP call, new checkout or credential read occurs while its locks are held.
 */
export class PostgresContactVerificationRepository implements ContactVerificationWriter {
  /**
   * @param database - Existing guarded transaction; the caller must roll back unexpected failures.
   * @param authorize - Mandatory owner reader that locks current tribe/policy/account/session/resource in shared order.
   * @param readSecurityConfig - Local hosting-secret snapshot; it must never perform an outbound request.
   * @param failureBudget - Account-wide limiter bound to this exact transaction.
   */
  constructor(
    private readonly database: RequestDatabase,
    private readonly authorize: (database: RequestDatabase, scope: VerificationChallengeScope) => Promise<boolean>,
    private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>,
    private readonly failureBudget: VerificationFailureBudget,
  ) {}

  /**
   * Checks the actual SQL actor and owner scope; an input userId is never authority.
   * @param scope - Own scope to revalidate against the caller's current locked context.
   * @returns Whether the actual actor still has the required owner authorization.
   */
  private async isAuthorized(scope: VerificationChallengeScope): Promise<boolean> {
    const actor = (await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    return actor === scope.userId && await this.authorize(this.database, scope);
  }

  /**
   * Samples the database clock after lock waits and asynchronous local cryptography.
   * @returns The current database timestamp, without relying on a browser or process clock.
   */
  private async now(): Promise<Date> {
    return new Date((await this.database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
  }

  /**
   * Validates one local code without relying on provider availability, country edits or remaining send quota.
   * @param command - Own authorized scope and operation-ledger-bound validation intent.
   * @returns Minimal stored transition, confirmed when the caller commits; protected material stays private.
   * @throws AdmissionOperationError on conflicting failure identity or an unexpected CAS, forcing rollback.
   */
  async validate(command: ValidateContactVerificationCommand): Promise<ContactVerificationResult> {
    const denied = (reason: Extract<ContactVerificationResult, { outcome: "denied" }>["reason"]): ContactVerificationResult => ({ outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason });
    if (!await this.isAuthorized(command.scope)) return denied(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    // Fix deployment scope from the authorized immutable version before account/challenge locks.
    const resource = (await this.database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${command.scope.connectionId} and tribe_id=${command.scope.tribeId} and version=${command.scope.connectionVersion} for share`)).rows[0];
    if (!resource) return denied(VERIFICATION_CHALLENGE_REASON.unavailable);
    await this.failureBudget.lockAccount(command.scope.userId);
    const identity = { ...command.scope, challengeId: command.challengeId, operationId: command.operationId };
    const replay = await this.failureBudget.readRecordedFailure(identity);
    if (replay === VERIFICATION_FAILURE_REPLAY_STATE.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
    if (replay === VERIFICATION_FAILURE_REPLAY_STATE.recorded) {
      if (!await this.isAuthorized(command.scope)) return denied(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
      return { outcome: VERIFICATION_TRANSITION_OUTCOME.wrongCode };
    }
    const row = (await this.database.execute<ChallengeRow>(sql`select * from public.contact_verification_challenges where id=${command.challengeId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    if (!row) return denied(VERIFICATION_CHALLENGE_REASON.unavailable);
    if (row.contact_type !== command.scope.contact.type || row.normalized_contact !== command.scope.contact.value) return denied(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const challenge: ContactVerificationChallenge = {
      id: row.id, userId: row.user_id, tribeId: row.tribe_id, contact: command.scope.contact, purpose: row.purpose,
      verificationEpoch: row.verification_epoch, connectionId: row.connection_id, connectionVersion: row.connection_version,
      securityEpoch: row.security_epoch, channel: row.channel, state: row.state, version: row.version,
      createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at), failedAttempts: row.failed_attempts,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null, invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null,
      invalidationReason: row.invalidation_reason, codeMac: row.code_mac, macKeyId: row.mac_key_id, codeEnvelopeId: row.code_envelope_id, deliveryId: row.delivery_id,
    };
    const currentChallengeId = row.is_current ? row.id : null;
    const initial = evaluateContactChallenge({ scope: command.scope, challenge, currentChallengeId, now: await this.now(), accountFailureBudgetAvailable: true });
    if (!initial.allowed) return denied(initial.reason);
    // Retain the envelope lock before the final clock so destruction cannot introduce an unaccounted wait.
    if (row.code_envelope_id) await this.database.execute(sql`select id from public.verification_code_envelopes where id=${row.code_envelope_id} and challenge_id=${row.id} for update`);
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked || config.environment !== resource.environment || config.securityEpoch !== resource.security_epoch || config.securityEpoch !== row.security_epoch || !config.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(row.mac_key_id)) return denied(VERIFICATION_CHALLENGE_REASON.unavailable);
    const beforeCrypto = await this.now();
    if (!await this.failureBudget.hasCapacity(command.scope.userId, beforeCrypto)) return denied(VERIFICATION_CHALLENGE_REASON.accountRateLimited);
    const codeMatches = await createVerificationCodeMac(config).verify(command.code, { keyId: row.mac_key_id, mac: row.code_mac! }, { ...challenge, challengeId: row.id });
    const currentConfig = await this.readSecurityConfig();
    if (currentConfig.recoveryLocked || currentConfig.securityEpoch !== config.securityEpoch || currentConfig.environment !== config.environment || !currentConfig.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(row.mac_key_id)) return denied(VERIFICATION_CHALLENGE_REASON.unavailable);
    if (!await this.isAuthorized(command.scope)) return denied(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const accountFailureBudgetAvailable=await this.failureBudget.hasCapacity(command.scope.userId,await this.now());
    const finalConfig=await this.readSecurityConfig();
    if(finalConfig.recoveryLocked||finalConfig.securityEpoch!==config.securityEpoch||finalConfig.environment!==config.environment||!finalConfig.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(row.mac_key_id))return denied(VERIFICATION_CHALLENGE_REASON.unavailable);
    if(!await this.isAuthorized(command.scope))return denied(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const now = await this.now();
    const proposal = proposeContactChallengeValidation({ scope: command.scope, challenge, currentChallengeId, now, accountFailureBudgetAvailable, codeMatches });
    if (proposal.outcome === VERIFICATION_TRANSITION_OUTCOME.denied) return denied(proposal.reason);
    if (proposal.outcome === VERIFICATION_TRANSITION_OUTCOME.wrongCode && !await this.failureBudget.recordFailure(identity, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
    const next = proposal.challenge;
    const updated = await this.database.execute(sql`update public.contact_verification_challenges set state=${next.state},version=${next.version},failed_attempts=${next.failedAttempts},verified_at=${next.verifiedAt},invalidated_at=${next.invalidatedAt},invalidation_reason=${next.invalidationReason},code_mac=${next.codeMac ? Buffer.from(next.codeMac) : null},code_envelope_id=${next.codeEnvelopeId} where id=${row.id} and version=${row.version} and expires_at>clock_timestamp() returning id`);
    if (updated.rows.length !== 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    if (row.code_envelope_id && next.codeEnvelopeId === null) await this.database.execute(sql`delete from public.verification_code_envelopes where id=${row.code_envelope_id} and challenge_id=${row.id}`);
    if (proposal.outcome === VERIFICATION_TRANSITION_OUTCOME.wrongCode) return { outcome: VERIFICATION_TRANSITION_OUTCOME.wrongCode };
    let proofId: string | null = null;
    if (row.purpose === ADMISSION_VERIFICATION_PURPOSE.admission) {
      proofId = (await this.database.execute<{ id: string }>(sql`insert into public.academy_admission_verification_proofs(challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before) values (${row.id},${row.user_id},${row.tribe_id},${row.contact_type},${row.normalized_contact},${row.verification_epoch},${row.connection_id},${row.connection_version},${row.security_epoch},${now},${new Date(now.getTime() + ADMISSION_LIMIT.verificationProofFreshnessMs)}) returning id`)).rows[0].id;
    }
    return { outcome: VERIFICATION_TRANSITION_OUTCOME.verified, purpose: row.purpose, proofId, verifiedAt: now };
  }
}
