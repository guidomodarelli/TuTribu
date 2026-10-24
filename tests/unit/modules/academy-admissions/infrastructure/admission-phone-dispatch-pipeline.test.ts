/** @vitest-environment node */
/** Exercises actual applicant factories, SQL marker, private preparation and SDK for both phone channels through closed transport. @module admission-phone-dispatch-pipeline-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ScopedAdmissionVerificationDispatcher } from "@/src/modules/academy-admissions/infrastructure/verification/admission-verification-message-sender";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native applicant phone dispatch", () => {
  it.each([
    { channel: "sms", reduction: "none", receipt: "sent" }, { channel: "whatsapp", reduction: "none", receipt: "sent" },
    { channel: "sms", reduction: "before-marker", receipt: "sent" }, { channel: "whatsapp", reduction: "before-marker", receipt: "sent" },
    { channel: "sms", reduction: "after-marker", receipt: "sent" }, { channel: "whatsapp", reduction: "after-marker", receipt: "sent" },
    { channel: "sms", reduction: "none", receipt: "delivered" }, { channel: "whatsapp", reduction: "none", receipt: "delivered" },
  ] as const)("should preserve $channel proof and accounting with country reduction $reduction and receipt $receipt at the actual marker", async ({ channel, reduction, receipt }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      let transactions = 0, receivedCode = "";
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => { transactions += 1; try { return await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run); } finally { transactions -= 1; } } });
      const workerExecute = async <Result>(actor: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => { transactions += 1; try { return await database.withContext({ userId: actor, email: null }, run); } finally { transactions -= 1; } };
      /** Changes only the current usage configuration at the selected real boundary, without modifying code or admission policy. */
      const reduceCountries = async () => {
        await workerExecute(fixture.fixture.userId, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.context.tribeId}`));
      };
      const providerId = randomUUID(), expectedSender = channel === "sms" ? "synthetic-sms-sender" : "synthetic-whatsapp-sender";
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(transactions).toBe(0);
        expect(request.headers.get("Authorization") === `Bearer ${fixture.fixture.credential}`).toBe(true);
        expect(request.headers.get("Zavu-Sender") === expectedSender).toBe(true);
        const body = await request.json() as { to?: string; channel?: string; fallbackEnabled?: boolean; messageType?: string; text?: string; content?: { templateId?: string; templateVariables?: Record<string, string> }; templateLanguage?: string };
        expect(body.to === fixture.input.contact.value && body.channel === channel && body.fallbackEnabled === false).toBe(true);
        if (channel === "whatsapp") { expect(body.messageType === "template" && body.content?.templateId === "synthetic-otp-template" && body.text === undefined && body.templateLanguage === undefined).toBe(true); receivedCode = body.content?.templateVariables?.["1"] ?? ""; }
        else { expect(body.messageType === "text" && body.content === undefined).toBe(true); receivedCode = body.text?.match(/\b\d{6}\b/u)?.[0] ?? ""; }
        expect(/^\d{6}$/u.test(receivedCode)).toBe(true);
        return Response.json({ message: { id: providerId, direction: "outbound", channel, status: receipt } });
      } }]);
      const deferred: Promise<void>[] = [], observations: string[] = [];
      const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => {
        const dispatcher = buildMessagingWorkModule({ focalScope: scope, execute: workerExecute, authorize, readSecurityConfig: async () => fixture.fixture.config, createSender: (preparation) => {
          const sender = new ZavuMessageDeliverySender(preparation, transport.fetch);
          return { prepare: async (context, signal) => { const prepared = await sender.prepare(context, signal); if (reduction === "after-marker") await reduceCountries(); return prepared; } };
        }, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { observations.push("dispatch_failed"); } } }).useCases.dispatch;
        return { execute: async () => { if (reduction === "before-marker") await reduceCountries(); return dispatcher.execute(); } };
      } }) }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: fixture.input.operationId, expectedPolicyVersion: 2, confirmed: true as const, channel, phone: fixture.input.contact.value, country: "AR" };
      const result = await verification.issue(input);
      expect(result.ok).toBe(true);
      if (!result.ok || result.value.state !== "completed") throw new Error("Native phone pipeline expected a confirmed original issuance");
      const challenge = result.value.result;
      await Promise.all(deferred);
      expect(observations).toEqual([]);
      const expectedReceipts = reduction === "before-marker" ? 0 : 1;
      expect(transport.receipts).toHaveLength(expectedReceipts);
      expect(transport.deniedRequests).toBe(0);
      expect(await verification.issue(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      expect(transport.receipts).toHaveLength(expectedReceipts);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, proofs: 0, memberships: 0 });
      const deliveryId = result.value.result.deliveryId;
      if (!deliveryId) throw new Error("Native phone pipeline delivery reference was unavailable");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,provider_message_id,authorized_usage_policy_version from public.message_delivery_attempts where delivery_id=${deliveryId}`)).rows).toEqual(reduction === "before-marker" ? [] : [{ state: receipt === "delivered" ? "delivered" : "accepted", provider_message_id: providerId, authorized_usage_policy_version: 2 }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${deliveryId}`)).rows).toEqual(reduction === "before-marker" ? [] : [{ state: "consumed" }]);
        expect((await transaction.execute(sql`select queued_usage_policy_version,state from public.message_deliveries where id=${deliveryId}`)).rows).toEqual([{ queued_usage_policy_version: 2, state: reduction === "before-marker" ? "suppressed" : receipt === "delivered" ? "delivered" : "accepted" }]);
        expect((await transaction.execute(sql`select version,allowed_countries from public.messaging_usage_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ version: reduction === "none" ? 2 : 3, allowed_countries: reduction === "none" ? ["AR"] : [] }]);
        expect((await transaction.execute(sql`select state,failed_attempts from public.contact_verification_challenges where id=${challenge.challengeId}`)).rows).toEqual([{ state: "issued", failed_attempts: 0 }]);
      });
      if (reduction === "before-marker") {
        const recovered = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, channel, verificationEpoch: 2 } }, result.value.result.challengeId);
        receivedCode = recovered.code;
      }
      expect(await verification.verify({ tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: randomUUID(), challengeId: result.value.result.challengeId, verificationCode: receivedCode })).toMatchObject({ ok: true, value: { state: "completed", result: { result: "verified", proofId: expect.any(String) } } });
      expect(transport.receipts).toHaveLength(expectedReceipts);
      expect(await fixture.counts()).toMatchObject({ proofs: 1, memberships: 0 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select "emailVerified" as verified,(select count(*)::int from public.session where "userId"=${fixture.context.userId}) as sessions,(select count(*)::int from public.account where "userId"=${fixture.context.userId}) as accounts,(select count(*)::int from public.global_identity_evidence where user_id=${fixture.context.userId}) as evidence from public."user" where id=${fixture.context.userId}`)).rows).toEqual([{ verified: false, sessions: 1, accounts: 1, evidence: 0 }]);
        expect((await transaction.execute(sql`select version,verification_epoch,requires_additional_verification from public.academy_admission_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ version: 2, verification_epoch: 2, requires_additional_verification: true }]);
        expect((await transaction.execute(sql`select count(*)::int as requests from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and actor_user_id=${fixture.context.userId} and event_type='code_request'`)).rows).toEqual([{ requests: 1 }]);
      });
    });
  }, 600_000);
});
