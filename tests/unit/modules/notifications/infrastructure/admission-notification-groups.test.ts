/** @vitest-environment node */
/** Exercises durable group uniqueness, immutable manifests, rollback and private RLS through real PostgreSQL. @module native-admission-notification-groups-test */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroup, insertAdmissionNotificationGroup, insertAdmissionNotificationGroupMember, notificationFixtureTimestamp } from "@/tests/support/admission-notification-group-fixture";
import { freezeAdmissionNotificationGroup } from "@/src/modules/notifications/domain/policies/admission-notification-groups";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { admissionNotificationGroups, admissionNotificationGroupMembers } from "@/src/modules/shared/infrastructure/database/schema";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification groups", () => {
  it("should retain one group and logical member under concurrent replay and reject crossed scoped references", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroup(database), groupIds = [randomUUID(), randomUUID()];
      // Arrange/act: the exact same structured identity races through separate real transactions.
      const attempts = await Promise.allSettled(groupIds.map((groupId) => insertAdmissionNotificationGroup(database, fixture, groupId)));
      if (!attempts.some((attempt) => attempt.status === "fulfilled")) {
        const failure = attempts.find((attempt) => attempt.status === "rejected");
        const code = failure?.status === "rejected" && typeof failure.reason?.cause?.code === "string" ? failure.reason.cause.code : "unavailable";
        throw new Error(`Native notification group creation failed: SQLSTATE ${code}`, { cause: failure?.status === "rejected" ? failure.reason : undefined });
      }
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      const rejected = attempts.find((attempt) => attempt.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected", reason: { cause: { code: "23505" } } });
      const groupId = await database.withContext(fixture.own, async (transaction) => (await transaction.select({ id: admissionNotificationGroups.id }).from(admissionNotificationGroups).where(eq(admissionNotificationGroups.tribeId, fixture.tribeId)))[0].id);
      await insertAdmissionNotificationGroupMember(database, fixture, groupId, fixture.obligationIds[1]);
      let includedBeforeCommit = false;
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.admission_notification_group_members set state='included' where group_id=${groupId}`);
        expect((await transaction.execute(sql`select state from public.admission_notification_group_members where group_id=${groupId}`)).rows).toEqual([{ state: "included" }]);
        includedBeforeCommit = true;
      })).rejects.toMatchObject({ code: "23514" });
      expect(includedBeforeCommit).toBe(true);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,resolved_at from public.admission_notification_group_members where group_id=${groupId}`)).rows)).toEqual([{ state: "pending", resolved_at: null }]);
      await expect(insertAdmissionNotificationGroupMember(database, fixture, groupId, fixture.obligationIds[1])).rejects.toMatchObject({ cause: { code: "23505" } });
      await expect(insertAdmissionNotificationGroupMember(database, fixture, groupId, fixture.obligationIds[2])).rejects.toMatchObject({ cause: { code: "23503" } });
      const nextGroupId = randomUUID(), nextIdentity = { ...fixture.identity, window: { ...fixture.identity.window, startsAtMicroseconds: fixture.identity.window.closesAtMicroseconds, closesAtMicroseconds: fixture.identity.window.closesAtMicroseconds + fixture.identity.window.closesAtMicroseconds - fixture.identity.window.startsAtMicroseconds } };
      await insertAdmissionNotificationGroup(database, fixture, nextGroupId, nextIdentity);
      await expect(insertAdmissionNotificationGroupMember(database, fixture, nextGroupId, fixture.obligationIds[1])).rejects.toMatchObject({ cause: { code: "23505" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.admission_notification_group_members where tribe_id=${fixture.tribeId}`)).rows[0].count)).toBe(1);
      // A genuine old pending request has only one logical reminder even when a caller retries with another UUID.
      const reminderId = randomUUID(), other = { userId: fixture.otherLeaderId, email: null };
      await database.withContext(other, (transaction) => transaction.execute(sql`select public.create_admission_notification_obligation(${reminderId},${fixture.otherTribeId},${fixture.requestIds[2]},${fixture.applicantIds[2]},'reminder')`));
      await expect(database.withContext(other, (transaction) => transaction.execute(sql`select public.create_admission_notification_obligation(${randomUUID()},${fixture.otherTribeId},${fixture.requestIds[2]},${fixture.applicantIds[2]},'reminder')`))).rejects.toMatchObject({ cause: { code: "23505" } });
      expect(await database.withContext(other, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_notification_obligations where request_id=${fixture.requestIds[2]} and event_type='reminder'`)).rows[0].count)).toBe(1);
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should freeze only live original sources and preserve identity, minimal payload and rollback atomically", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroup(database), groupId = randomUUID();
      await insertAdmissionNotificationGroup(database, fixture, groupId);
      for (const obligationId of fixture.obligationIds.slice(0, 2)) await insertAdmissionNotificationGroupMember(database, fixture, groupId, obligationId);
      const plan = freezeAdmissionNotificationGroup(fixture.identity, fixture.candidates, fixture.nowMicroseconds);
      expect(plan.status).toBe("frozen");
      if (plan.status !== "frozen") throw new Error("Synthetic group did not retain its live source");
      expect(plan.expiredObligationIds).toEqual([fixture.obligationIds[0]]);
      for (const changed of [
        sql`update public.admission_notification_groups set state='frozen',version=2,frozen_manifest=${JSON.stringify({ ...plan.manifest, internalReason: "private-canary" })}::jsonb,deadline_at=${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)} where id=${groupId}`,
        sql`update public.admission_notification_groups set state='frozen',version=2,frozen_manifest=${JSON.stringify(plan.manifest)}::jsonb,deadline_at=${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)}+interval '1 microsecond' where id=${groupId}`,
      ]) await expect(database.withContext(fixture.own, (transaction) => transaction.execute(changed))).rejects.toMatchObject({ cause: { code: "23514" } });
      // Observe the actual native frozen record, then deliberately abort the enclosing owner transaction.
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.admission_notification_groups set state='frozen',version=2,frozen_manifest=${JSON.stringify(plan.manifest)}::jsonb,deadline_at=${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)} where id=${groupId}`);
        expect((await transaction.execute(sql`select state,version from public.admission_notification_groups where id=${groupId}`)).rows).toEqual([{ state: "frozen", version: 2 }]);
        throw new Error("Synthetic group owner abort");
      })).rejects.toThrow("Synthetic group owner abort");
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,frozen_manifest,deadline_at,closed_at from public.admission_notification_groups where id=${groupId}`)).rows)).toEqual([{ state: "open", version: 1, frozen_manifest: null, deadline_at: null, closed_at: null }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.admission_notification_groups set state='frozen',version=2,frozen_manifest=${JSON.stringify(plan.manifest)}::jsonb,deadline_at=${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)} where id=${groupId}`));
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,frozen_manifest,deadline_at::text,closed_at::text from public.admission_notification_groups where id=${groupId}`)).rows[0]);
      expect(original.frozen_manifest).toEqual(plan.manifest);
      const mapped = await database.withContext(fixture.own, async (transaction) => (await transaction.select({ manifest: admissionNotificationGroups.frozenManifest, deadlineAt: admissionNotificationGroups.deadlineAt }).from(admissionNotificationGroups).where(eq(admissionNotificationGroups.id, groupId)))[0]);
      expect(mapped.manifest).toEqual(plan.manifest);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ exact: boolean }>(sql`select deadline_at=${mapped.deadlineAt}::timestamptz as exact from public.admission_notification_groups where id=${groupId}`)).rows[0].exact)).toBe(true);
      for (const statement of [
        sql`update public.admission_notification_groups set frozen_manifest=frozen_manifest||'{"internalReason":"canary"}'::jsonb where id=${groupId}`,
        sql`update public.admission_notification_groups set deadline_at=deadline_at+interval '1 microsecond' where id=${groupId}`,
        sql`update public.admission_notification_groups set recipient_user_id=${fixture.otherLeaderId} where id=${groupId}`,
      ]) await expect(database.withContext(fixture.own, (transaction) => transaction.execute(statement))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(insertAdmissionNotificationGroupMember(database, fixture, groupId, fixture.obligationIds[0])).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.admission_notification_groups set frozen_manifest=frozen_manifest where id=${groupId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,frozen_manifest,deadline_at::text,closed_at::text from public.admission_notification_groups where id=${groupId}`)).rows[0])).toEqual(original);
      expect(await database.withContext(fixture.own, (transaction) => transaction.select({ obligationId: admissionNotificationGroupMembers.obligationId, state: admissionNotificationGroupMembers.state }).from(admissionNotificationGroupMembers).where(eq(admissionNotificationGroupMembers.groupId, groupId)).orderBy(admissionNotificationGroupMembers.state))).toEqual([{ obligationId: fixture.obligationIds[0], state: "expired" }, { obligationId: fixture.obligationIds[1], state: "included" }]);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should retain explicit expiry and deny direct request access without granting an applicant membership", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroup(database, true), groupId = randomUUID();
      await insertAdmissionNotificationGroup(database, fixture, groupId);
      for (const obligationId of fixture.obligationIds.slice(0, 2)) await insertAdmissionNotificationGroupMember(database, fixture, groupId, obligationId);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.admission_notification_groups set state='expired',version=2 where id=${groupId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,frozen_manifest,deadline_at from public.admission_notification_groups where id=${groupId}`)).rows)).toEqual([{ state: "expired", frozen_manifest: null, deadline_at: null }]);
      await database.grantTablesToNonBypass(["admission_notification_groups", "admission_notification_group_members"]);
      const tables = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select relation.relname,relation.relrowsecurity as enabled,relation.relforcerowsecurity as forced from pg_class relation where relation.oid in ('public.admission_notification_groups'::regclass,'public.admission_notification_group_members'::regclass) order by relation.relname`)).rows);
      expect(tables).toEqual([{ relname: "admission_notification_group_members", enabled: true, forced: true }, { relname: "admission_notification_groups", enabled: true, forced: true }]);
      const functions = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ security_definer: boolean; public_execute: boolean; fixed_search_path: boolean }>(sql`select procedure.prosecdef as security_definer,exists(select 1 from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) permission where permission.grantee=0 and permission.privilege_type='EXECUTE') as public_execute,procedure.proconfig @> array['search_path=pg_catalog, public'] as fixed_search_path from pg_proc procedure where procedure.oid in ('public.guard_admission_notification_group()'::regprocedure,'public.guard_admission_notification_group_member()'::regprocedure,'public.guard_admission_notification_group_inclusion()'::regprocedure)`)).rows);
      expect(functions).toHaveLength(3);
      for (const entry of functions) expect(entry).toEqual({ security_definer: true, public_execute: false, fixed_search_path: true });
      const attackGroupId = randomUUID();
      await insertAdmissionNotificationGroup(database, fixture, attackGroupId, { ...fixture.identity, window: { ...fixture.identity.window, startsAtMicroseconds: fixture.identity.window.closesAtMicroseconds, closesAtMicroseconds: fixture.identity.window.closesAtMicroseconds + fixture.identity.window.closesAtMicroseconds - fixture.identity.window.startsAtMicroseconds } });
      for (const userId of [fixture.leaderId, fixture.applicantIds[0], fixture.otherLeaderId]) {
        expect(await database.withContext({ userId, email: null }, async (transaction) => (await transaction.execute(sql`select id from public.admission_notification_groups`)).rows, "non_bypass")).toEqual([]);
        expect(await database.withContext({ userId, email: null }, async (transaction) => (await transaction.execute(sql`select obligation_id from public.admission_notification_group_members`)).rows, "non_bypass")).toEqual([]);
      }
      await expect(database.withContext({ userId: fixture.applicantIds[0], email: null }, (transaction) => transaction.execute(sql`insert into public.admission_notification_group_members(group_id,tribe_id,recipient_user_id,audience,obligation_id) values (${attackGroupId},${fixture.tribeId},${fixture.leaderId},'reviewer',${fixture.obligationIds[0]})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantIds[0]}`)).rows[0].count)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
