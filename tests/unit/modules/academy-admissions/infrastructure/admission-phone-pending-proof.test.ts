/** @vitest-environment node */
/** Exercises first phone attachment and immutable pending contacts through native session, SQL and crypto. @module admission-phone-pending-proof-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native phone pending proof", () => {
  it.each(["sms", "whatsapp"] as const)("should attach the first %s phone once when its pending has no contact and reject later replacement", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange an existing pending with its original thirty-day clock, before any contact is claimed.
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      const pendingId = randomUUID();
      await database.applyMigration("20261006200000_scope_admission_audit_operations.sql");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${pendingId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`));
      const dates = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows[0]);
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const input = { ...fixture.input, channel, expectedPolicyVersion: 2, admissionRequestId: pendingId };

      // Act through the native owner; no outbound provider or global identity flow participates.
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Native phone pending fixture expected a committed challenge");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, channel, verificationEpoch: 2 };
      const received = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: received.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Native phone pending fixture expected a local proof");
      const proofId = verified.result.proofId;
      const apply = { ...fixture.context, admissionRequestId: pendingId, operationId: randomUUID(), proofId, expectedRequestVersion: 1 };
      const applied = await operations.apply(apply);
      expect(applied).toMatchObject({ state: "completed", replayed: false, result: { outcome: "applied", requestId: pendingId, requestVersion: 2, status: "pending", proofId: proofId } });
      expect(await operations.apply(apply)).toEqual({ ...applied, replayed: true });

      // Assert the contact, binding and audit are atomic and the deadline remains unchanged.
      await database.withContext(fixture.own, async (transaction) => {
        const request = (await transaction.execute(sql`select submitted_at,expires_at,status,version,evidence_source,contact_type,normalized_contact=${fixture.input.contact.value} as same_contact,proof_id,binding_id from public.academy_admission_requests where id=${pendingId}`)).rows[0];
        expect(request).toMatchObject({ ...dates, status: "pending", version: 2, evidence_source: "local", contact_type: "phone", same_contact: true, proof_id: proofId, binding_id: expect.any(String) });
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: pendingId }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id,first_proof_id from public.academy_admission_contact_bindings where id=${request.binding_id}`)).rows).toEqual([{ owner_user_id: fixture.context.userId, first_request_id: pendingId, first_proof_id: proofId }]);
        const audit = (await transaction.execute<{ event_type: string; metadata: unknown }>(sql`select event_type,metadata from public.academy_admission_audit_events where resource_id=${pendingId}`)).rows;
        expect(audit).toHaveLength(1);
        expect(audit[0].event_type).toBe("proof_attached");
        expect(JSON.stringify(audit).includes(fixture.input.contact.value)).toBe(false);
      });

      const beforeReplacement = await fixture.counts();
      await expect(operations.issue({ ...input, operationId: randomUUID(), contact: { type: "phone", value: "+5491155505678", country: "AR" } })).rejects.toMatchObject({ code: "contact_binding_conflict" });
      expect(await fixture.counts()).toEqual(beforeReplacement);
      expect(beforeReplacement).toMatchObject({ challenges: 1, deliveries: 1, proofs: 1, memberships: 0 });
      const identity = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select "emailVerified" as verified,(select count(*)::int from public.session where "userId"=${fixture.context.userId}) as sessions from public."user" where id=${fixture.context.userId}`));
      expect(identity.rows).toEqual([{ verified: false, sessions: 1 }]);
    });
  }, 600_000);
});
