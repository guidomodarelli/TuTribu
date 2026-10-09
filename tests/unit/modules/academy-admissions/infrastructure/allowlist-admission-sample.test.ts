/** @vitest-environment node */
/** Persists the actual deterministic thousand-contact 800/200 admission sample through native commands. @module allowlist-admission-sample-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SAMPLE_TESTS !== "1")("native deterministic admission sample", () => {
  it("should persist exactly eight hundred approved basic memberships and two hundred reasoned reviews for one thousand trusted contacts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture } = await prepareAllowlistAdmission(database);
      const contacts = Array.from({ length: 1_000 }, (_, index) => ({ index, userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), accountId: randomUUID(), subject: randomUUID(), evidenceId: randomUUID(), entryId: randomUUID(), email: `sample.${index}+tag@example.test` }));
      // Batch only fixture insertion. Every presentation below retains the real
      // claim commit, native authorization and separate guarded effect commit.
      for (let offset = 0; offset < contacts.length; offset += 100) {
        const block = contacts.slice(offset, offset + 100);
        const fingerprints = await Promise.all(block.map((contact) => createAdmissionContactFingerprint({ type: "email", value: contact.email }, fixture.config)));
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values ${sql.join(block.map((contact) => sql`(${contact.userId},'Synthetic sample applicant',${contact.email},false,clock_timestamp(),clock_timestamp())`), sql`,`)}`);
          await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values ${sql.join(block.map((contact) => sql`(${contact.accountId},${contact.userId},'google',${contact.subject},clock_timestamp(),clock_timestamp())`), sql`,`)}`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values ${sql.join(block.map((contact) => sql`(${contact.sessionId},${contact.userId},${contact.sessionToken},clock_timestamp()+interval '6 hours',clock_timestamp(),clock_timestamp())`), sql`,`)}`);
          await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values ${sql.join(block.map((contact) => sql`(${contact.sessionId},${contact.userId},${contact.accountId},${contact.subject},${contact.email})`), sql`,`)}`);
          await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values ${sql.join(block.map((contact) => sql`(${contact.evidenceId},${contact.userId},${contact.accountId},'google',${contact.subject},${contact.email},true,'example.test','workspace','https://accounts.google.com','synthetic-sample-client',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp())`), sql`,`)}`);
          const enabled = block.map((contact, index) => ({ contact, fingerprint: fingerprints[index] })).filter(({ contact }) => contact.index < 800);
          if (enabled.length) await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,origin,created_by_user_id,updated_by_user_id) values ${sql.join(enabled.map(({ contact, fingerprint }) => sql`(${contact.entryId},${fixture.tribeId},'email',${contact.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'manual',${fixture.userId},${fixture.userId})`), sql`,`)}`);
        });
      }
      let nextContact = 0, completed = 0, admitted = 0, pending = 0;
      const failures: { index: number; code: string; state?: string }[] = [];
      /** @returns After this bounded worker has exhausted its assigned real presentations; no retry or fabricated DB effect is allowed. */
      const worker = async () => {
        while (nextContact < contacts.length) {
          const contact = contacts[nextContact++];
          const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: contact.userId, sessionId: contact.sessionId }), (_identity, run) => database.withContext({ userId: contact.userId, email: contact.email }, run));
          const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
          const result = await commands.submit.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true, ...(contact.index >= 800 ? { message: "Solicito revisión de mi ingreso." } : {}) });
          if (!result.ok) failures.push({ index: contact.index, code: result.failure.code });
          else if (result.value.state !== "completed") failures.push({ index: contact.index, code: "operation_unresolved", state: result.value.state });
          else if (result.value.result.outcome === "admitted") admitted++;
          else if (result.value.result.outcome === "pending") pending++;
          else failures.push({ index: contact.index, code: "unexpected_outcome" });
          completed++;
          if (completed % 50 === 0) process.stdout.write(JSON.stringify({ phase: "admission_sample_progress", completed, admitted, pending, failures: failures.length }) + "\n");
        }
      };
      await Promise.all(Array.from({ length: 4 }, () => worker()));
      expect(failures).toEqual([]);
      expect({ completed, admitted, pending }).toEqual({ completed: 1_000, admitted: 800, pending: 200 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId} group by status order by status`)).rows).toEqual([{ status: "approved", count: 800 }, { status: "pending", count: 200 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate' and status='active') as members,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.academy_allowlist_entries where tribe_id=${fixture.tribeId} and version=1 and status='enabled') as unchanged_entries,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and actor_kind='system' and actor_user_id is null and rule='automatic' and outcome='approved' and allowlist_entry_version=1) as system_approvals`)).rows).toEqual([{ members: 800, bindings: 1_000, unchanged_entries: 800, system_approvals: 800 }]);
        expect((await transaction.execute(sql`select event_type,count(*)::int as count from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} group by event_type order by event_type`)).rows).toEqual([{ event_type: "approved", count: 800 }, { event_type: "pending_created", count: 200 }]);
      });
    }, { concurrentTransactions: 8 });
  }, 18_000_000);
});
