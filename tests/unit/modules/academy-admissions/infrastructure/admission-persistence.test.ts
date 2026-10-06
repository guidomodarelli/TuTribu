/** @vitest-environment node */

/** Exercises actual persisted admission invariants on owned disposable Neon branches. */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";
import { academyAdmissionPolicies } from "@/src/modules/shared/infrastructure/database/schema";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission persistence", () => {
  it("should preserve admission identity, uniqueness and versions without creating membership", async () => {
    // Arrange: baseline first reproduces the missing storage; real artifacts are
    // applied when present, never substituted by SQL rewritten inside this test.
    await withAcademyAdmissionDatabase(async (database) => {
      if (process.env.APPLY_ADMISSION_MIGRATIONS === "1") {
        await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
        await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      }
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
