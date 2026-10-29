/**
 * Consumes a current local challenge, failure accounting and proof/envelope effects in one transaction.
 * @module postgres-contact-verification-repository
 */
import "server-only";
import { sql } from "drizzle-orm";
import { isCurrentVerificationActor, readVerificationDatabaseNow } from "./verification-transaction-checks";
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

/** @param reason - Closed safe denial. @returns The denied validation outcome. */
function deniedVerification(reason: Extract<ContactVerificationResult, { outcome: "denied" }>["reason"]): ContactVerificationResult {
  return { outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason };
}

/** Exact scope, challenge and operation identifying one recorded failure. */
type VerificationFailureIdentity = ValidateContactVerificationCommand["scope"] & { challengeId: string; operationId: string };

/** @param row - Locked stored challenge. @param contact - Exact authorized destination. @returns The domain challenge. */
function challengeFromRow(row: ChallengeRow, contact: ContactVerificationChallenge["contact"]): ContactVerificationChallenge {
  return {
    id: row.id, userId: row.user_id, tribeId: row.tribe_id, contact: contact, purpose: row.purpose,
    verificationEpoch: row.verification_epoch, connectionId: row.connection_id, connectionVersion: row.connection_version,
    securityEpoch: row.security_epoch, channel: row.channel, state: row.state, version: row.version,
    createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at), failedAttempts: row.failed_attempts,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null, invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null,
    invalidationReason: row.invalidation_reason, codeMac: row.code_mac, macKeyId: row.mac_key_id, codeEnvelopeId: row.code_envelope_id, deliveryId: row.delivery_id,
  };
}

/** @param row - Locked challenge. @param contact - Authorized destination. @returns Whether the challenge targets exactly that destination. */
function isSameDestination(row: Pick<ChallengeRow, "contact_type" | "normalized_contact">, contact: ValidateContactVerificationCommand["scope"]["contact"]): boolean {
  return row.contact_type === contact.type && row.normalized_contact === contact.value;
}

/** @param config - Live protection. @param resource - Locked connection version. @param row - Locked challenge. @returns Whether recovery locked, the deployment scope differs from the resource or challenge, or the code key is gone. */
function isValidationScopeUnavailable(config: MessagingSecurityConfig, resource: { environment: string; security_epoch: string }, row: Pick<ChallengeRow, "security_epoch" | "mac_key_id">): boolean {
  return config.recoveryLocked || config.environment !== resource.environment || config.securityEpoch !== resource.security_epoch || config.securityEpoch !== row.security_epoch || !config.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(row.mac_key_id);
}

