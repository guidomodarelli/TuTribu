/** @vitest-environment node */
/** Exercises the consumed verification bucket across admission, diagnostics and SMS alternative independently of notices. @module shared-verification-bucket-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS, MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ScopedAdmissionVerificationDispatcher } from "@/src/modules/academy-admissions/infrastructure/verification/admission-verification-message-sender";
import { ScopedConnectionDiagnosticDispatcher } from "@/src/modules/messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import { buildMessagingModule, buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { MessageDispatchRunResult } from "@/src/modules/messaging/application/results/message-dispatch-result";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native shared verification usage bucket", () => {
  it("should charge one real admission send and deny diagnostic and SMS alternative while the independent notice bucket can still reserve", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      const leader = fixture.fixture.own, tribeId = fixture.context.tribeId, connectionId = fixture.fixture.scope.connectionId;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261007050000_claim_scoped_diagnostic_delivery.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql"]) await database.applyMigration(migration);
      const leaderSessionId = randomUUID(), leaderAccountId = randomUUID(), leaderSubject = randomUUID();
      await database.withContext(leader, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],verification_daily_limit=1,notification_daily_limit=1,version=version+1 where tribe_id=${tribeId}`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${tribeId},${connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp()),(${tribeId},${connectionId},1,'email',${fixture.fixture.emailSenderId},null,null,'prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel='whatsapp',allow_sms_alternative=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${tribeId}`);
        const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now), expiresAt = new Date(now.getTime() + MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${leaderAccountId},${leader.userId},'google',${leaderSubject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${leaderSessionId},${leader.userId},${randomUUID()},${expiresAt},${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${leaderSessionId},${leader.userId},${leaderAccountId},${leaderSubject},${leader.email})`);
      });
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        const payload = await request.json() as { channel: string; content?: { templateVariables?: Record<string, string> } };
        expect(payload.channel).toBe("whatsapp");
        receivedCode = payload.content?.templateVariables?.["1"] ?? "";
        expect(/^\d{6}$/u.test(receivedCode)).toBe(true);
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "whatsapp", status: "sent" } });
      } }]);
      let receivedCode = "", preparations = 0;
      const deferred: Promise<void>[] = [], admissionRuns: MessageDispatchRunResult[] = [], diagnosticRuns: MessageDispatchRunResult[] = [], diagnostics: string[] = [];
      const executeWorker = <Result>(actorUserId: string | null, run: Parameters<typeof database.withContext<Result>>[1]) => database.withContext({ userId: actorUserId, email: null }, run);
      const createSender = (preparation: Parameters<Parameters<typeof buildMessagingWorkModule>[0]["createSender"]>[0]) => {
        const sender = new ZavuMessageDeliverySender(preparation, transport.fetch);
        return { prepare: async (...arguments_: Parameters<typeof sender.prepare>) => { preparations += 1; return sender.prepare(...arguments_); } };
      };
      const runtime = { now: Date.now, createId: randomUUID, defer: (work: Promise<void>) => { deferred.push(work); }, report: () => { diagnostics.push("dispatch_failed"); } };
      const applicantAccounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admission = buildAcademyAdmissionsModule({ accounts: applicantAccounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      const verification = admission.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({ resolve, readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (scope, authorize) => {
        const worker = buildMessagingWorkModule({ focalScope: scope, authorize, execute: executeWorker, readSecurityConfig: async () => fixture.fixture.config, createSender, runtime }).useCases.dispatch;
        return { execute: async () => { const result = await worker.execute(); admissionRuns.push(result); return result; } };
      } }) }).useCases;
      const issued = await verification.issue({ tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: fixture.input.expectedPolicyVersion + 1, confirmed: true, channel: "whatsapp", phone: fixture.input.contact.value, country: "AR" });
      expect(issued).toMatchObject({ ok: true, value: { state: "completed", result: { channel: "whatsapp" } } });
      if (!issued.ok || issued.value.state !== "completed") throw new Error("Shared bucket expected the original admission challenge");
      await Promise.all(deferred);
      expect(admissionRuns[0]).toMatchObject({ authorized: 1, accepted: 1, quotaDeferred: 0 });
      expect(transport.receipts).toHaveLength(1);
      const original = issued.value.result;
      const verified = await verification.verify({ tribeId, requestId: randomUUID(), operationId: randomUUID(), challengeId: original.challengeId, verificationCode: receivedCode });
      expect(verified).toMatchObject({ ok: true, value: { state: "completed", result: { result: "verified" } } });
      if (!verified.ok || verified.value.state !== "completed" || verified.value.result.result !== "verified") throw new Error("Shared bucket expected the local admission proof");
      const submitted = await admission.createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.submit.execute({ tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: fixture.input.expectedPolicyVersion + 1, confirmed: true, phone: fixture.input.contact.value, country: "AR", proofId: verified.value.result.proofId });
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending" } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Shared bucket expected the real pending request and notice obligation");
      const admissionRequestId = submitted.value.result.admissionRequestId;

      const leaderAccounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: leader.userId, sessionId: leaderSessionId }), (_identity, run) => database.withContext(leader, run));
      const management = buildMessagingModule({ accounts: leaderAccounts, execute: (_account, run) => database.withContext(leader, run), clock: () => new Date() }).createRequestModule({ selection: "management", readSecurityConfig: async () => fixture.fixture.config });
      const diagnosticDispatcher = new ScopedConnectionDiagnosticDispatcher({ readSecurityFacts: async () => fixture.fixture.config, createDispatcher: (diagnosticScope, authorize) => {
        const worker = buildMessagingWorkModule({ diagnosticScope, authorize, execute: executeWorker, readSecurityConfig: async () => fixture.fixture.config, createSender, runtime }).useCases.dispatch;
        return { execute: async () => { const result = await worker.execute(); diagnosticRuns.push(result); return result; } };
      } });
      const diagnostic = await management.createDiagnosticIssuance(diagnosticDispatcher).execute({ tribeId, connectionId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: 1, confirmed: true, channel: "email", recipient: leader.email });
      expect(diagnostic).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "issued" } } });
      await Promise.all(deferred);
      expect(diagnosticRuns[0]).toMatchObject({ claimed: 1, authorized: 0, quotaDeferred: 1, suppressed: 0 });

      // Observe the actual cooldown rather than editing immutable challenge timestamps or request events.
      while (!await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ ready: boolean }>(sql`select clock_timestamp()>=${original.resendAllowedAt}::timestamptz as ready`)).rows[0].ready)) await delay(MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS);
      const resent = await verification.resend({ tribeId, requestId: randomUUID(), operationId: randomUUID(), challengeId: original.challengeId, useSmsAlternative: true });
      expect(resent).toMatchObject({ ok: true, value: { state: "completed", result: { channel: "sms" } } });
      await Promise.all(deferred);
      expect(admissionRuns).toHaveLength(2);
      expect(admissionRuns[1]).toMatchObject({ claimed: 1, authorized: 0, quotaDeferred: 1, suppressed: 0 });
      expect(preparations).toBe(1);
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      expect(diagnostics).toEqual([]);

      // The independent notice category uses a genuine obligation from the submitted request.
      const noticeId = randomUUID();
      await database.withContext(leader, async (transaction) => {
        const obligation = (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_notification_obligations where tribe_id=${tribeId} and request_id=${admissionRequestId}`)).rows[0];
        expect(Boolean(obligation?.id)).toBe(true);
        await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${noticeId},${tribeId},${connectionId},1,${fixture.fixture.config.environment},${fixture.fixture.config.securityEpoch},'admission_notification',${obligation.id},${leader.userId},${leader.userId},'email',${randomUUID()},${randomBytes(MESSAGING_CRYPTO.keyBytes)},'synthetic-bucket-notice','{}',2,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour')`);
      });
      const repository = new PostgresMessageDeliveryRepository(executeWorker, async (transaction) => (await transaction.execute<{ allowed: boolean }>(sql`select exists(select 1 from public.tribe_members where tribe_id=${tribeId} and user_id=${leader.userId} and role='leader' and status='active') as allowed`)).rows[0].allowed, async () => fixture.fixture.config);
      const claims = await repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: MESSAGING_DISPATCH_DEFAULT.leaseSeconds });
      expect(claims.map((claim) => claim.deliveryId)).toEqual([noticeId]);
      const notice = await repository.authorize(claims[0], randomUUID());
      expect(notice).toMatchObject({ outcome: "authorized", context: { deliveryId: noticeId } });
      await database.withContext(leader, async (transaction) => {
        expect((await transaction.execute(sql`select category,count(*)::integer as consumed from public.messaging_usage_reservations where tribe_id=${tribeId} and state='consumed' group by category order by category`)).rows).toEqual([{ category: "notification", consumed: 1 }, { category: "verification", consumed: 1 }]);
        expect((await transaction.execute(sql`select count(*)::integer as attempts from public.message_delivery_attempts where tribe_id=${tribeId}`)).rows).toEqual([{ attempts: 2 }]);
        expect((await transaction.execute(sql`select version,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id=${tribeId}`)).rows).toEqual([{ version: 2, verification_daily_limit: 1, notification_daily_limit: 1 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
