/** Exercises the fixed thousand-account sample through the original real use cases and commits. */
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { ADMISSION_SAMPLE } from "./constants/admission-sample";
import { runAdmissionPerformanceWorkload, type AdmissionPerformanceDatabase, type AdmissionPerformanceFixture } from "./run-admission-performance-workload";
import type { AdmissionPerformanceParticipant } from "./admission-performance-fixture";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { GOOGLE_IDENTITY_PROVIDER, GOOGLE_EMAIL_AUTHORITY } from "@/src/modules/auth/constants/google-identity-evidence";

/**
 * Preserves SC-021's exact identities and results; batching has no latency acceptance meaning.
 * @param database - Native guarded execution on its owned branch.
 * @param fixture - The activated list academy and private nonextractable test keys.
 * @param participants - One thousand distinct prepared accounts with valid required evidence.
 * @returns Counts from every command and the final native stock, without contact or session identifiers.
 */
export async function runAdmissionSample(database: AdmissionPerformanceDatabase, fixture: AdmissionPerformanceFixture, participants: readonly AdmissionPerformanceParticipant[]) {
  if (participants.length !== ADMISSION_SAMPLE.participantCount || new Set(participants.map((participant) => participant.userId)).size !== participants.length || new Set(participants.map((participant) => participant.sessionId)).size !== participants.length) throw new Error("AdmissionSample.run failed: sample_identity_set_invalid");
  const startedAt = performance.now();
  const prepared = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ accounts: number; validEvidence: number; enabledContacts: number; unlistedContacts: number; existingMembers: number }>(sql`with sample(user_id,session_id) as (values ${sql.join(participants.map((participant) => sql`(${participant.userId}::text,${participant.sessionId}::text)`), sql`, `)}),facts as (
    select sample.user_id,
      exists(select 1 from public.academy_allowlist_entries entry where entry.tribe_id=${fixture.tribeId} and entry.contact_type=${ADMISSION_CONTACT_TYPE.email} and entry.normalized_contact=lower(btrim(account_user.email)) and entry.status=${ALLOWLIST_ENTRY_STATUS.enabled}) as enabled,
      exists(select 1 from public.session current_session
        join public.global_session_identity_bindings binding on binding.session_id=current_session.id and binding.user_id=sample.user_id and binding.invalidated_at is null and binding.normalized_email=lower(btrim(account_user.email))
        join public.account linked on linked.id=binding.account_id and linked."userId"=sample.user_id and linked."providerId"=${GOOGLE_IDENTITY_PROVIDER} and linked."accountId"=binding.provider_subject
        join public.global_identity_evidence evidence on evidence.user_id=sample.user_id and evidence.account_id=linked.id and evidence.provider_subject=linked."accountId" and evidence.normalized_email=lower(btrim(account_user.email)) and evidence.classification=${GOOGLE_EMAIL_AUTHORITY.workspace} and evidence.invalidated_at is null
        where current_session.id=sample.session_id and current_session."userId"=sample.user_id and current_session."expiresAt">clock_timestamp()) as valid_evidence,
      exists(select 1 from public.tribe_members member where member.tribe_id=${fixture.tribeId} and member.user_id=sample.user_id) as existing_member
    from sample join public."user" account_user on account_user.id=sample.user_id
  ) select count(*)::int as accounts,count(*) filter(where valid_evidence)::int as "validEvidence",count(*) filter(where enabled)::int as "enabledContacts",count(*) filter(where not enabled)::int as "unlistedContacts",count(*) filter(where existing_member)::int as "existingMembers" from facts`)).rows[0]);
  if (prepared.accounts !== ADMISSION_SAMPLE.participantCount || prepared.validEvidence !== prepared.accounts || prepared.enabledContacts !== ADMISSION_SAMPLE.enabledParticipantCount || prepared.unlistedContacts !== prepared.accounts - prepared.enabledContacts || prepared.existingMembers !== 0) throw new Error("AdmissionSample.prepare failed: required_evidence_or_allowlist_mismatch");
  const batches: Awaited<ReturnType<typeof runAdmissionPerformanceWorkload>>[] = [];
  for (let offset = 0; offset < participants.length; offset += ADMISSION_SAMPLE.batchSize) {
    batches.push(await runAdmissionPerformanceWorkload(database, fixture, participants.slice(offset, offset + ADMISSION_SAMPLE.batchSize), undefined, ADMISSION_SAMPLE.enabledParticipantCount));
  }
  const last = batches.at(-1)!;
  return {
    kind: ADMISSION_SAMPLE.kind, participants: prepared.accounts, enabledContacts: prepared.enabledContacts, unlistedContacts: prepared.unlistedContacts, prepared,
    admitted: batches.reduce((total, batch) => total + batch.admitted, 0), pending: batches.reduce((total, batch) => total + batch.pending, 0),
    batchSize: ADMISSION_SAMPLE.batchSize, batchCount: batches.length,
    failures: batches.flatMap((batch) => batch.failures),
    batches: batches.map((batch) => ({ participants: batch.participants, admitted: batch.admitted, pending: batch.pending, failures: batch.failures.length })),
    facts: last.facts,
    pool: { acquisitions: batches.reduce((total, batch) => total + batch.pool.acquisitions, 0), releases: batches.reduce((total, batch) => total + batch.pool.releases, 0), errorReleases: batches.reduce((total, batch) => total + batch.pool.errorReleases, 0), peakWaitingCount: Math.max(...batches.map((batch) => batch.pool.peakWaitingCount)), waitingAfter: last.pool.waitingAfter, checkedOutAfter: last.pool.checkedOutAfter },
    executionDurationMs: performance.now() - startedAt, realMessages: 0,
  };
}
