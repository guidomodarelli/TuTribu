/** @vitest-environment node */
/** Exercises exhausted send quotas without disabling native admission proof requirements. @module messaging-usage-and-abuse-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ScopedAdmissionVerificationDispatcher } from "@/src/modules/academy-admissions/infrastructure/verification/admission-verification-message-sender";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native usage quota and proof continuity", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should preserve an actually delivered %s code and mandatory ON policy after send quota exhaustion and suspension", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: the current account, connection and ON policy are real and scoped.
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, channel !== "email");
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel !== "email") await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel === "email" ? null : channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      let transactions = 0, receivedCode = "";
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      /** @param actorUserId - Server-derived owner. @param run - Database-only callback. @returns Its committed result before external delivery. */
      const workerExecute = async <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>): Promise<Result> => {
        transactions += 1;
        try { return await database.withContext({ userId: actorUserId, email: null }, run); }
        finally { transactions -= 1; }
      };
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(transactions).toBe(0);
        const payload = await request.json() as { to: string; channel: string; fallbackEnabled: boolean; text?: string; content?: { templateVariables?: Record<string, string> } };
        expect(payload.to === fixture.input.contact.value && payload.channel === channel && payload.fallbackEnabled === false).toBe(true);
        // Keep the actual delivered code only in this private callback, never in a receipt or assertion output.
        receivedCode = channel === "whatsapp" ? payload.content?.templateVariables?.["1"] ?? "" : payload.text?.match(/\b\d{6}\b/u)?.[0] ?? "";
        expect(/^\d{6}$/u.test(receivedCode)).toBe(true);
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel, status: "sent" } });
      } }]);
      const deferred: Promise<void>[] = [], diagnostics: string[] = [];
      const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => buildMessagingWorkModule({ focalScope: scope, execute: workerExecute, authorize, readSecurityConfig: async () => fixture.fixture.config, createSender: (preparation) => new ZavuMessageDeliverySender(preparation, transport.fetch), runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { diagnostics.push("dispatch_failed"); } } }).useCases.dispatch }) }).useCases;
      const policyVersion = fixture.input.expectedPolicyVersion + 1;
      const input = { tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: fixture.input.operationId, expectedPolicyVersion: policyVersion, confirmed: true as const, channel, ...(channel === "email" ? {} : { phone: fixture.input.contact.value, country: "AR" }) };
      const issued = await verification.issue(input);
      expect(issued.ok).toBe(true);
      if (!issued.ok || issued.value.state !== "completed") throw new Error("Usage continuity expected the original committed native challenge");
      await Promise.all(deferred);
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      expect(diagnostics).toEqual([]);
      const original = issued.value.result;
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select code_envelope_id from public.contact_verification_challenges where id=${original.challengeId}`)).rows).toEqual([{ code_envelope_id: null }]);
      });

      // Act: exhaust the current send quota and suspend the connection after actual delivery.
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.tenant_messaging_connections set state='suspended',state_reason='security_pause',version=version+1 where id=${fixture.fixture.scope.connectionId}`);
      });
      const validation = { tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: randomUUID(), challengeId: original.challengeId, verificationCode: receivedCode };
      const verified = await verification.verify(validation);
      expect(verified).toMatchObject({ ok: true, value: { state: "completed", result: { result: "verified", proofId: expect.any(String) } } });
      if (!verified.ok || verified.value.state !== "completed") throw new Error("Usage continuity expected the original committed native proof");
      expect(await verification.verify(validation)).toEqual({ ok: true, value: { ...verified.value, replayed: true } });
      expect(await verification.issue(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: original } });

      // Assert: local validation neither sends again nor grants membership or global identity.
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 1, memberships: 0 });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select verification_daily_limit from public.messaging_usage_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ verification_daily_limit: 0 }]);
        expect((await transaction.execute(sql`select requires_additional_verification,version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ requires_additional_verification: true, version: 2, verification_epoch: 2 }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${original.deliveryId}`)).rows).toEqual([{ state: "accepted" }]);
        expect((await transaction.execute(sql`select "emailVerified" as verified,(select count(*)::int from public.global_identity_evidence where user_id=${fixture.context.userId}) as evidence from public."user" where id=${fixture.context.userId}`)).rows).toEqual([{ verified: false, evidence: 0 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
