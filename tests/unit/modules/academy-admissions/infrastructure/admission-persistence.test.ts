/** @vitest-environment node */

/** Exercises actual persisted admission invariants on owned disposable Neon branches. */
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";
import { academyAdmissionPolicies, academyAdmissionAuditEvents, academyAllowlistImports, academyAllowlistImportRows, academyAllowlistEntries } from "@/src/modules/shared/infrastructure/database/schema";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createMessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/**
 * Seeds a pending request in an explicitly protected synthetic academy.
 * @param database - Disposable branch owned by the current SQL validation run.
 * @returns Actual private ledger and fixture identities, without external credentials.
 */
async function prepareAtomicAdmission(database: AcademyAdmissionTestDatabase) {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID(), leaderId = randomUUID(), applicantId = randomUUID(), requestId = randomUUID();
  const own = { userId: leaderId, email: null };
  await database.withContext(own, async (transaction) => {
    for (const userId of [leaderId, applicantId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic atomic admission',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic atomic academy',${`atomic-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
    const instant = (await transaction.execute(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${instant})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${tribeId},${applicantId},'common',clock_timestamp()+interval '29 days')`);
  });
  const keyrings = {} as Parameters<typeof createMessagingSecurityConfig>[0]["keyrings"];
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) { const keyId = randomUUID(); keyrings[purpose] = { activeKeyId: keyId, keys: [{ id: keyId, material: randomBytes(32) }] }; }
  const config = await createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings });
  const authorize = async (transaction: RequestDatabase) => {
    await transaction.execute(sql`select id from public.tribes where id=${tribeId} for update`);
    return Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=${leaderId} and role='leader' and status='active' for share`)).rows[0]);
  };
  const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(own, run), authorize, async () => config);
  const command = { actorUserId: leaderId, tribeId, operationType: "decide_admission_request", idempotencyKey: randomUUID(), intent: { requestId, expectedVersion: 1, decision: "approve", internalReason: "Synthetic atomic review" } };
  const resultSchema = z.strictObject({ requestId: z.uuid(), version: z.int().positive(), membership: z.strictObject({ id: z.uuid(), role: z.literal("tribemate"), status: z.literal("active") }) });
  return { tribeId, leaderId, applicantId, requestId, own, ledger, command, resultSchema };
}

/**
 * Stages the actual protected membership collaborator and all decision obligations in one transaction.
 * @param transaction - The ledger's existing guarded business transaction.
 * @param ledgerId - Registered operation identity used by the audit event.
 * @param fixture - Current request, account and tribe identities from the owned branch.
 * @param obligations - Whether the fixture intentionally omits one deferred commit requirement.
 * @returns A proposed minimal result that becomes public only after a successful commit.
 * @throws Error when the synthetic CAS or actual protected membership cannot apply.
 */
async function approveAtomicAdmission(transaction: RequestDatabase, ledgerId: string, fixture: Awaited<ReturnType<typeof prepareAtomicAdmission>>, obligations: "complete" | "missing_notice" | "missing_audit") {
  const decisionId = randomUUID(), effectId = randomUUID();
  const pending = (await transaction.execute(sql`select id from public.academy_admission_requests where id=${fixture.requestId} and tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId} and status='pending' and version=1 for update`)).rows[0];
  if (!pending) throw new Error("Synthetic atomic admission CAS conflict");
  await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id,internal_reason) values (${decisionId},${fixture.requestId},${fixture.tribeId},${fixture.applicantId},1,'approved',${fixture.leaderId},'user','manual_review',1,1,${effectId},'Synthetic atomic review')`);
  await transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${decisionId},version=version+1 where id=${fixture.requestId} and version=1`);
  const applied = await createAcademyApprovedMembershipWriter(transaction).apply({ tribeId: fixture.tribeId, userId: fixture.applicantId, decisionId });
  if (applied.status !== "joined" || applied.member.role !== "tribemate" || applied.member.status !== "active") throw new Error("Synthetic protected membership did not apply");
  if (obligations !== "missing_notice") await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${fixture.requestId},${fixture.applicantId},'approved')`);
  if (obligations !== "missing_audit") await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type) values (${fixture.tribeId},${fixture.leaderId},'admission_request',${fixture.requestId},${ledgerId},'approved')`);
  return { requestId: fixture.requestId, version: 2, membership: { id: applied.member.id, role: applied.member.role, status: applied.member.status } };
}

/**
 * Reads persisted effects after commit/rollback, never the callback's proposed result.
 * @param database - The same disposable branch used for the mutation.
 * @param fixture - Exact request/operation identities being reconciled.
 * @returns Confirmed request, business effect counts and ledger progress/result.
 */
async function readAtomicAdmission(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAtomicAdmission>>) {
  return database.withContext(fixture.own, async (transaction) => {
    const request = (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${fixture.requestId}`)).rows[0];
    const counts = (await transaction.execute(sql`select (select count(*)::integer from public.academy_admission_decisions where request_id=${fixture.requestId}) as decisions,(select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}) as members,(select count(*)::integer from public.academy_admission_membership_effects where request_id=${fixture.requestId}) as effects,(select count(*)::integer from public.academy_admission_notification_obligations where request_id=${fixture.requestId}) as notices,(select count(*)::integer from public.academy_admission_audit_events where resource_id=${fixture.requestId}) as audits`)).rows[0];
    const operation = (await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${fixture.command.idempotencyKey}`)).rows[0];
    return { request, counts, operation };
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission persistence", () => {
  it("should retain an audit operation in its own tribe and prevent losing referenced provenance", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAtomicAdmission(database);
      const otherTribeId = randomUUID(), ownOperationId = randomUUID(), otherOperationId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic audit scope',${`audit-${otherTribeId}`},${fixture.leaderId})`);
        for (const [operationId, tribeId] of [[ownOperationId, fixture.tribeId], [otherOperationId, otherTribeId]]) {
          await transaction.execute(sql`insert into public.academy_admission_operations(id,actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id) values (${operationId},${fixture.leaderId},${tribeId},'synthetic_audit',${randomUUID()},decode('01','hex'),'synthetic-audit')`);
        }
      });
      const recordAudit = (operationId: string | null) => database.withContext(fixture.own, (transaction) => transaction.insert(academyAdmissionAuditEvents).values({ tribeId: fixture.tribeId, actorUserId: fixture.leaderId, resourceType: "admission_request", resourceId: fixture.requestId, operationId, eventType: "pending_created" }).returning({ id: academyAdmissionAuditEvents.id, operationId: academyAdmissionAuditEvents.operationId }));
      await expect(recordAudit(otherOperationId)).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(recordAudit(randomUUID())).rejects.toMatchObject({ cause: { code: "23503" } });
      const [recorded] = await recordAudit(ownOperationId);
      expect(recorded).toEqual({ id: expect.any(String), operationId: ownOperationId });
      expect(await recordAudit(null)).toEqual([{ id: expect.any(String), operationId: null }]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_operations where id=${ownOperationId}`))).rejects.toMatchObject({ cause: { code: "23503" } });
      const retained = await database.withContext(fixture.own, (transaction) => transaction.select({ operationId: academyAdmissionAuditEvents.operationId }).from(academyAdmissionAuditEvents).where(eq(academyAdmissionAuditEvents.id, recorded.id)));
      expect(retained).toEqual([{ operationId: ownOperationId }]);
    });
  }, 120_000);

  it("should persist import previews without list effects and retain tenant-scoped committed rows without hidden entry edits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture=await prepareAtomicAdmission(database);
      const otherTribeId=randomUUID(),otherImportId=randomUUID(),otherEntryId=randomUUID();
      const contact=`preview-${randomUUID()}@example.test`;
      const preview=await database.withContext(fixture.own,async(transaction)=>{
        const [imported]=await transaction.insert(academyAllowlistImports).values({tribeId:fixture.tribeId,actorUserId:fixture.leaderId,contactType:"email",policyVersion:1,fileFingerprint:new Uint8Array([1]),fingerprintKeyId:"synthetic-import",expiresAt:new Date(Date.now()+60_000),purgeAfter:new Date(Date.now()+3_600_000)}).returning({id:academyAllowlistImports.id,state:academyAllowlistImports.state,version:academyAllowlistImports.version,selectedRows:academyAllowlistImports.selectedRows});
        const [row]=await transaction.insert(academyAllowlistImportRows).values({importId:imported.id,tribeId:fixture.tribeId,rowNumber:1,inputData:{email:contact,displayName:"Synthetic preview"},validationResult:{valid:true}}).returning({outcome:academyAllowlistImportRows.outcome,entryId:academyAllowlistImportRows.entryId,committedAt:academyAllowlistImportRows.committedAt});
        expect((await transaction.select({id:academyAllowlistEntries.id}).from(academyAllowlistEntries).where(eq(academyAllowlistEntries.tribeId,fixture.tribeId)))).toEqual([]);
        return {imported,row};
      });
      expect(preview).toEqual({imported:{id:expect.any(String),state:"preview",version:1,selectedRows:[]},row:{outcome:null,entryId:null,committedAt:null}});
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic import scope',${`import-${otherTribeId}`},${fixture.leaderId})`);
        await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,expires_at,purge_after) values (${otherImportId},${otherTribeId},${fixture.leaderId},'email',1,decode('01','hex'),'synthetic-import',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,origin,import_id) values (${otherEntryId},${otherTribeId},'email',${contact},decode('01','hex'),'synthetic-import','import',${otherImportId})`);
      });
      const insertRow=(tribeId:string,rowNumber:number,entryId:string|null=null)=>database.withContext(fixture.own,(transaction)=>transaction.insert(academyAllowlistImportRows).values({importId:preview.imported.id,tribeId,rowNumber,entryId,inputData:{email:contact},validationResult:{valid:true}}));
      await expect(insertRow(otherTribeId,2)).rejects.toMatchObject({cause:{code:"23503"}});
      await expect(insertRow(fixture.tribeId,2,otherEntryId)).rejects.toMatchObject({cause:{code:"23503"}});
      await expect(insertRow(fixture.tribeId,1)).rejects.toMatchObject({cause:{code:"23505"}});
      await expect(insertRow(fixture.tribeId,0)).rejects.toMatchObject({cause:{code:"23514"}});
      await expect(insertRow(fixture.tribeId,10_001)).rejects.toMatchObject({cause:{code:"23514"}});
      const ownEntryId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.insert(academyAllowlistEntries).values({id:ownEntryId,tribeId:fixture.tribeId,contactType:"email",normalizedContact:contact,contactFingerprint:new Uint8Array([1]),fingerprintKeyId:"synthetic-import",origin:"import",importId:preview.imported.id});
        await transaction.execute(sql`update public.academy_allowlist_import_rows set entry_id=${ownEntryId},outcome='added',committed_at=clock_timestamp() where import_id=${preview.imported.id} and row_number=1`);
      });
      const recorded=await database.withContext(fixture.own,(transaction)=>transaction.select({version:academyAllowlistEntries.version,status:academyAllowlistEntries.status,importId:academyAllowlistEntries.importId}).from(academyAllowlistEntries).where(eq(academyAllowlistEntries.id,ownEntryId)));
      expect(recorded).toEqual([{version:1,status:"enabled",importId:preview.imported.id}]);
      await expect(database.withContext(fixture.own,(transaction)=>transaction.update(academyAllowlistEntries).set({importId:otherImportId}).where(eq(academyAllowlistEntries.id,ownEntryId)))).rejects.toMatchObject({cause:{code:"23514"}});
      expect(await database.withContext(fixture.own,(transaction)=>transaction.select({version:academyAllowlistEntries.version,importId:academyAllowlistEntries.importId}).from(academyAllowlistEntries).where(eq(academyAllowlistEntries.id,ownEntryId)))).toEqual([{version:1,importId:preview.imported.id}]);
    });
  },120_000);

  it("should commit decision, membership, obligations and a replayable result together exactly once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAtomicAdmission(database);
      const first = await fixture.ledger.run(fixture.command, fixture.resultSchema, (transaction, ledgerId) => approveAtomicAdmission(transaction, ledgerId, fixture, "complete"));
      expect(first).toMatchObject({ state: "completed", replayed: false, result: { requestId: fixture.requestId, version: 2, membership: { role: "tribemate", status: "active" } } });
      const replay = await fixture.ledger.run(fixture.command, fixture.resultSchema, (transaction, ledgerId) => approveAtomicAdmission(transaction, ledgerId, fixture, "complete"));
      expect(replay).toEqual({ ...first, replayed: true });
      expect(await readAtomicAdmission(database, fixture)).toMatchObject({ request: { status: "approved", version: 2 }, counts: { decisions: 1, members: 1, effects: 1, notices: 1, audits: 1 }, operation: { state: "completed", public_result: expect.objectContaining({ version: 2 }) } });
    });
  }, 120_000);

  it.each(["missing_notice", "missing_audit"] as const)("should roll back the decision and member when %s prevents the deferred commit", async (missing) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAtomicAdmission(database);
      await expect(fixture.ledger.run(fixture.command, fixture.resultSchema, (transaction, ledgerId) => approveAtomicAdmission(transaction, ledgerId, fixture, missing))).rejects.toMatchObject({ code: "operation_unresolved", cause: { code: "23514" } });
      expect(await readAtomicAdmission(database, fixture)).toEqual({ request: { status: "pending", version: 1 }, counts: { decisions: 0, members: 0, effects: 0, notices: 0, audits: 0 }, operation: { state: "started", public_result: null } });
      expect(await fixture.ledger.read(fixture.command, fixture.resultSchema)).toEqual({ state: "started", operationId: fixture.command.idempotencyKey });
    });
  }, 120_000);

  it("should preserve admission identity, uniqueness and versions without creating membership", async () => {
    // Apply the shipped artifacts before checking their persisted behavior.
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      const fixtures = createAcademyAdmissionFixtures(database.branch.name);
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const account of [fixtures.accounts.leaderA, fixtures.accounts.leaderB, fixtures.accounts.applicantA]) {
          await transaction.execute(sql`
            insert into public."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
            values (${account.userId}, 'Synthetic admission account', ${account.email}, false, clock_timestamp(), clock_timestamp())
          `);
        }
        for (const tribe of [fixtures.tribes.academyA, fixtures.tribes.academyB]) {
          await transaction.execute(sql`
            insert into public.tribes (id, name, slug, created_by)
            values (${tribe.id}, 'Synthetic admission academy', ${tribe.slug}, ${tribe.leaderUserId})
          `);
        }
      });

      // Act and assert: these are database effects, not source or query-string checks.
      const policy = await database.withContext({ userId: fixtures.accounts.leaderA.userId, email: null }, async (transaction) => {
        const result = await transaction.execute(sql`
          insert into public.academy_admission_policies (tribe_id, changed_by_user_id)
          values (${fixtures.tribes.academyA.id}, ${fixtures.accounts.leaderA.userId})
          returning mode, contact_type, is_open, requires_additional_verification, allow_common_exceptions, version
        `);
        return result.rows[0];
      });
      expect(policy).toMatchObject({ mode: "manual_review", contact_type: "email", is_open: false, requires_additional_verification: false, allow_common_exceptions: false, version: 1 });
      const projectedPolicy = await database.withContext({ userId: fixtures.accounts.leaderA.userId, email: null }, async (transaction) => transaction.select().from(academyAdmissionPolicies).where(eq(academyAdmissionPolicies.tribeId,fixtures.tribes.academyA.id)));
      expect(projectedPolicy).toMatchObject([{ mode: "manual_review", contactType: "email", isOpen: false, requiresAdditionalVerification: false, allowCommonExceptions: false, version: 1 }]);
      await expect(database.withContext({ userId: fixtures.accounts.leaderA.userId, email: null }, async (transaction) => transaction.execute(sql`
        update public.academy_admission_policies set contact_type='phone',phone_channel='whatsapp',allow_sms_alternative=true,version=version+1 where tribe_id=${fixtures.tribes.academyA.id}
      `))).rejects.toMatchObject({ cause: { code: "23514" } });

      // PostgreSQL accepts a NULL CHECK result: these fixtures keep all other
      // required values valid to isolate an absent telephone channel.
      await expect(database.withContext({ userId: fixtures.accounts.leaderA.userId, email: null }, async (transaction) => transaction.execute(sql`
        update public.academy_admission_policies set contact_type='phone',requires_additional_verification=true,phone_channel=null,allow_sms_alternative=true,version=version+1 where tribe_id=${fixtures.tribes.academyA.id}
      `))).rejects.toMatchObject({ cause: { code: "23514" } });

      const invitationId = fixtures.invitation.id;
      await database.withContext({ userId: fixtures.accounts.leaderB.userId, email: null }, async (transaction) => {
        await transaction.execute(sql`
          insert into public.academy_personal_invitations (
            id, tribe_id, created_by_user_id, contact_type, normalized_contact,
            contact_fingerprint, fingerprint_key_id, token_hash, token_key_id
          ) values (
            ${invitationId}, ${fixtures.tribes.academyB.id}, ${fixtures.accounts.leaderB.userId}, 'email',
            ${fixtures.accounts.applicantA.email}, decode('01', 'hex'), 'synthetic-fingerprint', decode('02', 'hex'), 'synthetic-invitation'
          )
        `);
      });
      await expect(database.withContext({ userId: fixtures.accounts.applicantA.userId, email: null }, async (transaction) => {
        await transaction.execute(sql`
          with instant as (select clock_timestamp() as now)
          insert into public.academy_admission_requests (tribe_id, user_id, source, invitation_id, submitted_at, expires_at)
          select ${fixtures.tribes.academyA.id}, ${fixtures.accounts.applicantA.userId}, 'personal', ${invitationId}, now, now + interval '30 days' from instant
        `);
      })).rejects.toMatchObject({ cause: { code: "23503" } });

      const own = { userId: fixtures.accounts.applicantA.userId, email: null };
      const insertPending = () => database.withContext(own, async (transaction) => transaction.execute(sql`
        with instant as (select clock_timestamp() as now)
        insert into public.academy_admission_requests (tribe_id,user_id,source,submitted_at,expires_at)
        select ${fixtures.tribes.academyA.id},${own.userId},'common',now,now+interval '30 days' from instant returning id,version
      `));
      const pending = (await insertPending()).rows[0];
      expect(pending).toMatchObject({ id: expect.any(String), version: 1 });
      await expect(insertPending()).rejects.toMatchObject({ cause: { code: "23505" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_requests set user_id=${fixtures.accounts.leaderA.userId} where id=${pending.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });

      // A contact binding survives rejection/cancellation and cannot silently
      // change account owner, even through a privileged runtime connection.
      const insertedBinding = await database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_admission_contact_bindings (tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source)
        values (${fixtures.tribes.academyA.id},'email',${fixtures.accounts.applicantA.email},decode('01','hex'),'synthetic-fingerprint',${own.userId},${pending.id},'base') returning id
      `));
      const bindingId = insertedBinding.rows[0].id;
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_contact_bindings set owner_user_id=${fixtures.accounts.leaderA.userId} where id=${bindingId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_admission_contact_bindings (tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source)
        values (${fixtures.tribes.academyA.id},'email',${fixtures.accounts.applicantA.email},decode('01','hex'),'synthetic-fingerprint',${fixtures.accounts.leaderA.userId},${pending.id},'base')
      `))).rejects.toMatchObject({ cause: { code: "23505" } });

      const insertedEntry = await database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_allowlist_entries (tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name)
        values (${fixtures.tribes.academyA.id},'email',${fixtures.accounts.applicantA.email},decode('01','hex'),'synthetic-fingerprint','Initial name') returning id,version
      `));
      const entry = insertedEntry.rows[0];
      expect(entry).toMatchObject({ id: expect.any(String), version: 1 });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_allowlist_entries set display_name='Changed name' where id=${entry.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_allowlist_entries set version=version+1 where id=${entry.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const competingEdits = await Promise.all(['First edit','Second edit'].map((displayName) => database.withContext(own, async (transaction) => (await transaction.execute(sql`update public.academy_allowlist_entries set display_name=${displayName},version=version+1 where id=${entry.id} and version=1 returning version`)).rows)));
      expect(competingEdits.flat()).toEqual([{ version: 2 }]);

      // Both rows are pre-admission records; none grants basic membership.
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixtures.tribes.academyA.id} and user_id=${own.userId}`)).rows)).toEqual([]);

      // Terminal transitions cannot commit one side of request/decision.
      const orphanDecisionId = randomUUID();
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${orphanDecisionId},version=version+1 where id=${pending.id}`))).rejects.toMatchObject({ code: "23503" });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason)
        values (${orphanDecisionId},${pending.id},${fixtures.tribes.academyA.id},${own.userId},1,'rejected',${fixtures.accounts.leaderA.userId},'user','manual_review',1,1,'Synthetic rejection')
      `))).rejects.toMatchObject({ code: "23514" });
      const afterFailedDecision = await database.withContext(own, async (transaction) => {
        const request = await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${pending.id}`);
        const decisions = await transaction.execute(sql`select id from public.academy_admission_decisions where request_id=${pending.id}`);
        return { request: request.rows, decisions: decisions.rows };
      });
      expect(afterFailedDecision).toEqual({ request: [{ status: "pending", version: 1 }], decisions: [] });

      const decisionId = randomUUID();
      const reviewer = { userId: fixtures.accounts.leaderA.userId, email: null };
      /** Inserts a structural rejection pair; eligibility remains a use-case responsibility. */
      const commitRejection = (obligations: "none" | "notice_only" | "complete") => database.withContext(reviewer, async (transaction) => {
        await transaction.execute(sql`
          insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason)
          values (${decisionId},${pending.id},${fixtures.tribes.academyA.id},${own.userId},1,'rejected',${reviewer.userId},'user','manual_review',1,1,'Synthetic rejection')
        `);
        await transaction.execute(sql`update public.academy_admission_requests set status='rejected',decision_id=${decisionId},version=version+1 where id=${pending.id}`);
        if (obligations !== "none") {
          await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixtures.tribes.academyA.id},${pending.id},${own.userId},'rejected')`);
        }
        if (obligations === "complete") {
          await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixtures.tribes.academyA.id},${reviewer.userId},'admission_request',${pending.id},'rejected')`);
        }
      });
      await expect(commitRejection("none")).rejects.toMatchObject({ code: "23514" });
      await expect(commitRejection("notice_only")).rejects.toMatchObject({ code: "23514" });
      await commitRejection("complete");
      const committed = await database.withContext(own, async (transaction) => {
        const request = await transaction.execute(sql`select status,version,decision_id from public.academy_admission_requests where id=${pending.id}`);
        const notices = await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${pending.id}`);
        return { request: request.rows, notices: notices.rows };
      });
      expect(committed).toEqual({ request: [{ status: "rejected", version: 2, decision_id: decisionId }], notices: [{ event_type: "rejected" }] });
      await expect(database.withContext(reviewer, async (transaction) => transaction.execute(sql`update public.academy_admission_requests set status='pending',decision_id=null,version=version+1 where id=${pending.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });

      const operationKey = randomUUID();
      const createOperation = () => database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_admission_operations(actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id)
        values (${own.userId},${fixtures.tribes.academyA.id},'submit_admission',${operationKey},decode('01','hex'),'synthetic-operation') returning id,state,version
      `));
      expect((await createOperation()).rows).toMatchObject([{ id: expect.any(String), state: "started", version: 1 }]);
      await expect(createOperation()).rejects.toMatchObject({ cause: { code: "23505" } });

      await database.grantTablesToNonBypass(["academy_admission_requests"]);
      const ownRequests = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_requests where id=${pending.id}`)).rows, "non_bypass");
      const foreignRequests = await database.withContext({ userId: fixtures.accounts.leaderB.userId, email: null }, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_requests where id=${pending.id}`)).rows, "non_bypass");
      expect(ownRequests).toEqual([{ id: pending.id }]);
      expect(foreignRequests).toEqual([]);
      const directUpdates = await database.withContext(own, async (transaction) => (await transaction.execute(sql`update public.academy_admission_requests set retry_allowed_at=clock_timestamp(),version=version+1 where id=${pending.id} returning id`)).rows, "non_bypass");
      expect(directUpdates).toEqual([]);
    });
  }, 120_000);
});
