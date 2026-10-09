/** @vitest-environment node */
/** Exercises actual manual request writers, ledger recovery and indivisible SQL effects. @module admission-decision-atomicity-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { createMessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import type { AdmissionSubmissionIntent } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresAdmissionVerificationProofWriter } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-verification-proof-writer";
import { ADMISSION_PROOF_OPERATION } from "@/src/modules/academy-admissions/constants/admission-proof";
import { z } from "zod";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { recoverProtectedSubscriptionMemberships } from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-source-writer";

/** @param database - Owned synthetic branch with actual SQL/native identity. @param commercialMemberStatus - Optional readable instance removed commercially before presentation. @param contactType - Persisted original contact choice before activation. @returns A protected manual/OFF academy writer and scoped native participants. */
async function prepareManualAdmission(database: AcademyAdmissionTestDatabase, commercialMemberStatus?: "active" | "muted", contactType: "email" | "phone" = "email") {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql"]) await database.applyMigration(migration);
  await database.applyMigration("20261007005000_read_admission_reviews.sql");
  await database.applyMigration("20261007030000_capture_admission_decision_evidence.sql");
  const tribeId = randomUUID(), applicantId = randomUUID(), leaderId = randomUUID(), otherId = randomUUID();
  const applicantSessionId = randomUUID(), leaderSessionId = randomUUID(), otherSessionId = randomUUID();
  const own = { userId: leaderId, email: null };
  await database.withContext(own, async (transaction) => {
    for (const [userId, sessionId] of [[applicantId, applicantSessionId], [leaderId, leaderSessionId], [otherId, otherSessionId]]) {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic manual account',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic manual academy',${`manual-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
    if (commercialMemberStatus) await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${applicantId},'tribemate',${commercialMemberStatus})`);
    const activatedAt = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,contact_type,is_open,activated_at) values (${tribeId},${contactType},true,${activatedAt})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activatedAt} where id=${tribeId}`);
    if (commercialMemberStatus) await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${tribeId} and user_id=${applicantId}`);
  });
  const keyrings = {} as Parameters<typeof createMessagingSecurityConfig>[0]["keyrings"];
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) { const keyId = randomUUID(); keyrings[purpose] = { activeKeyId: keyId, keys: [{ id: keyId, material: randomBytes(32) }] }; }
  const config = await createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings });
  let loseCommittedReply = false;
  let omittedNoticeEvent: "approved" | "cancelled" | "expired" | null = null;
  let observeWriter = false;
  const writerPids = new Set<number>();
  const repository = new PostgresAdmissionRequestRepository(async (scope, run) => {
    const result = await database.withContext({ userId: scope.userId, email: null }, async (transaction) => {
      if (observeWriter) writerPids.add((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
      return run(transaction);
    });
    if (loseCommittedReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseCommittedReply = false; throw new Error("Synthetic original commit reply lost"); }
    return result;
  }, async () => config, (transaction) => {
    const notifications = createPostgresAdmissionNotificationObligationWriter(transaction);
    return { memberships: createAcademyApprovedMembershipWriter(transaction), notifications: { record: async (obligation) => { if (obligation.event === omittedNoticeEvent) return; await notifications.record(obligation); } } };
  });
  const submission: AdmissionSubmissionIntent = { tribeId, userId: applicantId, sessionId: applicantSessionId, requestId: randomUUID(), operationId: randomUUID(), type: "submit_admission", confirmed: true, expectedPolicyVersion: 1, source: { kind: "common" }, contact: { type: "email", value: `${applicantId}@example.test` }, proofId: null, message: null };
  return { repository, config, submission, tribeId, leaderId, leaderSessionId, otherId, otherSessionId, own, writerPids, observeWriter: () => { observeWriter = true; }, loseNextReply: () => { loseCommittedReply = true; }, omitNextApprovalNotice: () => { omittedNoticeEvent = "approved"; }, omitNextNotice: (event: "cancelled" | "expired") => { omittedNoticeEvent = event; } };
}

/** @param database - Owned branch. @param fixture - Current scoped manual request participants. @returns After a real paid source restores the original muted/active member, without any provider RPC. */
async function recoverPaidFixtureMembership(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareManualAdmission>>): Promise<void> {
  await database.applyMigration("20261006180000_guard_subscription_membership_sources.sql");
  const priceId = randomUUID(), integrationId = randomUUID(), subscriptionId = randomUUID(), providerId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${fixture.tribeId},'mercado_pago','Synthetic recovery account','connected',${randomUUID()},clock_timestamp()+interval '1 day',${fixture.leaderId})`);
    await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${priceId},${fixture.tribeId},'Synthetic membership price',1500,'ARS','monthly','active',true,${randomUUID()},${integrationId},'membership',${fixture.leaderId})`);
    await transaction.execute(sql`insert into public.tribe_member_subscriptions(id,tribe_id,user_id,price_id,payment_integration_id,mercado_pago_preapproval_id,status,product_key,price_snapshot_amount_cents,price_snapshot_currency,price_snapshot_frequency,terms_accepted_at,updated_at) values (${subscriptionId},${fixture.tribeId},${fixture.submission.userId},${priceId},${integrationId},${providerId},'active','membership',1500,'ARS','monthly',clock_timestamp(),clock_timestamp())`);
    // Deliberate own-port deferral preserves the historical pre-hook state that explicit submit must still reconcile.
    expect(await recoverProtectedSubscriptionMemberships(transaction, { providerSubscriptionIds: [providerId] }, () => ({ resolvePaidMembership: async () => undefined }))).toBe(1);
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("manual admission decision atomicity", () => {
  it("should submit a phone manual OFF request through the real account/use-case root without a phone, binding or sender", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_phone_off_submission_branch", branch: database.branch }) + "\n");
      const data = await prepareManualAdmission(database, undefined, "phone");
      const identity = { userId: data.submission.userId, sessionId: data.submission.sessionId };
      const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: null }, run) }).createManualRequestModule({ readSecurityConfig: async () => data.config });
      const result = await admissionModule.useCases.submit.execute({ tribeId: data.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 });
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", membership: null, requestSnapshot: { source: "common", needsVerification: false } } } });
      await database.withContext(data.own, async (transaction) => {
        expect((await transaction.execute(sql`select contact_type,normalized_contact,evidence_source from public.academy_admission_requests where tribe_id=${data.tribeId} and user_id=${identity.userId}`)).rows).toEqual([{ contact_type: null, normalized_contact: null, evidence_source: "none" }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${data.tribeId}) as bindings,(select count(*)::int from public.academy_admission_verification_proofs where tribe_id=${data.tribeId}) as proofs,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and user_id=${identity.userId}) as members`)).rows).toEqual([{ bindings: 0, proofs: 0, deliveries: 0, members: 0 }]);
      });
    });
  }, 240_000);

  it.each(["cancelled", "rejected"] as const)("should reject before the original %s retry boundary and permit a new request after that database instant", async (terminalStatus) => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_submission_cadence_branch", terminalStatus, branch: database.branch }) + "\n");
      const data = await prepareManualAdmission(database), requestId = randomUUID(), decisionId = randomUUID();
      const retryAt = await database.withContext(data.own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp()::text as now`)).rows[0].now;
        const row = (await transaction.execute<{ submitted_at: string; decided_at: string; retry_at: string }>(sql`select case when ${terminalStatus}='cancelled' then ${now}::timestamptz-interval '24 hours'+interval '45 seconds' else ${now}::timestamptz-interval '8 days' end::text as submitted_at,case when ${terminalStatus}='rejected' then ${now}::timestamptz-interval '7 days'+interval '45 seconds' else ${now}::timestamptz-interval '23 hours' end::text as decided_at,(${now}::timestamptz+interval '45 seconds')::text as retry_at`)).rows[0];
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${data.tribeId},${data.submission.userId},'common','email',${data.submission.contact?.value},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,${row.submitted_at},${row.submitted_at}::timestamptz+interval '30 days')`);
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,decided_at) values (${decisionId},${requestId},${data.tribeId},${data.submission.userId},1,${terminalStatus},${data.leaderId},'user',${terminalStatus==='rejected'?'manual_review':'management_cancellation'},1,1,'Original decision',${row.decided_at})`);
        await transaction.execute(sql`update public.academy_admission_requests set status=${terminalStatus},version=2,decision_id=${decisionId} where id=${requestId}`);
        await createPostgresAdmissionNotificationObligationWriter(transaction).record({ id: randomUUID(), tribeId: data.tribeId, admissionRequestId: requestId, applicantUserId: data.submission.userId, event: terminalStatus });
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version) values (${data.tribeId},'admission_request',${requestId},${terminalStatus},'original_test_decision',2)`);
        return row.retry_at;
      });
      expect(await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select clock_timestamp()<${retryAt}::timestamptz as before_boundary`)).rows)).toEqual([{ before_boundary: true }]);
      await expect(data.repository.submit({ ...data.submission, operationId: randomUUID() })).rejects.toMatchObject({ code: "admission_ineligible" });
      await database.withContext(data.own, (transaction) => transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from (${retryAt}::timestamptz-clock_timestamp())))+0.05)`));
      const created = await data.repository.submit({ ...data.submission, operationId: randomUUID() });
      expect(created).toMatchObject({ state: "completed", result: { outcome: "pending", created: true } });
      if (created.state !== "completed") throw new Error("Expected committed retry after original boundary");
      expect(created.result.admissionRequestId).not.toBe(requestId);
      expect(await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows)).toEqual([{ status: terminalStatus, version: 2 }]);
    });
  }, 240_000);

  it("should expire an original overdue request before resolving legitimate external membership and retain that paid source", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_external_expiry_branch", branch: database.branch }) + "\n");
      const fixture = await prepareManualAdmission(database, "active"), admissionRequestId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) select ${admissionRequestId},${fixture.tribeId},${fixture.submission.userId},'common','email',${fixture.submission.contact?.value},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,now-interval '31 days',now-interval '1 day' from instant`));
      await recoverPaidFixtureMembership(database, fixture);
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", result: { outcome: "already_member", membership: { role: "tribemate", status: "active" } } });
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", replayed: true });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${admissionRequestId}`)).rows).toEqual([{ status: "expired", version: 2, cancel_reason: null }]);
        expect((await transaction.execute(sql`select outcome,actor_kind,rule,membership_effect_id from public.academy_admission_decisions where request_id=${admissionRequestId}`)).rows).toEqual([{ outcome: "expired", actor_kind: "system", rule: "expired", membership_effect_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId} and applied_at is not null and revoked_at is null) as paid_effects,(select count(*)::int from public.academy_admission_notification_obligations where request_id=${admissionRequestId} and event_type='expired') as obligations,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.submission.userId} and type='admission_expired') as notices,(select count(*)::int from public.academy_admission_audit_events where resource_id=${admissionRequestId} and event_type='expired') as audits`)).rows).toEqual([{ paid_effects: 1, obligations: 1, notices: 1, audits: 1 }]);
      });
    });
    process.stdout.write(JSON.stringify({ phase: "external_expiry_cleanup_verified" }) + "\n");
  }, 240_000);

  it("should roll back external cancellation and its result when the original notice obligation cannot commit", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_external_rollback_branch", branch: database.branch }) + "\n");
      const fixture = await prepareManualAdmission(database, "muted"), created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic rollback request did not commit");
      await recoverPaidFixtureMembership(database, fixture);
      fixture.omitNextNotice("cancelled");
      const reconciliation = { ...fixture.submission, operationId: randomUUID() };
      await expect(fixture.repository.submit(reconciliation)).rejects.toMatchObject({ code: "operation_unresolved", operationId: reconciliation.operationId, cause: { code: "23514" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${created.result.admissionRequestId}`)).rows).toEqual([{ status: "pending", version: 1 }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${reconciliation.operationId}`)).rows).toEqual([{ state: "started", public_result: null }]);
        expect((await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}`)).rows).toEqual([{ role: "tribemate", status: "muted" }]);
      });
    });
    process.stdout.write(JSON.stringify({ phase: "external_rollback_cleanup_verified" }) + "\n");
  }, 240_000);

  it("should resolve a pending request after legitimate paid recovery without inventing an approval or rewriting the original replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_external_resolution_branch", branch: database.branch }) + "\n");
      const fixture = await prepareManualAdmission(database, "muted");
      const created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic external-resolution request did not commit");
      const admissionRequestId = created.result.admissionRequestId;
      await recoverPaidFixtureMembership(database, fixture);
      const reader = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      expect(await reader.readOwn(fixture.submission)).toMatchObject({ id: admissionRequestId, status: "pending", version: 1 });
      const reconciliation = { ...fixture.submission, operationId: randomUUID() };
      fixture.loseNextReply();
      const result = await fixture.repository.submit(reconciliation);
      expect(result).toMatchObject({ state: "completed", replayed: true, result: { outcome: "already_member", created: false, membership: { role: "tribemate", status: "muted" } } });
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", replayed: true, result: created.result });
      expect(await fixture.repository.submit(reconciliation)).toMatchObject({ state: "completed", replayed: true, result: result.state === "completed" ? result.result : undefined });
      await database.withContext(fixture.own, async (transaction) => {
        const request = (await transaction.execute<{ status: string; version: number; cancel_reason: string | null; submitted_at: string; expires_at: string }>(sql`select status,version,cancel_reason,submitted_at::text as submitted_at,expires_at::text as expires_at from public.academy_admission_requests where id=${admissionRequestId}`)).rows[0];
        expect(request).toMatchObject({ status: "cancelled", version: 2, cancel_reason: "external_resolution" });
        expect(new Date(request.submitted_at).toISOString()).toBe(created.result.requestSnapshot?.submittedAt);
        expect(new Date(request.expires_at).toISOString()).toBe(created.result.requestSnapshot?.expiresAt);
        expect((await transaction.execute(sql`select outcome,actor_kind,actor_user_id,rule,membership_effect_id from public.academy_admission_decisions where request_id=${admissionRequestId}`)).rows).toEqual([{ outcome: "cancelled", actor_kind: "system", actor_user_id: null, rule: "external_resolution", membership_effect_id: null }]);
        expect((await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}`)).rows).toEqual([{ role: "tribemate", status: "muted" }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_membership_effects where request_id=${admissionRequestId}) as admission_effects,(select count(*)::int from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as paid_effects,(select count(*)::int from public.academy_admission_notification_obligations where request_id=${admissionRequestId} and event_type='cancelled') as obligations,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.submission.userId} and type='admission_cancelled') as notices,(select count(*)::int from public.academy_admission_audit_events where resource_id=${admissionRequestId} and event_type='cancelled' and rule='external_resolution') as audits,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows).toEqual([{ admission_effects: 0, paid_effects: 1, obligations: 1, notices: 1, audits: 1, deliveries: 0 }]);
      });
    });
    process.stdout.write(JSON.stringify({ phase: "external_resolution_cleanup_verified" }) + "\n");
  }, 240_000);

  it("should keep one pending across original replay and a different link, then recover a committed basic approval once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database);
      const created = await fixture.repository.submit(fixture.submission);
      expect(created).toMatchObject({ state: "completed", result: { outcome: "pending", committedRequestVersion: 1, membership: null } });
      expect(created).toMatchObject({ state: "completed", result: { requestSnapshot: { status: "pending", version: 1, source: "common", submittedAt: expect.any(String), expiresAt: expect.any(String), contact: { evidenceKind: "declared", maskedValue: expect.any(String) } } } });
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic manual request did not commit");
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", replayed: true, result: created.result });
      expect(await fixture.repository.submit({ ...fixture.submission, operationId: randomUUID(), source: { kind: "personal", token: randomUUID() } })).toMatchObject({ state: "completed", result: { admissionRequestId: created.result.admissionRequestId } });
      const pendingCounts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId}) as notices,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as members`)).rows[0]);
      expect(pendingCounts).toEqual({ requests: 1, bindings: 0, notices: 1, members: 0 });
      const decision = { ...fixture.submission, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, operationId: randomUUID(), type: "decide_admission_request" as const, admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, decision: "approve" as const, internalReason: "Revisión sintética", externalMessage: "Tu ingreso fue aprobado." };
      fixture.loseNextReply();
      expect(await fixture.repository.decide(decision)).toMatchObject({ state: "completed", replayed: true, result: { status: "approved", version: 2 } });
      expect(await fixture.repository.decide(decision)).toMatchObject({ state: "completed", replayed: true, result: { status: "approved", version: 2 } });
      const approved = await database.withContext(fixture.own, async (transaction) => {
        const member = (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}`)).rows;
        const effects = (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where request_id=${created.result.admissionRequestId}) as effects,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.submission.userId}) as notices,(select count(*)::int from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as subscriptions`)).rows[0];
        return { member, effects };
      });
      const originalEvidence = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select evidence_snapshot from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}`)).rows);
      expect(originalEvidence).toEqual([{ evidence_snapshot: { kind: "declared", referenceId: null, verifiedAt: null } }]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_decisions set evidence_snapshot='{}'::jsonb where request_id=${created.result.admissionRequestId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await fixture.repository.decide(decision)).toMatchObject({ state: "completed", replayed: true });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select evidence_snapshot from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}`)).rows)).toEqual(originalEvidence);
      expect(approved).toEqual({ member: [{ role: "tribemate", status: "active" }], effects: { decisions: 1, effects: 1, notices: 1, subscriptions: 0 } });
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", replayed: true, result: created.result });
    });
  }, 240_000);

  it("should reject a foreign cancellation and allow the actual owner during pause with terminal replay only", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic manual request did not commit");
      const cancellation = { ...fixture.submission, type: "cancel_admission_request" as const, operationId: randomUUID(), admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, internalReason: null };
      await expect(fixture.repository.cancel({ ...cancellation, userId: fixture.otherId, sessionId: fixture.otherSessionId })).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect(await fixture.repository.cancel(cancellation)).toMatchObject({ state: "completed", result: { status: "cancelled", version: 2 } });
      expect(await fixture.repository.cancel(cancellation)).toMatchObject({ state: "completed", replayed: true, result: { status: "cancelled", version: 2 } });
      await expect(fixture.repository.cancel({ ...cancellation, operationId: randomUUID(), expectedVersion: 2 })).rejects.toMatchObject({ code: "request_conflict" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as members`)).rows)).toEqual([{ decisions: 1, members: 0 }]);
      await database.grantTablesToNonBypass(["session"]);
      for (const role of ["runtime", "non_bypass"] as const) {
        const reader = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, role));
        const own = await reader.readOwn(fixture.submission);
        expect(own).toMatchObject({ status: "cancelled", version: 2, retryAllowedAt: expect.any(String) });
        expect(own?.retryAllowedAt).toBe(new Date(new Date(own!.submittedAt).getTime() + ADMISSION_LIMIT.submissionCadenceMs).toISOString());
      }
    });
  }, 180_000);

  it("should expire an old pending authoritatively before a new presentation even when maintenance has not run", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), oldRequestId = randomUUID();
      const snapshot = { version: 1, verificationEpoch: 1, mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false };
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at) select ${oldRequestId},${fixture.tribeId},${fixture.submission.userId},'common',${JSON.stringify(snapshot)}::jsonb,now-interval '31 days',now-interval '1 day' from instant`));
      const created = await fixture.repository.submit(fixture.submission);
      expect(created).toMatchObject({ state: "completed", result: { outcome: "pending", committedRequestVersion: 1 } });
      if (created.state !== "completed") throw new Error("Synthetic new manual request did not commit");
      expect(created.result.admissionRequestId).not.toBe(oldRequestId);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${oldRequestId}`)).rows)).toEqual([{ status: "expired", version: 2 }]);
      expect(await fixture.repository.submit(fixture.submission)).toMatchObject({ state: "completed", replayed: true });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_decisions where request_id=${oldRequestId}) as decisions,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.submission.userId}) as notices`)).rows)).toEqual([{ requests: 2, decisions: 1, notices: 1 }]);
    });
  }, 180_000);

  it("should reach the manual writer through its request root and application use cases with native current identity", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database);
      let identity = { userId: fixture.submission.userId, sessionId: fixture.submission.sessionId };
      const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (current, run) => database.withContext({ userId: current.userId, email: null }, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config });
      const input = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, expectedPolicyVersion: 1 };
      const created = await admissionModule.useCases.submit.execute(input);
      expect(created).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", membership: null } } });
      if (!created.ok || created.value.state !== "completed" || !created.value.result.admissionRequestId) throw new Error("Synthetic root manual request did not commit");
      identity = { userId: fixture.leaderId, sessionId: fixture.leaderSessionId };
      expect(await admissionModule.useCases.decide.execute({ tribeId: fixture.tribeId, admissionRequestId: created.value.result.admissionRequestId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión desde aplicación", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved", version: 2 } } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}`)).rows)).toEqual([{ role: "tribemate", status: "active" }]);
    });
  }, 180_000);

  it("should roll back the real writer decision and basic membership when its own notice collaborator omits the obligation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic manual request did not commit");
      fixture.omitNextApprovalNotice();
      const decision = { ...fixture.submission, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, operationId: randomUUID(), type: "decide_admission_request" as const, admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, decision: "approve" as const, internalReason: "Revisión atómica", externalMessage: null };
      await expect(fixture.repository.decide(decision)).rejects.toMatchObject({ code: "operation_unresolved", operationId: decision.operationId, cause: { code: "23514" } });
      const persisted = await database.withContext(fixture.own, async (transaction) => ({
        request: (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${created.result.admissionRequestId}`)).rows,
        effects: (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${created.result.admissionRequestId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where request_id=${created.result.admissionRequestId}) as effects,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as members`)).rows,
        operation: (await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${decision.operationId}`)).rows,
      }));
      expect(persisted).toEqual({ request: [{ status: "pending", version: 1 }], effects: [{ decisions: 0, effects: 0, members: 0 }], operation: [{ state: "started", public_result: null }] });
    });
  }, 180_000);

  it("should sample pending expiry after its real request-row lock wait instead of returning a stale pending result", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), oldRequestId = randomUUID();
      const snapshot = { version: 1, verificationEpoch: 1, mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false };
      const expiresAt = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ expires_at: string }>(sql`with instant as (select clock_timestamp()+interval '20 seconds' as expires) insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at) select ${oldRequestId},${fixture.tribeId},${fixture.submission.userId},'common',${JSON.stringify(snapshot)}::jsonb,expires-interval '30 days',expires from instant returning expires_at`)).rows[0].expires_at);
      let announceLock!: () => void;
      const locked = new Promise<void>((resolve) => { announceLock = resolve; });
      fixture.observeWriter();
      const holder = database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.academy_admission_requests where id=${oldRequestId} for update`);
        announceLock();
        let observed = false;
        while (!observed) {
          await transaction.execute(sql`select pg_stat_clear_snapshot()`);
          const state = (await transaction.execute<{ blocked: boolean; live: boolean }>(sql`select exists(select 1 from pg_stat_activity where pid=any(${sql.param([...fixture.writerPids])}::int[]) and wait_event_type='Lock') as blocked,clock_timestamp()<${expiresAt}::timestamptz as live`)).rows[0];
          if (!state.live) throw new Error("Synthetic request lock wait was not observed before expiry");
          observed = state.blocked;
          if (!observed) await transaction.execute(sql`select pg_sleep(0.02)`);
        }
        await transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from ${expiresAt}::timestamptz-clock_timestamp()))+0.2)`);
      });
      await locked;
      const submitted = fixture.repository.submit(fixture.submission);
      const results = await Promise.allSettled([holder, submitted]);
      for (const result of results) if (result.status === "rejected") throw result.reason;
      const created = (results[1] as PromiseFulfilledResult<Awaited<typeof submitted>>).value;
      expect(created).toMatchObject({ state: "completed", result: { outcome: "pending" } });
      if (created.state !== "completed") throw new Error("Synthetic post-wait presentation did not complete");
      expect(created.result.admissionRequestId).not.toBe(oldRequestId);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${oldRequestId}`)).rows)).toEqual([{ status: "expired", version: 2 }]);
    });
  }, 180_000);

  it("should keep cancellation and rejection available during pause for an existing request with a real applied local proof", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database);
      const proofFixture = { userId: fixture.submission.userId, own: { userId: fixture.submission.userId, email: `${fixture.submission.userId}@example.test` }, config: fixture.config };
      for (const action of ["cancel", "reject"] as const) {
        const challenge = await seedContactVerificationChallenge(database, proofFixture);
        const tribeId = challenge.scope.tribeId;
        await database.withContext(fixture.own, async (transaction) => {
          const instant = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
          await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.leaderId},'leader','active')`);
          await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${instant})`);
          await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
        });
        const created = await fixture.repository.submit({ ...fixture.submission, tribeId, operationId: randomUUID() });
        if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic proof-bearing pending did not commit");
        const verified = await database.withContext(proofFixture.own, (transaction) => createContactVerificationWriter(transaction, proofFixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }));
        if (verified.outcome !== "verified" || !verified.proofId) throw new Error("Synthetic local proof did not verify");
        const requestId = created.result.admissionRequestId, proofId = verified.proofId, operationId = randomUUID();
        const authorize = async (transaction: Parameters<Parameters<typeof database.withContext>[1]>[0]) => {
          await transaction.execute(sql`select id from public.tribes where id=${tribeId} for update`);
          return Boolean((await transaction.execute(sql`select id from public.session where id=${fixture.submission.sessionId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp() for share`)).rows[0]);
        };
        const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(proofFixture.own, run), authorize, async () => fixture.config);
        const appliedSchema = z.object({ outcome: z.literal("applied"), requestId: z.uuid(), requestVersion: z.int().positive(), status: z.literal("pending"), proofId: z.uuid() });
        expect(await ledger.run({ actorUserId: proofFixture.userId, tribeId, operationType: ADMISSION_PROOF_OPERATION, idempotencyKey: operationId, intent: { requestId, proofId, expectedVersion: 1 } }, appliedSchema, (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, (current) => authorize(current), async () => fixture.config).applyToPending({ scope: challenge.scope, requestId, proofId, expectedRequestVersion: 1, operationId, ledgerId }))).toMatchObject({ state: "completed", result: { outcome: "applied", requestVersion: 2 } });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${tribeId}`));
        const common = { tribeId, admissionRequestId: requestId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: 2, confirmed: true as const };
        const result = action === "cancel" ? await fixture.repository.cancel({ ...common, userId: fixture.submission.userId, sessionId: fixture.submission.sessionId, type: "cancel_admission_request", internalReason: null })
          : await fixture.repository.decide({ ...common, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, type: "decide_admission_request", decision: "reject", internalReason: "Revisión durante pausa", externalMessage: null });
        expect(result).toMatchObject({ state: "completed", result: { status: action === "cancel" ? "cancelled" : "rejected", version: 3 } });
        expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${proofId}`)).rows)).toEqual([{ status: "applied", applied_request_id: requestId }]);
        const history = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ evidence_snapshot: { kind: string; referenceId: string; verifiedAt: string }; original_verified_at: string }>(sql`select decision.evidence_snapshot,proof.verified_at::text as original_verified_at from public.academy_admission_decisions decision join public.academy_admission_verification_proofs proof on proof.id=${proofId} where decision.request_id=${requestId}`)).rows[0]);
        expect(history.evidence_snapshot).toEqual({ kind: "local", referenceId: proofId, verifiedAt: new Date(history.original_verified_at).toISOString() });
      }
    });
  }, 300_000);

  it("should recover only an actually recorded own operation without claiming leases and deny a revoked reviewer", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic recovery request did not commit");
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      const reader = new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const own = fixture.submission;
      await database.grantTablesToNonBypass(["session", "tribes", "tribe_members", "tribe_invitations", "academy_admission_requests", "academy_admission_operations"]);
      const ordinaryReader = new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, "non_bypass"));
      expect(await ordinaryReader.read(own, own.operationId)).toMatchObject({ operationType: "submit_admission", operation: { state: "completed", result: { requestSnapshot: { status: "pending", version: 1 } } } });
      expect(await reader.read(own, fixture.submission.operationId)).toMatchObject({ operationType: "submit_admission", operation: { state: "completed", replayed: true, result: created.result } });
      expect(await reader.read(own, randomUUID())).toBeNull();
      expect(await reader.read({ ...own, userId: fixture.otherId, sessionId: fixture.otherSessionId }, fixture.submission.operationId)).toBeNull();
      expect(await ordinaryReader.read({ ...own, userId: fixture.otherId, sessionId: fixture.otherSessionId }, own.operationId)).toBeNull();
      const decision = { ...own, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, operationId: randomUUID(), type: "decide_admission_request" as const, admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, decision: "approve" as const, internalReason: "Revisión de recuperación", externalMessage: null };
      await fixture.repository.decide(decision);
      expect(await reader.read(own, fixture.submission.operationId)).toMatchObject({ operation: { state: "completed", result: { requestSnapshot: { status: "pending", version: 1 } } } });
      expect(await reader.read(decision, decision.operationId)).toMatchObject({ operationType: "decide_admission_request", operation: { result: { status: "approved", version: 2 } } });
      const otherSubmission = { ...own, userId: fixture.otherId, sessionId: fixture.otherSessionId, contact: { type: "email" as const, value: `${fixture.otherId}@example.test` }, requestId: randomUUID(), operationId: randomUUID() };
      const otherCreated = await fixture.repository.submit(otherSubmission);
      if (otherCreated.state !== "completed" || !otherCreated.result.admissionRequestId) throw new Error("Synthetic management cancellation request did not commit");
      const managementCancel = { ...decision, operationId: randomUUID(), type: "cancel_admission_request" as const, admissionRequestId: otherCreated.result.admissionRequestId, internalReason: "Corrección por gestión" };
      await fixture.repository.cancel(managementCancel);
      expect(await ordinaryReader.read(managementCancel, managementCancel.operationId)).toMatchObject({ operationType: "cancel_admission_request", operation: { state: "completed", result: { status: "cancelled", version: 2 } } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.leaderId}`));
      await expect(reader.read(decision, decision.operationId)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(ordinaryReader.read(managementCancel, managementCancel.operationId)).rejects.toMatchObject({ code: "permission_denied" });
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner,lease_until from public.academy_admission_operations where actor_user_id=${own.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${own.operationId}`)).rows);
      await reader.read(own, own.operationId);
      await ordinaryReader.read(own, own.operationId);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner,lease_until from public.academy_admission_operations where actor_user_id=${own.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${own.operationId}`)).rows)).toEqual(before);
      const failedOperationId = randomUUID();
      await expect(fixture.repository.cancel({ ...own, operationId: failedOperationId, type: "cancel_admission_request", admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, internalReason: null })).rejects.toMatchObject({ code: "request_conflict" });
      expect(await reader.read(own, failedOperationId)).toMatchObject({ operationType: "cancel_admission_request", operation: { state: "completed", operationId: failedOperationId, result: { outcome: "denied", code: "request_conflict", admissionRequestId: created.result.admissionRequestId } } });
      await expect(fixture.repository.cancel({ ...own, operationId: own.operationId, type: "cancel_admission_request", admissionRequestId: created.result.admissionRequestId, expectedVersion: 1, internalReason: null })).rejects.toMatchObject({ code: "request_conflict" });
      await expect(reader.read(own, own.operationId)).rejects.toMatchObject({ code: "idempotency_conflict" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${own.sessionId}`));
      await expect(reader.read(own, failedOperationId)).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, 240_000);

  it("should advance only retry metadata with exact current leader recency, preserve terminal effects and replay before CAS", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareManualAdmission(database), created = await fixture.repository.submit(fixture.submission);
      if (created.state !== "completed" || !created.result.admissionRequestId) throw new Error("Synthetic retry request did not commit");
      const requestId = created.result.admissionRequestId;
      await fixture.repository.decide({ ...fixture.submission, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, operationId: randomUUID(), type: "decide_admission_request", admissionRequestId: requestId, expectedVersion: 1, decision: "reject", internalReason: "Corrección necesaria", externalMessage: "Revisá los datos." });
      const retry = { ...fixture.submission, userId: fixture.leaderId, sessionId: fixture.leaderSessionId, operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 2, internalReason: "Corrección autorizada" };
      await expect(fixture.repository.allowRetry(retry)).rejects.toMatchObject({ code: "reauthentication_required" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_operations where idempotency_key=${retry.operationId}`)).rows)).toEqual([]);
      const accountId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + 540_000);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.leaderId},'google',${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${fixture.leaderSessionId},${fixture.leaderId},${accountId},${subject},${`${fixture.leaderId}@example.test`})`);
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.leaderId},${fixture.leaderSessionId},${accountId},${subject},${fixture.tribeId},'advance_admission_retry',${requestId},'/synthetic-retry',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.leaderId},${accountId},${subject},${fixture.leaderSessionId},${fixture.tribeId},'advance_admission_retry',${requestId},${now},${now},${validUntil})`);
      });
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,decision_id,submitted_at,expires_at from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const result = await fixture.repository.allowRetry(retry);
      expect(result).toMatchObject({ state: "completed", result: { admissionRequestId: requestId, version: 3, retryAllowedAt: expect.any(String) } });
      expect(await fixture.repository.allowRetry(retry)).toMatchObject({ state: "completed", replayed: true, result: result.state === "completed" ? result.result : undefined });
      await expect(fixture.repository.allowRetry({ ...retry, operationId: randomUUID() })).rejects.toMatchObject({ code: "request_conflict" });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.leaderId, sessionId: fixture.leaderSessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
      const requestModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config });
      expect(await requestModule.useCases.allowRetry.execute({ ...retry, operationId: randomUUID(), expectedVersion: 3 })).toMatchObject({ ok: true, value: { state: "completed", result: { version: 3 } } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,decision_id,submitted_at,expires_at from public.academy_admission_requests where id=${requestId}`)).rows[0])).toEqual(before);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.submission.userId}) as members,(select count(*)::int from public.academy_admission_audit_events where resource_id=${requestId} and event_type='retry_allowed') as retry_audit`)).rows)).toEqual([{ decisions: 1, members: 0, retry_audit: 1 }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_requests set retry_allowed_at=clock_timestamp()+interval '6 days',version=version+1 where id=${requestId}`));
      const expiryBaseline = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,retry_allowed_at from public.academy_admission_requests where id=${requestId}`)).rows);
      let currentTransaction: Parameters<Parameters<typeof database.withContext>[1]>[0] | undefined;
      let securityReads = 0;
      let delayAccountDelivery = false;
      let delayedActualAccount = false;
      let accountsReadAfterDeadline = 0;
      // The own executor decorates delivery of an actual pg result; no SDK, SQL or auth result is mocked.
      const expiringWriter = new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, async (transaction) => {
        currentTransaction = transaction;
        const observed = new Proxy(transaction, { get(target, property, receiver) {
          if (property !== "execute") return Reflect.get(target, property, receiver);
          return async (...argumentsList: Parameters<typeof transaction.execute>) => {
            const response = await transaction.execute(...argumentsList);
            const accountRow = response.rows[0];
            if (delayAccountDelivery && accountRow && accountRow.session_id === fixture.leaderSessionId && typeof accountRow.expires_at === "string") {
              accountsReadAfterDeadline += 1;
              if (accountsReadAfterDeadline === 2) {
                delayAccountDelivery = false;
                delayedActualAccount = true;
                await transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from ${accountRow.expires_at}::timestamptz-clock_timestamp()))+0.2)`);
              }
            }
            return response;
          };
        } });
        return run(observed);
      }), async () => {
        securityReads += 1;
        if (securityReads === 3) {
          if (!currentTransaction) throw new Error("Synthetic retry transaction was unavailable");
          await currentTransaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '15 seconds' where id=${fixture.leaderSessionId}`);
          delayAccountDelivery = true;
        }
        return fixture.config;
      }, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: createPostgresAdmissionNotificationObligationWriter(transaction) }));
      const expiredIntent = { ...retry, operationId: randomUUID(), expectedVersion: 4 };
      await expect(expiringWriter.allowRetry(expiredIntent)).rejects.toMatchObject({ code: "authentication_required" });
      expect(delayedActualAccount).toBe(true);
      expect(accountsReadAfterDeadline).toBe(2);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,retry_allowed_at from public.academy_admission_requests where id=${requestId}`)).rows)).toEqual(expiryBaseline);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${expiredIntent.operationId}`)).rows)).toEqual([{ state: "started", public_result: null }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as retry_audit from public.academy_admission_audit_events where resource_id=${requestId} and event_type='retry_allowed'`)).rows)).toEqual([{ retry_audit: 1 }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where intent_id=${intentId}`));
      await expect(fixture.repository.allowRetry({ ...retry, operationId: randomUUID(), expectedVersion: 4 })).rejects.toMatchObject({ code: "reauthentication_required" });
    });
  }, 240_000);
});