/** @param current - Freshly sampled protection. @param original - Protection used for this validation. @param macKeyId - Key that sealed the code. @returns Whether recovery locked, the deployment scope moved or the code key is gone. */
function macScopeChanged(current: MessagingSecurityConfig, original: MessagingSecurityConfig, macKeyId: string): boolean {
  return current.recoveryLocked || current.securityEpoch !== original.securityEpoch || current.environment !== original.environment || !current.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(macKeyId);
}

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
   * Validates one local code without relying on provider availability, country edits or remaining send quota.
   * @param command - Own authorized scope and operation-ledger-bound validation intent.
   * @returns Minimal stored transition, confirmed when the caller commits; protected material stays private.
   * @throws AdmissionOperationError on conflicting failure identity or an unexpected CAS, forcing rollback.
   */
  async validate(command: ValidateContactVerificationCommand): Promise<ContactVerificationResult> {
    if (!await isCurrentVerificationActor(this.database, this.authorize, command.scope)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    // Fix deployment scope from the authorized immutable version before account/challenge locks.
    const resource = (await this.database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${command.scope.connectionId} and tribe_id=${command.scope.tribeId} and version=${command.scope.connectionVersion} for share`)).rows[0];
    if (!resource) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    await this.failureBudget.lockAccount(command.scope.userId);
    const identity = { ...command.scope, challengeId: command.challengeId, operationId: command.operationId };
    const replayed = await this.replayedFailure(command, identity);
    if (replayed) return replayed;
    const row = (await this.database.execute<ChallengeRow>(sql`select * from public.contact_verification_challenges where id=${command.challengeId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    if (!row) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    if (!isSameDestination(row, command.scope.contact)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const challenge = challengeFromRow(row, command.scope.contact);
    const currentChallengeId = row.is_current ? row.id : null;
    const initial = evaluateContactChallenge({ scope: command.scope, challenge, currentChallengeId, now: await readVerificationDatabaseNow(this.database), accountFailureBudgetAvailable: true });
    if (!initial.allowed) return deniedVerification(initial.reason);
    const codeMac = row.code_mac;
    if (!codeMac) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    // Retain the envelope lock before the final clock so destruction cannot introduce an unaccounted wait.
    await this.lockCodeEnvelope(row);
    const config = await this.readSecurityConfig();
    if (isValidationScopeUnavailable(config, resource, row)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    const beforeCrypto = await readVerificationDatabaseNow(this.database);
    if (!await this.failureBudget.hasCapacity(command.scope.userId, beforeCrypto)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.accountRateLimited);
    const codeMatches = await createVerificationCodeMac(config).verify(command.code, { keyId: row.mac_key_id, mac: codeMac }, { ...challenge, challengeId: row.id });
    const currentConfig = await this.readSecurityConfig();
    if (macScopeChanged(currentConfig, config, row.mac_key_id)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    if (!await isCurrentVerificationActor(this.database, this.authorize, command.scope)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const accountFailureBudgetAvailable=await this.failureBudget.hasCapacity(command.scope.userId,await readVerificationDatabaseNow(this.database));
    const finalConfig=await this.readSecurityConfig();
    if (macScopeChanged(finalConfig, config, row.mac_key_id)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.unavailable);
    if(!await isCurrentVerificationActor(this.database, this.authorize, command.scope))return deniedVerification(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    const now = await readVerificationDatabaseNow(this.database);
    const proposal = proposeContactChallengeValidation({ scope: command.scope, challenge, currentChallengeId, now, accountFailureBudgetAvailable, codeMatches });
    if (proposal.outcome === VERIFICATION_TRANSITION_OUTCOME.denied) return deniedVerification(proposal.reason);
    return this.persistTransition({ row, proposal, now, identity });
  }

  /** @param row - Locked challenge. @returns After locking its code envelope, when it still has one. */
  private async lockCodeEnvelope(row: ChallengeRow): Promise<void> {
    if (row.code_envelope_id) await this.database.execute(sql`select id from public.verification_code_envelopes where id=${row.code_envelope_id} and challenge_id=${row.id} for update`);
  }

  /** @param command - Original validation intent. @param identity - Exact failure identity. @returns The recorded wrong-code outcome on replay, or `null` for a new attempt. @throws AdmissionOperationError when the identity conflicts with a recorded failure. */
  private async replayedFailure(command: ValidateContactVerificationCommand, identity: VerificationFailureIdentity): Promise<ContactVerificationResult | null> {
    const replay = await this.failureBudget.readRecordedFailure(identity);
    if (replay === VERIFICATION_FAILURE_REPLAY_STATE.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
    if (replay !== VERIFICATION_FAILURE_REPLAY_STATE.recorded) return null;
    if (!await isCurrentVerificationActor(this.database, this.authorize, command.scope)) return deniedVerification(VERIFICATION_CHALLENGE_REASON.scopeMismatch);
    return { outcome: VERIFICATION_TRANSITION_OUTCOME.wrongCode };
  }

  /**
   * Stages the proposed transition, its failure accounting, envelope destruction and the admission proof.
   * @param transition - Locked challenge row, its non-denied proposal, the final clock and the failure identity.
   * @returns The wrong-code or verified outcome.
   * @throws AdmissionOperationError on a conflicting failure identity or an unexpected CAS.
   */
  private async persistTransition({ row, proposal, now, identity }: { row: ChallengeRow; proposal: Exclude<ReturnType<typeof proposeContactChallengeValidation>, { outcome: typeof VERIFICATION_TRANSITION_OUTCOME.denied }>; now: Date; identity: VerificationFailureIdentity }): Promise<ContactVerificationResult> {
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
