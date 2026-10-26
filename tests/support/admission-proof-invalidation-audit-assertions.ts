/** Verifies stored proof facts through native SQL without observing query construction. @module admission-proof-invalidation-audit-assertions */
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT } from "@/src/modules/academy-admissions/constants/admission-proof";

/** Describes the independently expected prior proof identity and state. */
type ExpectedProofInvalidation = {
  proofId: string; challengeId: string; fromState: "available" | "applied";
  requestId: string | null; verificationEpoch: number; channel: "email" | "sms" | "whatsapp";
};
/** Binds expected effects to the original action rather than another operation. */
type ExpectedProofInvalidationAuditScope = {
  tribeId: string; actorUserId: string; operationId: string; cause: string;
  proofs: readonly ExpectedProofInvalidation[];
};

/**
 * Checks exact selected metadata, original actor/ledger and the actual persisted effect clock.
 * @param transaction - Existing protected native test transaction.
 * @param expected - Independent fixture facts and the original operation identity.
 * @returns After comparing all invalidation records in the tribe, including duplicate detection.
 */
export async function expectAdmissionProofInvalidationAudits(transaction: RequestDatabase, expected: ExpectedProofInvalidationAuditScope): Promise<void> {
  const actual = (await transaction.execute(sql`select event.resource_id,event.actor_user_id,event.resource_version,event.rule,event.cause,event.metadata,event.created_at=proof.invalidated_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.academy_admission_verification_proofs proof on proof.id=event.resource_id and proof.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${expected.tribeId} and event.event_type=${ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT} order by event.resource_id`)).rows;
  const events = expected.proofs.map((proof) => ({
    resource_id: proof.proofId, actor_user_id: expected.actorUserId, resource_version: null,
    rule: expected.cause, cause: expected.cause, owner_clock: true, idempotency_key: expected.operationId,
    metadata: { fromState: proof.fromState, toState: "invalid", challengeId: proof.challengeId,
      requestId: proof.requestId, verificationEpoch: proof.verificationEpoch, channel: proof.channel },
  })).sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  expect(actual).toEqual(events);
}
