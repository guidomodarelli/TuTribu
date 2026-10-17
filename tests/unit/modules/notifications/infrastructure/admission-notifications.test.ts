/** @vitest-environment node */
/** Exercises admission outcomes, public observations and their real notification obligations on an owned PostgreSQL branch. @module admission-notifications-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { prepareAdmissionNotificationResolution } from "@/tests/support/admission-notification-resolution-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { ZAVU_DELIVERY_ENDPOINT } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission outcomes and notifications", () => {
  it("should expose one automatic approval in activity and metrics without a manual review when its original submission is replayed", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given an actual trusted account, enabled exact list entry and active admission policy.
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      const applicant = await createApplicant();
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const entry = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null });
      expect(entry.state).toBe("completed");
      const reader = new PostgresAdmissionActivityReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const scope = { tribeId: fixture.tribeId, userId: fixture.userId, sessionId: fixture.sessionId, requestId: randomUUID() };
      const before = await reader.readMetrics(scope);
      expect(before.requests).toMatchObject({ pending: 0, approved: 0 });
      expect(before.reviews).toEqual({ automatic: 0, manual: 0 });

      // When the real composed submit owner confirms its indivisible system approval.
      const submitted = await applicant.commands.submit.execute(applicant.input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", replayed: false, result: { outcome: "admitted", created: true, membership: { role: "tribemate", status: "active" } } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Automatic admission did not return its original confirmed request");
      const requestId = submitted.value.result.admissionRequestId;
      /** @returns Only persisted decision, obligation and review-work counts; no contact, credential or private message is selected. */
      const readOutcome = () => database.withContext(fixture.own, async (transaction) => ({
        request: (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId} and tribe_id=${fixture.tribeId}`)).rows,
        decisions: (await transaction.execute(sql`select actor_kind,actor_user_id,rule,outcome from public.academy_admission_decisions where request_id=${requestId} and tribe_id=${fixture.tribeId}`)).rows,
        obligations: (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where request_id=${requestId} and tribe_id=${fixture.tribeId} order by id`)).rows,
        reviewerNotices: (await transaction.execute(sql`select count(*)::int as count from public.notifications notice join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id and obligation.tribe_id=notice.tribe_id where obligation.request_id=${requestId} and obligation.tribe_id=${fixture.tribeId} and notice.admission_audience='reviewer'`)).rows,
        pendingReviews: (await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId} and status='pending'`)).rows,
        deliveries: (await transaction.execute(sql`select count(*)::int as count from public.message_deliveries where tribe_id=${fixture.tribeId}`)).rows,
      }));
      const original = await readOutcome();
      expect(original).toMatchObject({ request: [{ status: "approved", version: expect.any(Number) }], decisions: [{ actor_kind: "system", actor_user_id: null, rule: "automatic", outcome: "approved" }], obligations: [{ id: expect.any(String), event_type: "approved" }], reviewerNotices: [{ count: 0 }], pendingReviews: [{ count: 0 }], deliveries: [{ count: 0 }] });
      expect(original.obligations).toHaveLength(1);
      const metrics = await reader.readMetrics(scope);
      expect(metrics.requests).toMatchObject({ pending: 0, approved: 1 });
      expect(metrics.reviews).toEqual({ automatic: 1, manual: 0 });
      const activity = await reader.readActivity(scope, { limit: 50, resourceType: "admission_request", resourceId: requestId });
      const approvals = activity.items.filter((event) => event.eventType === "approved");
      expect(approvals).toHaveLength(1);
      expect(approvals[0]).toMatchObject({ resourceId: requestId, rule: "automatic", operationId: expect.any(String) });
      expect(JSON.stringify({ activity, metrics })).not.toContain(applicant.email);

      // Then replay retains the same visible approval, counts and obligations without a review or delivery.
      expect(await applicant.commands.submit.execute(applicant.input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      expect(await readOutcome()).toEqual(original);
      const replayMetrics = await reader.readMetrics(scope);
      expect(replayMetrics.requests).toEqual(metrics.requests);
      expect(replayMetrics.reviews).toEqual(metrics.reviews);
      const replayActivity = await reader.readActivity(scope, { limit: 50, resourceType: "admission_request", resourceId: requestId });
      expect(replayActivity.items).toEqual(activity.items);
      Object.assign(task.meta, { nativeAutomaticAdmission: { approved: 1, automatic: 1, manual: 0, pendingReviews: 0, reviewerNotices: 0, realMessages: 0, originalReplayed: true } });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should preserve an actual rejected decision and its applicant obligation without another POST when a new processor follows an uncertain email failure", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a real submit and rejection whose transactional applicant obligation already committed.
      const prepared = await prepareAdmissionNotificationResolution(database);
      const { fixture, requestId, deliveryId } = prepared;
      /** @returns Only durable request, decision, obligation and membership facts, excluding private review text and contact evidence. */
      const readSources = () => database.withContext(fixture.own, async (transaction) => ({
        request: (await transaction.execute(sql`select id,status,version,decision_id from public.academy_admission_requests where id=${requestId} and tribe_id=${fixture.tribeId}`)).rows,
        decisions: (await transaction.execute(sql`select id,outcome,actor_kind from public.academy_admission_decisions where request_id=${requestId} and tribe_id=${fixture.tribeId} order by id`)).rows,
        obligations: (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where request_id=${requestId} and tribe_id=${fixture.tribeId} order by id`)).rows,
        membership: (await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${prepared.applicant.userId}`)).rows,
      }));
      /** @returns Original delivery identity, group and retry bound without ciphertext, recipient or credential material. */
      const readOriginal = () => prepared.deliveryExecute(null, async (transaction) => (await transaction.execute(sql`select id,notification_group_id,idempotency_key,deadline_at::text,deadline_at<=created_at+interval '24 hours' as within_retry_window from public.message_deliveries where id=${deliveryId} and tribe_id=${fixture.tribeId}`)).rows[0]);
      /** @returns Only original state and consumed attempts/reservations after each independent processor. */
      const readDelivery = () => prepared.deliveryExecute(null, async (transaction) => (await transaction.execute(sql`select delivery.state,(select count(*)::int from public.message_delivery_attempts where delivery_id=delivery.id) as attempts,(select count(*)::int from public.messaging_usage_reservations where delivery_id=delivery.id and state='consumed') as reservations from public.message_deliveries delivery where delivery.id=${deliveryId} and delivery.tribe_id=${fixture.tribeId}`)).rows[0]);
      const originalSources = await readSources(), original = await readOriginal();
      expect(originalSources).toMatchObject({ request: [{ id: requestId, status: "rejected" }], decisions: [{ outcome: "rejected", actor_kind: "user" }], membership: [{ count: 0 }] });
      expect(originalSources.obligations).toContainEqual({ id: prepared.obligationId, event_type: "rejected" });
      expect(original).toMatchObject({ id: deliveryId, notification_group_id: prepared.groupId, within_retry_window: true });
      const privateUpstreamMessage = `synthetic-resolution-outage-${randomUUID()}`;
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: () => Response.json({ error: privateUpstreamMessage }, { status: 503 }) }]);
      const deferred: Promise<void>[] = [];
      const diagnostics: { stage: string; causeName: string | null }[] = [];
      Object.assign(task.meta, { nativeResolutionDiagnostics: diagnostics });
      /** @returns Fresh actual repository/SDK composition sharing only the already committed database original. */
      const createProcessor = () => {
        const adapters = createRegisteredMessagingAdapters({ execute: (context, run) => prepared.deliveryExecute(context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery ? context.contributingLeaderUserId : context.actorUserId, run), readSecurityFacts: async () => ({ environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, recoveryLocked: false }), authorizeDeliveryResource: prepared.guards.marked, fetch: transport.fetch });
        return buildMessagingWorkModule({ execute: prepared.deliveryExecute, authorize: async () => true, readSecurityConfig: prepared.readSecurityConfig, createSender: adapters.createSender, createNotificationSender: adapters.createNotificationSender, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (diagnostic) => { diagnostics.push({ stage: diagnostic.stage, causeName: diagnostic.cause instanceof Error ? diagnostic.cause.name : null }); } } });
      };

      // When its actual SDK attempt receives a controlled 503 after the native marker.
      const failed = await createProcessor().useCases.dispatch.execute();
      for (let index = 0; index < deferred.length; index += 1) await deferred[index];
      expect(failed).toMatchObject({ claimed: 1, authorized: 1, accepted: 0, unknown: 1, unresolved: 0 });
      expect(JSON.stringify(failed)).not.toContain(privateUpstreamMessage);
      expect(await readDelivery()).toEqual({ state: "unknown", attempts: 1, reservations: 1 });
      expect(await readSources()).toEqual(originalSources);
      expect(await readOriginal()).toEqual(original);

      // Then another processor retains the rejection and original uncertainty without resending.
      const restarted = await createProcessor().useCases.dispatch.execute();
      for (let index = 0; index < deferred.length; index += 1) await deferred[index];
      expect(restarted).toMatchObject({ claimed: 0, accepted: 0, unknown: 0, unresolved: 0 });
      expect(await readDelivery()).toEqual({ state: "unknown", attempts: 1, reservations: 1 });
      expect(await readSources()).toEqual(originalSources);
      expect(await readOriginal()).toEqual(original);
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      Object.assign(task.meta, { nativeResolutionOutage: { first: failed, restarted, requestsPreserved: true, decisionsPreserved: true, obligationsPreserved: true, originalDeadlinePreserved: true, realMessages: 0 } });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
