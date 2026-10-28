/** @vitest-environment node */
/** Exercises terminal-content and live/retired security retention through real guarded PostgreSQL transactions. @module admission-private-data-retention-tests */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPrivateRetention } from "@/tests/support/admission-private-retention-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAdmissionPrivateDataRetentionModule } from "@/src/modules/academy-admissions/setup";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { assertUnreservedAdmissionContact } from "@/src/modules/academy-admissions/infrastructure/repositories/assert-unreserved-admission-contact";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission private retention", () => {
  it("should minimize only due terminal contents, purge live/retired audit within one global ceiling and retain original authority and public history", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionPrivateRetention(database), backend = { userId: null, email: null };
      const bearer = randomUUID();
      const authorize = createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/admissions", { headers: { authorization: `Bearer ${bearer}` } }), () => bearer);
      const retention = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize, readRecoveryLock: async () => false }).useCases.purgePrivateData;
      const before = await database.withContext(backend, async (transaction) => ({
        binding: (await transaction.execute(sql`select id,owner_user_id,owner_reference_id,first_request_id,first_proof_id,normalized_contact,contact_fingerprint,fingerprint_key_id from public.academy_admission_contact_bindings where id=${fixture.bindingId}`)).rows[0],
        evidence: (await transaction.execute(sql`select evidence_snapshot from public.academy_admission_decisions where id=${fixture.oldDecisionId}`)).rows[0],
        fresh: (await transaction.execute(sql`select contact_type,normalized_contact,applicant_message,status,version from public.academy_admission_requests where id=${fixture.freshRequestId}`)).rows[0],
        pending: (await transaction.execute(sql`select contact_type,normalized_contact,applicant_message,status,version from public.academy_admission_requests where id=${fixture.pendingRequestId}`)).rows[0],
      }));
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        try {
          await client.connect();
          await client.query("BEGIN");
          await client.query("select set_config('app.current_user_id','',true)");
          await expect(client.query("update public.academy_admission_requests set binding_id=null where id=$1", [fixture.oldRequestId])).rejects.toMatchObject({ code: "23514", routine: "exec_stmt_raise" });
        } finally { await client.query("ROLLBACK"); await client.end(); }
      });
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`select * from public.purge_admission_private_data(1,1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`select * from public.purge_admission_private_data(0,1)`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`update public.academy_admission_requests set private_material_minimized_at=clock_timestamp(),contact_type=null,normalized_contact=null,contact_fingerprint=null,fingerprint_key_id=null,applicant_message=null where id=${fixture.freshRequestId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      // Clearing only the request cannot commit while its original decision still contains messages.
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`update public.academy_admission_requests set private_material_minimized_at=clock_timestamp(),contact_type=null,normalized_contact=null,contact_fingerprint=null,fingerprint_key_id=null,applicant_message=null where id=${fixture.oldRequestId}`))).rejects.toMatchObject({ code: "23514" });
      expect(await retention.execute({ requestLimit: 1, auditLimit: 1 })).toEqual({ requestsMinimized: 1, auditEventsPurged: 0, archivedAuditEventsPurged: 1, remainingRequests: true, remainingAuditEvents: true });
      expect(await retention.execute({ requestLimit: 1, auditLimit: 1 })).toEqual({ requestsMinimized: 1, auditEventsPurged: 1, archivedAuditEventsPurged: 0, remainingRequests: false, remainingAuditEvents: false });
      expect(await retention.execute({ requestLimit: 1, auditLimit: 1 })).toEqual({ requestsMinimized: 0, auditEventsPurged: 0, archivedAuditEventsPurged: 0, remainingRequests: false, remainingAuditEvents: false });
      await database.withContext(backend, async (transaction) => {
        expect((await transaction.execute(sql`select contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,applicant_message,status,version,private_material_minimized_at is not null as minimized,binding_id from public.academy_admission_requests where id=${fixture.oldRequestId}`)).rows).toEqual([{ contact_type: null, normalized_contact: null, contact_fingerprint: null, fingerprint_key_id: null, applicant_message: null, status: "rejected", version: 3, minimized: true, binding_id: fixture.bindingId }]);
        expect((await transaction.execute(sql`select internal_reason,external_message,evidence_snapshot from public.academy_admission_decisions where id=${fixture.oldDecisionId}`)).rows).toEqual([{ internal_reason: null, external_message: null, ...before.evidence }]);
        expect((await transaction.execute(sql`select id,owner_user_id,owner_reference_id,first_request_id,first_proof_id,normalized_contact,contact_fingerprint,fingerprint_key_id from public.academy_admission_contact_bindings where id=${fixture.bindingId}`)).rows[0]).toEqual(before.binding);
        expect((await transaction.execute(sql`select contact_type,normalized_contact,applicant_message,status,version from public.academy_admission_requests where id=${fixture.freshRequestId}`)).rows[0]).toEqual(before.fresh);
        expect((await transaction.execute(sql`select contact_type,normalized_contact,applicant_message,status,version from public.academy_admission_requests where id=${fixture.pendingRequestId}`)).rows[0]).toEqual(before.pending);
        expect((await transaction.execute(sql`select id from public.academy_admission_audit_events where id in (${fixture.oldAuditId},${fixture.recentAuditId})`)).rows).toEqual([{ id: fixture.recentAuditId }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_retired_audit_events where id=${fixture.archivedAuditId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='retention_run'`)).rows).toEqual([{ total: 3 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_retired_audit_events where tribe_id=${fixture.archivedTribeId} and resource_type='retention_run'`)).rows).toEqual([{ total: 1 }]);
      });
      await database.withContext({ userId: fixture.boundUserId, email: null }, async (transaction) => {
        expect((await transaction.execute(sql`select id,status,version,contact_type,normalized_contact,external_message from public.read_own_admission_request_summary(${fixture.tribeId},${fixture.sessionId})`)).rows).toEqual([{ id: fixture.oldRequestId, status: "rejected", version: 3, contact_type: null, normalized_contact: null, external_message: null }]);
      }, "non_bypass");
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`update public.academy_admission_requests set applicant_message='Synthetic forbidden restoration' where id=${fixture.oldRequestId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(backend, (transaction) => transaction.execute(sql`update public.academy_admission_decisions set external_message='Synthetic forbidden restoration' where id=${fixture.oldDecisionId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(backend, async (transaction) => {
        await transaction.execute(sql`delete from public."user" where id=${fixture.boundUserId}`);
        expect((await transaction.execute(sql`select owner_user_id,normalized_contact,first_request_id,first_proof_id,minimized_at is not null as minimized,owner_reference_id,contact_fingerprint,fingerprint_key_id from public.academy_admission_contact_bindings where id=${fixture.bindingId}`)).rows[0]).toEqual({ owner_user_id: null, normalized_contact: null, first_request_id: null, first_proof_id: null, minimized: true, owner_reference_id: before.binding.owner_reference_id, contact_fingerprint: before.binding.contact_fingerprint, fingerprint_key_id: before.binding.fingerprint_key_id });
        await expect(assertUnreservedAdmissionContact(transaction, fixture.tribeId, { type: "email", value: fixture.contact }, async () => fixture.security)).rejects.toMatchObject({ code: "contact_binding_conflict" });
        await transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`);
        const archived = (await transaction.execute<{ metadata: Record<string, unknown>; actor_reference_id: string | null; operation_id: string | null; resource_version: number | null }>(sql`select metadata,actor_reference_id,operation_id,resource_version from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId} and resource_type='retention_run'`)).rows;
        expect(archived).toHaveLength(3);
        expect(archived.every((event) => Object.keys(event.metadata).sort().join(",") === "cutoff,durationMs,owner,processed,remaining" && Number.isSafeInteger(event.metadata.durationMs) && Number(event.metadata.durationMs) >= 0 && event.actor_reference_id === null && event.operation_id === null && event.resource_version === null)).toBe(true);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should stop before restore cleanup and roll back all staged minimization/purge if live authority is withdrawn", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionPrivateRetention(database), backend = { userId: null, email: null };
      const snapshot = () => database.withContext(backend, async (transaction) => ({
        request: (await transaction.execute(sql`select normalized_contact,applicant_message,private_material_minimized_at is not null as minimized from public.academy_admission_requests where id=${fixture.oldRequestId}`)).rows[0],
        decision: (await transaction.execute(sql`select internal_reason,external_message from public.academy_admission_decisions where id=${fixture.oldDecisionId}`)).rows[0],
        audits: (await transaction.execute(sql`select (select count(*)::integer from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}) as live,(select count(*)::integer from public.academy_admission_retired_audit_events where tribe_id=${fixture.archivedTribeId}) as archived`)).rows[0],
      }));
      const before = await snapshot();
      const stopped = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => true }).useCases.purgePrivateData;
      await expect(stopped.execute()).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await snapshot()).toEqual(before);
      let authorized = true;
      const withdrawn = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => authorized, readRecoveryLock: async (transaction) => {
        if (transaction) {
          const staged = (await transaction.execute<{ staged: boolean }>(sql`select private_material_minimized_at is not null as staged from public.academy_admission_requests where id=${fixture.oldRequestId}`)).rows[0].staged;
          if (staged) authorized = false;
        }
        return false;
      } }).useCases.purgePrivateData;
      await expect(withdrawn.execute()).rejects.toMatchObject({ code: "permission_denied" });
      expect(await snapshot()).toEqual(before);
      const restoreAfterStaging = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async (transaction) => transaction ? (await transaction.execute<{ staged: boolean }>(sql`select private_material_minimized_at is not null as staged from public.academy_admission_requests where id=${fixture.oldRequestId}`)).rows[0].staged : false }).useCases.purgePrivateData;
      await expect(restoreAfterStaging.execute()).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await snapshot()).toEqual(before);
      let executions = 0;
      const lostAcknowledgement = new Error("Synthetic private commit acknowledgement was lost");
      const indeterminate = buildAdmissionPrivateDataRetentionModule({ execute: async (run) => { executions += 1; await database.withContext(backend, run); throw lostAcknowledgement; }, authorize: async () => true, readRecoveryLock: async () => false }).useCases.purgePrivateData;
      await expect(indeterminate.execute()).rejects.toMatchObject({ code: "operation_unresolved", cause: lostAcknowledgement });
      expect(executions).toBe(1);
      const confirmedSource = await snapshot();
      expect(confirmedSource.request).toEqual({ normalized_contact: null, applicant_message: null, minimized: true });
      expect(confirmedSource.decision).toEqual({ internal_reason: null, external_message: null });
      const nextSweep = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false }).useCases.purgePrivateData;
      expect(await nextSweep.execute()).toEqual({ requestsMinimized: 0, auditEventsPurged: 0, archivedAuditEventsPurged: 0, remainingRequests: false, remainingAuditEvents: false });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should skip locked request/audit originals, keep one global audit ceiling and use UTC lifetimes across daylight-saving zones", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionPrivateRetention(database), backend = { userId: null, email: null };
      const retention = buildAdmissionPrivateDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false }).useCases.purgePrivateData;
      let announceLock!: () => void, rejectLock!: (error: unknown) => void, releaseLock!: () => void;
      const locked = new Promise<void>((resolve, reject) => { announceLock = resolve; rejectLock = reject; });
      const released = new Promise<void>((resolve) => { releaseLock = resolve; });
      const holder = database.withContext(backend, async (transaction) => {
        await transaction.execute(sql`select id from public.academy_admission_requests where id=${fixture.unboundRequestId} for update`);
        await transaction.execute(sql`select id from public.academy_admission_retired_audit_events where id=${fixture.archivedAuditId} for update`);
        announceLock();
        await released;
      });
      void holder.catch(rejectLock);
      await locked;
      try {
        expect(await retention.execute({ requestLimit: 1, auditLimit: 1 })).toEqual({ requestsMinimized: 1, auditEventsPurged: 1, archivedAuditEventsPurged: 0, remainingRequests: true, remainingAuditEvents: true });
        await database.withContext(backend, async (transaction) => {
          expect((await transaction.execute(sql`select id,private_material_minimized_at is not null as minimized from public.academy_admission_requests where id in (${fixture.oldRequestId},${fixture.unboundRequestId}) order by id`)).rows).toEqual([
            { id: fixture.oldRequestId, minimized: true }, { id: fixture.unboundRequestId, minimized: false },
          ].sort((left, right) => left.id.localeCompare(right.id)));
        });
      } finally { releaseLock(); await holder; }
      expect(await retention.execute({ requestLimit: 1, auditLimit: 1 })).toEqual({ requestsMinimized: 1, auditEventsPurged: 0, archivedAuditEventsPurged: 1, remainingRequests: false, remainingAuditEvents: false });
      for (const zone of ["America/New_York", "America/Argentina/Buenos_Aires"]) await database.withContext(backend, async (transaction) => {
        await transaction.execute(sql`select set_config('TimeZone',${zone},true)`);
        expect((await transaction.execute(sql`select extract(epoch from timestamptz '2024-11-04T12:00:00Z'-public.admission_terminal_private_material_cutoff(timestamptz '2024-11-04T12:00:00Z'))::integer as request_seconds,extract(epoch from timestamptz '2024-11-04T12:00:00Z'-public.admission_security_audit_cutoff(timestamptz '2024-11-04T12:00:00Z'))::integer as audit_seconds`)).rows).toEqual([{ request_seconds: 15_552_000, audit_seconds: 31_536_000 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
