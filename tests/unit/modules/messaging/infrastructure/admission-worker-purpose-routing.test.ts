/** @vitest-environment node */
/** Exercises the actual bounded worker with native OTP, group email and a visibly unsupported legacy source. @module admission-worker-purpose-routing-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { prepareContactVerificationIssuer, recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { ZAVU_DELIVERY_ENDPOINT, VERIFICATION_MESSAGE_COPY } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { NOTIFICATION_REFERENCE_SUPPRESSION_AUDIT_RULE } from "@/src/modules/messaging/constants/notification-group-authorization";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native composed worker purpose routing", () => {
  it("should dispatch native code and complete group email across two tribes after suppressing an older reference-only queue head without a marker or queue starvation", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const notification = await prepareAdmissionNotificationGroupAuthority(database);
      const oldSources = await notification.createSources(1), legacyId = randomUUID();
      // This old reference-only row is structurally coherent; its random MAC is not claimed authentic or opened by the worker.
      await notification.execute((transaction) => transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at)
        values (${legacyId},${notification.tribeId},${notification.connectionId},1,${notification.keys.config.environment},${notification.keys.config.securityEpoch},'admission_notification',${oldSources.sources[0].obligation_id},${notification.leaderId},${notification.leaderId},'email',${randomUUID()},${randomBytes(MESSAGING_CRYPTO.keyBytes)},${notification.keys.config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].activeKeyId},jsonb_build_object('obligationId',${oldSources.sources[0].obligation_id}::text,'recipientRef',${notification.leaderId}::text,'senderId',(select email_sender_id from public.messaging_connection_versions where connection_id=${notification.connectionId} and version=1)),1,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour')`));
      const [group] = await notification.queueIndividual(1);
      const original = await notification.execute(async (transaction) => (await transaction.execute<{ subject: string; text: string; sender: string; idempotency: string; deadline: Date | string }>(sql`select frozen_intent->>'subject' as subject,frozen_intent->>'text' as text,frozen_intent->>'senderId' as sender,idempotency_key as idempotency,deadline_at as deadline from public.message_deliveries where id=${group.deliveryId}`)).rows[0]);
      const verification = await prepareContactVerificationIssuer(database, ADMISSION_VERIFICATION_PURPOSE.admission, false, randomUUID(), notification.keys.config);
      const issued = await verification.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Mixed native worker did not issue its original code delivery");
      const codeDeliveryId = issued.result.deliveryId;
      const verificationCode = await recoverTestVerificationCode(database, verification, issued.result.challengeId);
      const deferred: Promise<void>[] = [], diagnostics: MessagingDispatchDiagnostic[] = [];
      const requests: { sender: string | null; body: Record<string, unknown> }[] = [];
      const locks: { deliveryId: string; locked: boolean; databaseCode?: string | null }[] = [];
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: async (request) => {
        const body = await request.json() as Record<string, unknown>;
        const sender = request.headers.get("Zavu-Sender"), grouped = sender === original.sender;
        const deliveryId = grouped ? group.deliveryId : codeDeliveryId, actorUserId = grouped ? notification.leaderId : verification.userId;
        requests.push({ sender, body });
        // Probe the exact resource through its actual owner; failed assertions must remain outside SDK error mapping.
        try {
          const lock = await notification.deliveryExecute(actorUserId, (transaction) => transaction.execute(sql`select id from public.message_deliveries where id=${deliveryId} for update nowait`));
          locks.push({ deliveryId, locked: lock.rows.length === 1 });
        } catch (error) {
          const cause = error instanceof Error && error.cause ? error.cause : error;
          const databaseCode = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : null;
          locks.push({ deliveryId, locked: false, databaseCode });
        }
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } });
      } }]);
      const healthStartedAt = Date.now();
      const backendHealth = await notification.preparationExecute(async (transaction) => (await transaction.execute<{ active: number; waiting_on_lock: number }>(sql`select count(*) filter(where pid<>pg_backend_pid() and state='active')::int as active,count(*) filter(where pid<>pg_backend_pid() and wait_event_type='Lock')::int as waiting_on_lock from pg_stat_activity where datname=current_database()`)).rows[0]);
      const health = { ...backendHealth, roundTripMs: Date.now() - healthStartedAt };
      const executionSamples: { purpose: string | null; startedAfterMs: number; durationMs: number }[] = [], traceStartedAt = Date.now();
      /** @param actorUserId - Original native principal. @param run - Unmodified actual transaction. @returns The real guarded result, with safe elapsed metadata only. */
      const execute = async <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>): Promise<Result> => {
        const startedAt = Date.now();
        try { return await notification.deliveryExecute(actorUserId, run); }
        finally { executionSamples.push({ purpose: actorUserId === notification.leaderId ? NOTIFICATION_DELIVERY_RECOVERY_PURPOSE : actorUserId === verification.userId ? ADMISSION_VERIFICATION_PURPOSE.admission : null, startedAfterMs: startedAt - traceStartedAt, durationMs: Date.now() - startedAt }); }
      };
      const adapters = createRegisteredMessagingAdapters({ execute: (context, run) => execute(context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery ? context.contributingLeaderUserId : context.actorUserId, run), readSecurityFacts: async () => ({ environment: notification.keys.config.environment, securityEpoch: notification.keys.config.securityEpoch, recoveryLocked: false }), authorizeDeliveryResource: notification.guards.marked, fetch: transport.fetch });
      const worker = buildMessagingWorkModule({ execute, authorize: async () => true, readSecurityConfig: notification.readSecurityConfig, createSender: adapters.createSender, createNotificationSender: adapters.createNotificationSender, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (diagnostic) => { diagnostics.push(diagnostic); } } });
      const result = await worker.useCases.dispatch.execute();
      for (let deferredIndex = 0; deferredIndex < deferred.length; deferredIndex += 1) await deferred[deferredIndex];
      const phaseSamples = await notification.preparationExecute(async (transaction) => (await transaction.execute<{ tribe_id: string; phase: string; duration_ms: string }>(sql`select tribe_id,phase,duration_ms::text from public.messaging_dispatch_phase_samples where tribe_id in (${notification.tribeId},${verification.scope.tribeId}) order by phase,duration_ms`)).rows);
      Object.assign(task.meta, { nativeRouting: { result, health, executionSamples, phaseSamples, routing: { notificationDeliveryId: group.deliveryId, codeDeliveryId, legacyId }, transport: transport.receipts, locks, diagnostics: diagnostics.map((diagnostic) => ({ stage: diagnostic.stage, deliveryId: diagnostic.deliveryId, causeName: diagnostic.cause instanceof Error ? diagnostic.cause.name : null, code: typeof diagnostic.cause === "object" && diagnostic.cause !== null && "code" in diagnostic.cause && typeof diagnostic.cause.code === "string" ? diagnostic.cause.code : null })) } });
      expect(result).toMatchObject({ claimed: 3, authorized: 2, accepted: 2, unknown: 0, suppressed: 1, unresolved: 0, deadlineReached: false, workerOutcome: "completed", observationOutcome: "recorded" });
      expect(requests).toHaveLength(2);
      expect(locks).toEqual(expect.arrayContaining([{ deliveryId: group.deliveryId, locked: true }, { deliveryId: codeDeliveryId, locked: true }]));
      const groupRequest = requests.find((request) => request.sender === original.sender), codeRequest = requests.find((request) => request.sender === verification.emailSenderId);
      expect(groupRequest?.body).toMatchObject({ to: `${notification.leaderId}@gmail.com`, subject: original.subject, text: original.text, idempotencyKey: original.idempotency, channel: "email", fallbackEnabled: false });
      expect(groupRequest?.body).not.toHaveProperty("content");
      expect(groupRequest?.body).not.toHaveProperty("code");
      expect(codeRequest?.body).toMatchObject({ to: verification.own.email, channel: "email", messageType: "text", subject: VERIFICATION_MESSAGE_COPY.subject, text: `${VERIFICATION_MESSAGE_COPY.prefix}${verificationCode.code}${VERIFICATION_MESSAGE_COPY.suffix}`, fallbackEnabled: false });
      expect(diagnostics).toEqual([]);
      expect(await notification.snapshot(legacyId)).toMatchObject({ state: "suppressed", attempts: 0, reservations: 0 });
      expect(await notification.snapshot(group.deliveryId)).toMatchObject({ state: "accepted", attempts: 1, reservations: 1 });
      const persisted = await notification.preparationExecute(async (transaction) => ({
        deliveries: (await transaction.execute<{ id: string; state: string; purpose: string; notification_group_id: string | null }>(sql`select id,state,purpose,notification_group_id from public.message_deliveries where id in (${legacyId},${group.deliveryId},${codeDeliveryId}) order by id`)).rows,
        budgets: (await transaction.execute<{ category: string; state: string; count: number }>(sql`select category,state,count(*)::int as count from public.messaging_usage_reservations where delivery_id in (${legacyId},${group.deliveryId},${codeDeliveryId}) group by category,state order by category`)).rows,
        runs: (await transaction.execute<{ tribe_id: string; outcome: string; counters: { accepted: number; suppressed: number } }>(sql`select tribe_id,outcome,counters from public.messaging_dispatch_runs order by tribe_id`)).rows,
        audit: (await transaction.execute<{ event_type: string; rule: string; cause: string }>(sql`select event_type,rule,cause from public.academy_admission_audit_events where resource_id=${legacyId} and rule=${NOTIFICATION_REFERENCE_SUPPRESSION_AUDIT_RULE}`)).rows,
        original: (await transaction.execute<{ idempotency: string; deadline: Date | string }>(sql`select idempotency_key as idempotency,deadline_at as deadline from public.message_deliveries where id=${group.deliveryId}`)).rows[0],
      }));
      expect(persisted.deliveries).toEqual(expect.arrayContaining([{ id: group.deliveryId, state: "accepted", purpose: "admission_notification", notification_group_id: group.groupId }, { id: codeDeliveryId, state: "accepted", purpose: "admission", notification_group_id: null }, { id: legacyId, state: "suppressed", purpose: "admission_notification", notification_group_id: null }]));
      expect(persisted.budgets).toEqual([{ category: "notification", state: "consumed", count: 1 }, { category: "verification", state: "consumed", count: 1 }]);
      expect(persisted.runs).toHaveLength(2);
      expect(persisted.runs).toEqual(expect.arrayContaining([expect.objectContaining({ tribe_id: notification.tribeId, outcome: "completed", counters: expect.objectContaining({ accepted: 1, suppressed: 1 }) }), expect.objectContaining({ tribe_id: verification.scope.tribeId, outcome: "completed", counters: expect.objectContaining({ accepted: 1, suppressed: 0 }) })]));
      expect(persisted.audit).toEqual([{ event_type: "delivery_suppressed", rule: NOTIFICATION_REFERENCE_SUPPRESSION_AUDIT_RULE, cause: MESSAGING_ERROR_CODE.resourceUnavailable }]);
      expect(persisted.original).toEqual({ idempotency: original.idempotency, deadline: original.deadline });
      expect(await worker.useCases.dispatch.execute()).toMatchObject({ claimed: 0, accepted: 0, unknown: 0, suppressed: 0, unresolved: 0 });
      await Promise.all(deferred);
      expect(transport.receipts).toHaveLength(2);
      expect(transport.deniedRequests).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should deny a forged native purpose or group before any credential exposure while retaining the exact original marker and charged budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      const [group] = await fixture.queueIndividual(1);
      const authorized = await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Routing provenance fixture did not obtain its original marker");
      expect(authorized.context).toMatchObject({ deliveryPurpose: "admission_notification", notificationGroupId: group.groupId });
      await expect(fixture.secrets.loadAuthorizedSecret({ ...authorized.context, deliveryPurpose: ADMISSION_VERIFICATION_PURPOSE.admission, notificationGroupId: null })).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
      await expect(fixture.secrets.loadAuthorizedSecret({ ...authorized.context, notificationGroupId: randomUUID() })).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
      expect(await fixture.snapshot(group.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 0, suppressions: 0 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
