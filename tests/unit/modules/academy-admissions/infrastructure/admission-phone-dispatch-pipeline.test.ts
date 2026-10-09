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

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native applicant phone dispatch", () => {
  it.each(["sms", "whatsapp"] as const)("should dispatch one %s code with the scoped credential and sender outside SQL without granting proof", async (channel) => {
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
        return Response.json({ message: { id: providerId, direction: "outbound", channel, status: "sent" } });
      } }]);
      const deferred: Promise<void>[] = [], observations: string[] = [];
      const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => buildMessagingWorkModule({ focalScope: scope, execute: workerExecute, authorize, readSecurityConfig: async () => fixture.fixture.config, createSender: (preparation) => new ZavuMessageDeliverySender(preparation, transport.fetch), runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { observations.push("dispatch_failed"); } } }).useCases.dispatch }) }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: fixture.input.operationId, expectedPolicyVersion: 2, confirmed: true as const, channel, phone: fixture.input.contact.value, country: "AR" };
      const result = await verification.issue(input);
      expect(result.ok).toBe(true);
      if (!result.ok || result.value.state !== "completed") throw new Error("Native phone pipeline expected a confirmed original issuance");
      await Promise.all(deferred);
      expect(observations).toEqual([]);
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      expect(await verification.issue(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      expect(transport.receipts).toHaveLength(1);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, proofs: 0, memberships: 0 });
      const deliveryId = result.value.result.deliveryId;
      if (!deliveryId) throw new Error("Native phone pipeline delivery reference was unavailable");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,provider_message_id from public.message_delivery_attempts where delivery_id=${deliveryId}`)).rows).toEqual([{ state: "accepted", provider_message_id: providerId }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
      });
      expect(await verification.verify({ tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: randomUUID(), challengeId: result.value.result.challengeId, verificationCode: receivedCode })).toMatchObject({ ok: true, value: { state: "completed", result: { result: "verified", proofId: expect.any(String) } } });
      expect(transport.receipts).toHaveLength(1);
      expect(await fixture.counts()).toMatchObject({ proofs: 1, memberships: 0 });
    });
  }, 600_000);
});
