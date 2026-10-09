/** Seeds one valid private personal resource beside native code infrastructure on an owned branch. @module personal-contact-issuance-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionContactVerification } from "./admission-contact-verification-fixture";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

/** @param database - Verified owned disposable branch. @param phone - Whether the immutable native policy/contact starts as phone. @returns Native code owner, exact personal token proposal and inward fixture without provider calls. */
export async function preparePersonalContactIssuance(database: AcademyAdmissionTestDatabase, phone = false) {
  const fixture = await prepareAdmissionContactVerification(database, false, undefined, phone), invitationId = randomUUID();
  for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261009130000_add_personal_invitation_context_digest.sql", "20261009180000_bind_personal_verification_challenges.sql"]) await database.applyMigration(migration);
  await database.withContext(fixture.fixture.own, async (transaction) => {
    await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
    if (phone) await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
  });
  const token = await createPersonalInvitationTokenCodec(fixture.fixture.config).issue({ tribeId: fixture.context.tribeId, invitationId });
  await database.withContext(fixture.fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const invitation = createPersonalInvitation({ id: invitationId, tribeId: fixture.context.tribeId, actorUserId: fixture.fixture.userId, contact: fixture.input.contact, internalName: "Código personal", requiresAllowlist: false, allowlistExemptionAcknowledged: true, now, policy: { contactType: fixture.input.contact.type, requiresAdditionalVerification: true } });
    const fingerprint = await createAdmissionContactFingerprint(invitation.contact, fixture.fixture.config);
    await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitationId},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},${invitation.contact.type},${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,${invitation.expiresAt},${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},${now},${now})`);
  });
  const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
  return { fixture, operations, invitationId, token, input: { ...fixture.input, expectedPolicyVersion: 2, source: { kind: "personal" as const, token: token.token } } };
}
