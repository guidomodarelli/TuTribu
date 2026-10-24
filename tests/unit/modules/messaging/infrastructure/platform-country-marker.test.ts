/** @vitest-environment node */
/** Exercises platform country restrictions at the real phone dispatch marker. @module platform-country-marker-tests */
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
import type { MessageDispatchRunResult } from "@/src/modules/messaging/application/results/message-dispatch-result";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native platform country marker restriction", () => {
  it.each(["sms", "whatsapp"] as const)("should suppress a queued %s marker for a platform-forbidden country despite the leader allowing it", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: the live policy and channel allow the destination when the challenge is issued.
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      const transport = createAdmissionProviderTransport([]), deferred: Promise<void>[] = [], runs: MessageDispatchRunResult[] = [], diagnostics: string[] = [];
      let preparations = 0;
      const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => {
        const dispatcher = buildMessagingWorkModule({ focalScope: scope, execute: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), authorize, readSecurityConfig: async () => fixture.fixture.config, createSender: (preparation) => {
          const sender = new ZavuMessageDeliverySender(preparation, transport.fetch);
          return { prepare: async (context, signal) => { preparations += 1; return sender.prepare(context, signal); } };
        }, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { diagnostics.push("dispatch_failed"); } } }).useCases.dispatch;
        return { execute: async () => {
          // Act: a current platform capability closes this destination immediately before marker authorization.
          await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set platform_restrictions=${JSON.stringify([{ country: "AR", channel, allowed: false }])}::jsonb where tribe_id=${fixture.context.tribeId} and connection_id=${fixture.fixture.scope.connectionId} and connection_version=1 and channel=${channel}`));
          const result = await dispatcher.execute(); runs.push(result); return result;
        } };
      } }) }).useCases;
      const issued = await verification.issue({ tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: fixture.input.operationId, expectedPolicyVersion: fixture.input.expectedPolicyVersion + 1, confirmed: true, channel, phone: fixture.input.contact.value, country: "AR" });
      expect(issued).toMatchObject({ ok: true, value: { state: "completed", result: { deliveryState: "queued" } } });
      if (!issued.ok || issued.value.state !== "completed") throw new Error("Platform country fixture expected the original committed challenge");
      await Promise.all(deferred);

      // Assert: suppression has the exact destination reason, without an attempt, reservation or provider access.
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ claimed: 1, suppressed: 1, authorized: 0, quotaDeferred: 0, accepted: 0, unresolved: 0 });
      expect(preparations).toBe(0);
      expect(transport.receipts).toEqual([]);
      expect(transport.deniedRequests).toBe(0);
      expect(diagnostics).toEqual([]);
      const original = issued.value.result;
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,last_outcome,queued_usage_policy_version from public.message_deliveries where id=${original.deliveryId}`)).rows).toEqual([{ state: "suppressed", last_outcome: "recipient_not_allowed", queued_usage_policy_version: 2 }]);
        expect((await transaction.execute(sql`select count(*)::integer as attempts from public.message_delivery_attempts where delivery_id=${original.deliveryId}`)).rows).toEqual([{ attempts: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as reservations from public.messaging_usage_reservations where delivery_id=${original.deliveryId}`)).rows).toEqual([{ reservations: 0 }]);
        expect((await transaction.execute(sql`select version,allowed_countries from public.messaging_usage_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ version: 2, allowed_countries: ["AR"] }]);
        expect((await transaction.execute(sql`select state,is_current,failed_attempts,invalidated_at from public.contact_verification_challenges where id=${original.challengeId}`)).rows).toEqual([{ state: "issued", is_current: true, failed_attempts: 0, invalidated_at: null }]);
      });
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 0, memberships: 0 });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
