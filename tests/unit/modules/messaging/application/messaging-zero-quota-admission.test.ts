/** @vitest-environment node */
/** Exercises zero send capacity without bypassing mandatory native admission verification. @module messaging-zero-quota-admission-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native zero quota admission boundary", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should defer a new %s send before credential preparation while ON still rejects admission without proof", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: current native identity and ready channel, with zero send capacity.
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, channel !== "email");
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,allowed_countries=${channel === "email" ? "{}" : "{AR}"}::text[],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel === "email" ? null : channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
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
        return { execute: async () => { const result = await dispatcher.execute(); runs.push(result); return result; } };
      } }) }).useCases;
      const contact = channel === "email" ? {} : { phone: fixture.input.contact.value, country: "AR" };
      const expectedPolicyVersion = fixture.input.expectedPolicyVersion + 1;

      // Act: confirm a native code request, then attempt admission without any proof.
      const issued = await verification.issue({ tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: fixture.input.operationId, expectedPolicyVersion, confirmed: true, channel, ...contact });
      expect(issued).toMatchObject({ ok: true, value: { state: "completed", result: { deliveryState: "queued" } } });
      await Promise.all(deferred);
      const submitted = await admissionModule.createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.submit.execute({ tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion, confirmed: true, ...contact });
      expect(submitted).toMatchObject({ ok: false, failure: { code: "additional_verification_required" } });

      // Assert: quota stops the marker and preparation; ON and the tenant scope remain intact.
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ claimed: 1, authorized: 0, quotaDeferred: 1, accepted: 0, delivered: 0, unresolved: 0 });
      expect(preparations).toBe(0);
      expect(transport.receipts).toEqual([]);
      expect(transport.deniedRequests).toBe(0);
      expect(diagnostics).toEqual([]);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 0, memberships: 0 });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as attempts from public.message_delivery_attempts where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ attempts: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as reservations from public.messaging_usage_reservations where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ reservations: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as requests from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ requests: 0 }]);
        expect((await transaction.execute(sql`select requires_additional_verification,version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ requires_additional_verification: true, version: 2, verification_epoch: 2 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
