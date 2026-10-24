/** Composes real admission writers with replaceable own transport ports on one owned SQL branch. @module messaging-provider-substitution-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionContactVerification } from "./admission-contact-verification-fixture";
import { createAdmissionProviderTransport } from "./admission-provider-transport";
import { createTestEmailProvider } from "./messaging-email-provider";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { ScopedAdmissionVerificationDispatcher } from "@/src/modules/academy-admissions/infrastructure/verification/admission-verification-message-sender";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { createZavuProviderDescriptor } from "@/src/modules/messaging/infrastructure/zavu/zavu-provider-descriptor";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** Distinguishes actual business journeys without changing the admission implementation. */
export type ProviderSubstitutionScenario = "allowlist" | "personal" | "review";

/**
 * Seeds only initial resources; all issuance, dispatch, proof and admission effects use real application composition.
 * @param database - This test's owned disposable branch, with native sessions, RLS and Web Crypto.
 * @param scenario - Exact list, personal redemption or manual approval journey.
 * @param alternative - Whether only the own transport adapter is replaced by the email-only double.
 * @param securityConfig - The same external host keyrings for both compositions; changing transport must not simulate retiring global contact keys.
 * @returns Native commands and private transient observations, never a fabricated business result.
 */
export async function prepareProviderSubstitution(database: AcademyAdmissionTestDatabase, scenario: ProviderSubstitutionScenario, alternative: boolean, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareAdmissionContactVerification(database, false, securityConfig);
  for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql", "20261009083000_read_current_admission_review_evidence.sql", "20261009130000_add_personal_invitation_context_digest.sql", "20261009180000_bind_personal_verification_challenges.sql"]) await database.applyMigration(migration);
  const invitationId = scenario === "personal" ? randomUUID() : null;
  const leaderSessionId = randomUUID();
  const personalToken = invitationId ? await createPersonalInvitationTokenCodec(fixture.fixture.config).issue({ tribeId: fixture.context.tribeId, invitationId }) : null;
  await database.withContext(fixture.fixture.own, async (transaction) => {
    if (scenario === "review") {
      const accountId = randomUUID(), subject = randomUUID();
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${leaderSessionId},${fixture.fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.fixture.userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${leaderSessionId},${fixture.fixture.userId},${accountId},${subject},${fixture.fixture.own.email})`);
    }
    await transaction.execute(sql`update public.academy_admission_policies set mode=${scenario === "review" ? "manual_review" : "allowlist"},requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
    const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
    if (scenario === "allowlist") await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,created_by_user_id,updated_by_user_id) values (${randomUUID()},${fixture.context.tribeId},'email',${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'Entrada para sustitución','manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
    if (invitationId && personalToken) {
      const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const invitation = createPersonalInvitation({ id: invitationId, tribeId: fixture.context.tribeId, actorUserId: fixture.fixture.userId, contact: fixture.input.contact, internalName: "Sustitución de transporte", requiresAllowlist: false, allowlistExemptionAcknowledged: true, now, policy: { contactType: "email", requiresAdditionalVerification: true } });
      await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitation.id},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},'email',${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,${invitation.expiresAt},${Buffer.from(personalToken.lookupDigest)},${personalToken.keyId},${Buffer.from(personalToken.digest)},${now},${now})`);
    }
  });

  let transactions = 0;
  const execute = async <Result>(actor: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => {
    transactions += 1;
    try { return await database.withContext({ userId: actor, email: null }, run); }
    finally { transactions -= 1; }
  };
  const accountModule = (userId: string, sessionId: string) => buildAcademyAdmissionsModule({ accounts: new PostgresAuthenticatedAccountProvider(async () => ({ userId, sessionId }), (_identity, run) => execute(userId, run)), clock: () => new Date(), execute: (account, run) => execute(account.userId, run) });
  const admissionModule = accountModule(fixture.context.userId, fixture.context.sessionId);
  const codes: string[] = [];
  const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
    expect(transactions).toBe(0);
    expect(request.headers.get("Authorization") === `Bearer ${fixture.fixture.credential}`).toBe(true);
    expect(request.headers.get("Zavu-Sender")).toBe(fixture.fixture.emailSenderId);
    const body = await request.json() as { to: string; channel: string; fallbackEnabled: boolean; text: string };
    expect(body.to === fixture.own.email).toBe(true);
    expect(body).toMatchObject({ channel: "email", fallbackEnabled: false });
    const code = body.text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw new Error("Provider substitution fixture failed: verification_code_not_sent");
    codes.push(code);
    return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "sent" } });
  } }]);
  const email = createTestEmailProvider(fixture.fixture.emailSenderId, () => { expect(transactions).toBe(0); });
  // Persisted connections remain production-valid Zavu resources. Only the explicitly
  // injected own sender port changes; this is not another production registration.
  const descriptor = alternative ? email.descriptor : createZavuProviderDescriptor(transport.fetch);
  const deferred: Promise<void>[] = [];
  const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => buildMessagingWorkModule({ focalScope: scope, execute, authorize, readSecurityConfig: async () => fixture.fixture.config, createSender: (preparation) => descriptor.createSender(preparation), runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { throw new Error("Unexpected provider substitution dispatch diagnostic"); } } }).useCases.dispatch }) }).useCases;
  const commands = admissionModule.createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
  const leader = accountModule(fixture.fixture.userId, leaderSessionId).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
  return { fixture, invitationId, personalToken, verification, commands, leader,
    /** @returns The exact synthetic code observed by the substituted send boundary, rather than reopening an envelope. */
    code() { const code = alternative ? email.deliveries[0]?.code : codes[0]; if (!code) throw new Error("Provider substitution fixture failed: delivery_not_observed"); return code; },
    /** @returns Number of actually invoked own transport sends. */
    sends() { return alternative ? email.deliveries.length : transport.receipts.length; },
    /** @returns After retaining all original deferred worker observations. */
    async settle() { await Promise.all(deferred); },
  };
}
