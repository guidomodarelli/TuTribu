/** Seeds a real owned-branch workload; setup data is never mistaken for measured product effects. @module admission-performance-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistAdmission, seedAllowlistAdmission } from "./allowlist-admission-database-fixture";
import { seedAllowlistManagement } from "./allowlist-management-database-fixture";
import { seedContactVerificationDatabase } from "./contact-verification-database-fixture";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_PHASE, type AdmissionFixtureShape } from "./constants/admission-performance";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { GOOGLE_EMAIL_AUTHORITY, GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { ALLOWLIST_DATABASE_ORIGIN } from "@/src/modules/academy-admissions/constants/allowlist-management";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";

/** Keeps generated native identity and session material solely inside the test process. */
export type AdmissionPerformanceParticipant = {
  index: number;
  userId: string;
  sessionId: string;
  sessionToken: string;
  accountId: string;
  subject: string;
  evidenceId: string;
  entryId: string;
  email: string;
};

/**
 * Prepares one current list academy and a deterministic mixed workload without a provider call.
 * @param database - Exact disposable branch capability supplied by the native owner.
 * @param onPhase - Optional safe stage names, excluding contacts and private identity material.
 * @returns The actual native owner, generated participants and fixed policy version; no admission has been submitted.
 */
export async function prepareAdmissionPerformanceFixture(database: AcademyAdmissionTestDatabase, onPhase?: (phase: string) => void) {
  const { fixture } = await prepareAllowlistAdmission(database);
  return seedAdmissionPerformanceParticipants(database, fixture, onPhase);
}

/** @param database - Real executor whose owner already applied the exact SQL journal. @param onPhase - Optional safe progress names. @param shape - Fixed server-selected dataset; defaults to the unchanged latency cohort. @returns Native fixture using host-generated private keys, without a CLI or filesystem dependency at runtime. */
export async function seedAdmissionPerformanceFixture(database: Pick<AcademyAdmissionTestDatabase, "withContext">, onPhase?: (phase: string) => void, shape: AdmissionFixtureShape = ADMISSION_PERFORMANCE) {
  const account = await seedContactVerificationDatabase(database);
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await registerMessagingPrivateMacKeyMaterial(transaction, account.config, MESSAGING_KEY_PURPOSE.operationPayload);
    await registerMessagingPrivateMacKeyMaterial(transaction, account.config, MESSAGING_KEY_PURPOSE.contactFingerprint);
  });
  const management = await seedAllowlistManagement(database, account);
  const { fixture } = await seedAllowlistAdmission(database, management);
  return seedAdmissionPerformanceParticipants(database, fixture, onPhase, shape);
}

/** @param database - Actual branch-scoped transaction executor. @param fixture - Shared activated academy and host keys. @param onPhase - Safe progress callback. @param shape - The prepared cohort and list size, never HTTP input. @returns The selected dataset; no presentation has run. */
async function seedAdmissionPerformanceParticipants(database: Pick<AcademyAdmissionTestDatabase, "withContext">, fixture: Awaited<ReturnType<typeof seedAllowlistManagement>>, onPhase?: (phase: string) => void, shape: AdmissionFixtureShape = ADMISSION_PERFORMANCE) {
  if (![shape.participantCount, shape.enabledParticipantCount, shape.entryCount].every(Number.isSafeInteger) || shape.participantCount < 1 || shape.enabledParticipantCount < 0 || shape.enabledParticipantCount > shape.participantCount || shape.entryCount < shape.enabledParticipantCount) throw new Error("AdmissionPerformanceFixture.seed failed: invalid_sample_dimensions");
  const runId = randomUUID();
  const participants: AdmissionPerformanceParticipant[] = Array.from({ length: shape.participantCount }, (_, index) => ({ index, userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), accountId: randomUUID(), subject: randomUUID(), evidenceId: randomUUID(), entryId: randomUUID(), email: `performance-${runId}-${index}@${ADMISSION_PERFORMANCE.fixtureDomain}` }));
  onPhase?.(ADMISSION_PERFORMANCE_PHASE.identities);
  for (let offset = 0; offset < participants.length; offset += ADMISSION_PERFORMANCE.insertionBlockSize) {
    const block = participants.slice(offset, offset + ADMISSION_PERFORMANCE.insertionBlockSize);
    await database.withContext(fixture.own, async (transaction) => {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values ${sql.join(block.map((participant) => sql`(${participant.userId},${ADMISSION_PERFORMANCE.applicantName},${participant.email},false,clock_timestamp(),clock_timestamp())`), sql`,`)}`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values ${sql.join(block.map((participant) => sql`(${participant.accountId},${participant.userId},${GOOGLE_IDENTITY_PROVIDER},${participant.subject},clock_timestamp(),clock_timestamp())`), sql`,`)}`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values ${sql.join(block.map((participant) => sql`(${participant.sessionId},${participant.userId},${participant.sessionToken},clock_timestamp()+${ADMISSION_PERFORMANCE.sessionLifetimeMs}*interval '1 millisecond',clock_timestamp(),clock_timestamp())`), sql`,`)}`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values ${sql.join(block.map((participant) => sql`(${participant.sessionId},${participant.userId},${participant.accountId},${participant.subject},${participant.email})`), sql`,`)}`);
      await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values ${sql.join(block.map((participant) => sql`(${participant.evidenceId},${participant.userId},${participant.accountId},${GOOGLE_IDENTITY_PROVIDER},${participant.subject},${participant.email},true,${ADMISSION_PERFORMANCE.fixtureDomain},${GOOGLE_EMAIL_AUTHORITY.workspace},${ADMISSION_PERFORMANCE.identityIssuer},${ADMISSION_PERFORMANCE.identityAudience},clock_timestamp(),clock_timestamp()+${ADMISSION_PERFORMANCE.evidenceLifetimeMs}*interval '1 millisecond',clock_timestamp())`), sql`,`)}`);
    });
  }
  const enabled = participants.slice(0, shape.enabledParticipantCount).map((participant) => ({ id: participant.entryId, email: participant.email }));
  const filler = Array.from({ length: shape.entryCount - enabled.length }, (_, index) => ({ id: randomUUID(), email: `load-${runId}-${index}@${ADMISSION_PERFORMANCE.fixtureDomain}` }));
  const entries = [...enabled, ...filler];
  onPhase?.(ADMISSION_PERFORMANCE_PHASE.allowlist);
  for (let offset = 0; offset < entries.length; offset += ADMISSION_PERFORMANCE.insertionBlockSize) {
    const block = entries.slice(offset, offset + ADMISSION_PERFORMANCE.insertionBlockSize);
    const fingerprints = await Promise.all(block.map((entry) => createAdmissionContactFingerprint({ type: ADMISSION_CONTACT_TYPE.email, value: entry.email }, fixture.config)));
    await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,origin,created_by_user_id,updated_by_user_id) values ${sql.join(block.map((entry, index) => sql`(${entry.id},${fixture.tribeId},${ADMISSION_CONTACT_TYPE.email},${entry.email},${Buffer.from(fingerprints[index].digest)},${fingerprints[index].keyId},${ALLOWLIST_DATABASE_ORIGIN.manual},${fixture.userId},${fixture.userId})`), sql`,`)}`));
  }
  onPhase?.(ADMISSION_PERFORMANCE_PHASE.ready);
  return { fixture, participants };
}
