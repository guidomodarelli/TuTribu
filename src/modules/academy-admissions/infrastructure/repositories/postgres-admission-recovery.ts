/** Closes and invalidates admission-owned restored evidence in the private caller's transaction. @module postgres-admission-recovery */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingRecoveryAdmissionEffects, MessagingRecoveryCommand } from "@/src/modules/messaging/domain/repositories/messaging-recovery";
import { MESSAGING_RECOVERY } from "@/src/modules/messaging/constants/messaging-recovery";
import { ADMISSION_PROOF_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { VERIFICATION_CHALLENGE_STATE } from "../../constants/verification-challenge";
import { VERIFICATION_DIAGNOSTIC_OUTCOME } from "@/src/modules/messaging/constants/verification-delivery";
import { readAdmissionPolicy } from "./postgres-admission-policy-storage";
import { createAdmissionRecoveryPolicyAuditEvent } from "../../domain/entities/admission-audit-event";
import { PostgresAdmissionAuditRepository } from "./postgres-admission-audit-repository";
import { appendAdmissionProofInvalidationAudit, type InvalidatedAdmissionProofAuditRow } from "./postgres-admission-proof-invalidation-audit";

/** Does not reopen policy, write memberships, reissue proofs or reset accounting/deadlines. */
export class PostgresAdmissionRecovery implements MessagingRecoveryAdmissionEffects {
  /** @param database - Exact private transaction after its native namespace/tribe recovery fence. */
  constructor(private readonly database: RequestDatabase) {}

  /** @param command - Current replacement epoch from the external operator. @returns Remaining closure or old evidence, including rows omitted from a previous bounded batch. */
  async hasWork(command: MessagingRecoveryCommand): Promise<boolean> {
    return (await this.database.execute<{ remaining: boolean }>(sql`select (
      exists(select 1 from public.academy_admission_policies where tribe_id=${command.tribeId} and is_open)
      or exists(select 1 from public.academy_admission_verification_proofs proof join public.tenant_messaging_connections connection on connection.id=proof.connection_id and connection.tribe_id=proof.tribe_id where proof.tribe_id=${command.tribeId} and connection.environment=${command.environment} and proof.security_epoch<>${command.securityEpoch} and (proof.status=${ADMISSION_PROOF_STATUS.available} or proof.status=${ADMISSION_PROOF_STATUS.applied} and exists(select 1 from public.academy_admission_requests request where request.id=proof.applied_request_id and request.tribe_id=proof.tribe_id and request.status=${ADMISSION_REQUEST_STATUS.pending})))
      or exists(select 1 from public.contact_verification_challenges challenge join public.tenant_messaging_connections connection on connection.id=challenge.connection_id and connection.tribe_id=challenge.tribe_id where challenge.tribe_id=${command.tribeId} and connection.environment=${command.environment} and challenge.security_epoch<>${command.securityEpoch} and (challenge.is_current or challenge.code_mac is not null or challenge.code_envelope_id is not null))
    ) as remaining`)).rows[0].remaining;
  }

  /** @param command - Exact currently fenced tribe and per-family limit. @returns Only staged counts; no new admission or expiry extension occurs. */
  async reconcile(command: MessagingRecoveryCommand) {
    const previousPolicy = await readAdmissionPolicy(this.database, command.tribeId, true);
    const now = new Date((await this.database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    let policyClosed = false;
    if (previousPolicy?.isOpen) {
      await this.database.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1,changed_by_user_id=null,updated_at=${now} where tribe_id=${command.tribeId} and version=${previousPolicy.version}`);
      const policy = await readAdmissionPolicy(this.database, command.tribeId, true);
      if (!policy) throw new Error("Admission recovery policy disappeared under its native tribe fence");
      await new PostgresAdmissionAuditRepository(this.database).append(createAdmissionRecoveryPolicyAuditEvent({ tribeId: command.tribeId, previousPolicy, policy, createdAt: now }));
      policyClosed = true;
    }
    const proofs = (await this.database.execute<{ id: string; challenge_id: string; status: "available" | "applied"; channel: "email" | "sms" | "whatsapp"; applied_request_id: string | null }>(sql`select proof.id,proof.challenge_id,proof.status,proof.applied_request_id,challenge.channel from public.academy_admission_verification_proofs proof join public.contact_verification_challenges challenge on challenge.id=proof.challenge_id and challenge.tribe_id=proof.tribe_id join public.tenant_messaging_connections connection on connection.id=proof.connection_id and connection.tribe_id=proof.tribe_id where proof.tribe_id=${command.tribeId} and connection.environment=${command.environment} and proof.security_epoch<>${command.securityEpoch} and (proof.status=${ADMISSION_PROOF_STATUS.available} or proof.status=${ADMISSION_PROOF_STATUS.applied} and exists(select 1 from public.academy_admission_requests request where request.id=proof.applied_request_id and request.tribe_id=proof.tribe_id and request.status=${ADMISSION_REQUEST_STATUS.pending})) order by proof.id limit ${command.limit}`)).rows;
    const challenges = await this.challengePage(command);
    const challengeIds = [...new Set([...proofs.map((proof) => proof.challenge_id), ...challenges.map((challenge) => challenge.id)])];
    if (challengeIds.length) await this.database.execute(sql`select delivery.id from public.message_deliveries delivery join public.contact_verification_challenges challenge on challenge.delivery_id=delivery.id and challenge.tribe_id=delivery.tribe_id where challenge.id=any(${sql.param(challengeIds)}::uuid[]) and delivery.tribe_id=${command.tribeId} order by delivery.id for update of delivery`);
    // All ordinary admission owners take the same exclusive tribe fence. Preserve delivery/request/proof ordering.
    const requestIds = [...new Set(proofs.flatMap((proof) => proof.applied_request_id ? [proof.applied_request_id] : []))].sort();
    for (const requestId of requestIds) await this.database.execute(sql`select id from public.academy_admission_requests where id=${requestId} and tribe_id=${command.tribeId} for update`);
    const changedProofs: InvalidatedAdmissionProofAuditRow[] = [];
    for (const proof of proofs) changedProofs.push(...(await this.database.execute<InvalidatedAdmissionProofAuditRow>(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${MESSAGING_RECOVERY.cause} where id=${proof.id} and tribe_id=${command.tribeId} and status=${proof.status} returning id,challenge_id,verification_epoch,applied_request_id,invalidated_at`)).rows);
    await appendAdmissionProofInvalidationAudit(this.database, { tribeId: command.tribeId, actorUserId: null, operationId: null, cause: MESSAGING_RECOVERY.cause }, changedProofs, new Map(proofs.map((proof) => [proof.challenge_id, proof.channel])), new Map(proofs.map((proof) => [proof.id, proof.status])));
    for (const challenge of challenges) {
      // Keep an uncertain attempt's envelope/history under its original TTL; never open or extend it.
      await this.database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${MESSAGING_RECOVERY.cause}),code_mac=null,code_envelope_id=null where id=${challenge.id} and tribe_id=${command.tribeId}`);
      await this.database.execute(sql`update public.messaging_connection_diagnostics set outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.invalidated} where challenge_id=${challenge.id} and outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.pending}`);
    }
    return { policyClosed, proofsInvalidated: changedProofs.length, challengesInvalidated: challenges.length };
  }

  /** @param command - Current exact scope and bounded page. @returns Only candidate IDs; every delivery is locked in canonical order before challenge updates. */
  private async challengePage(command: MessagingRecoveryCommand) {
    return (await this.database.execute<{ id: string }>(sql`select challenge.id from public.contact_verification_challenges challenge join public.tenant_messaging_connections connection on connection.id=challenge.connection_id and connection.tribe_id=challenge.tribe_id where challenge.tribe_id=${command.tribeId} and connection.environment=${command.environment} and challenge.security_epoch<>${command.securityEpoch} and (challenge.is_current or challenge.code_mac is not null or challenge.code_envelope_id is not null) order by challenge.id limit ${command.limit}`)).rows;
  }
}
