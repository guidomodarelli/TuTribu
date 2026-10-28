/** @vitest-environment node */
/** Exercises real preference CAS, epochs and current authority on owned PostgreSQL branches. @module admission-notification-preferences-test */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { applyAdmissionMigrationJournal } from "@/tests/support/admission-migration-command";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresAdmissionNotificationPreferenceRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-preference-repository";
import type { AdmissionNotificationPreferenceScope } from "@/src/modules/notifications/domain/repositories/admission-notification-preference-repository";

/** @param database - Owned real branch. @returns Independent active reviewers and a session-bound real repository. */
async function preparePreferences(database: AcademyAdmissionTestDatabase) {
  await applyAdmissionMigrationJournal(database);
  const tribeId = randomUUID(), otherTribeId = randomUUID();
  const leader = { userId: randomUUID(), sessionId: randomUUID(), tribeId };
  const guardian = { userId: randomUUID(), sessionId: randomUUID(), tribeId };
  const otherLeader = { userId: randomUUID(), sessionId: randomUUID(), tribeId: otherTribeId };
  await database.withContext({ userId: leader.userId, email: null }, async (transaction) => {
    for (const actor of [leader, guardian, otherLeader]) {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${actor.userId},'Synthetic preference reviewer',${`${actor.userId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${actor.sessionId},${actor.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic preference tribe',${`preference-${tribeId}`},${leader.userId}),(${otherTribeId},'Other preference tribe',${`preference-${otherTribeId}`},${otherLeader.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leader.userId},'leader','active'),(${tribeId},${guardian.userId},'guardian','active'),(${otherTribeId},${otherLeader.userId},'leader','active')`);
  });
  /** @param actor - Fixed real account whose PostgreSQL identity cannot be changed by scope input. @returns Its native private repository. */
  function repository(actor: AdmissionNotificationPreferenceScope) {
    return new PostgresAdmissionNotificationPreferenceRepository((_scope, run) => database.withContext({ userId: actor.userId, email: null }, run));
  }
  return { tribeId, otherTribeId, leader, guardian, otherLeader, repository };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification preferences", () => {
  // Real absent rows, creation races and updates share the original storage boundary.
  it("should preserve defaults and exact epochs while rejecting concurrent or stale choices without enabling email", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePreferences(database), repository = fixture.repository(fixture.leader);
      // Arrange: role defaults have no storage or messaging side effects.
      expect(await repository.getOwn(fixture.leader)).toMatchObject({ status: "resolved", preference: { mode: "grouped", version: 0, effectiveFrom: null, source: "implicit" } });
      expect(await fixture.repository(fixture.guardian).getOwn(fixture.guardian)).toMatchObject({ status: "resolved", preference: { mode: "omitted", version: 0, effectiveFrom: null, source: "implicit" } });
      const countRows = () => database.withContext({ userId: fixture.leader.userId, email: null }, async (transaction) => (await transaction.execute<{ preferences: number; email_settings: number; deliveries: number }>(sql`select (select count(*)::int from public.admission_notification_preferences where tribe_id=${fixture.tribeId}) as preferences,(select count(*)::int from public.admission_email_settings where tribe_id=${fixture.tribeId}) as email_settings,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
      expect(await countRows()).toEqual({ preferences: 0, email_settings: 0, deliveries: 0 });
      // Act: two explicit initial choices may not both claim version one.
      const firstChoices = await Promise.all((["grouped", "daily"] as const).map((mode) => repository.changeOwn(fixture.leader, { mode, expectedVersion: 0 })));
      expect(firstChoices.map((choice) => choice.status).sort()).toEqual(["changed", "rejected"]);
      expect(firstChoices.find((choice) => choice.status === "rejected")).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
      const first = firstChoices.find((choice) => choice.status === "changed");
      if (first?.status !== "changed") throw new Error("Native preference fixture did not commit its first choice");
      const noOp = await repository.changeOwn(fixture.leader, { mode: first.preference.mode, expectedVersion: 1 });
      expect(noOp).toEqual({ status: "unchanged", preference: first.preference });
      expect(await repository.changeOwn(fixture.leader, { mode: first.preference.mode, expectedVersion: 0 })).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
      const updates = await Promise.all((["individual", "omitted"] as const).map((mode) => repository.changeOwn(fixture.leader, { mode, expectedVersion: 1 })));
      expect(updates.map((choice) => choice.status).sort()).toEqual(["changed", "rejected"]);
      const second = updates.find((choice) => choice.status === "changed");
      if (second?.status !== "changed") throw new Error("Native preference fixture did not commit its changed choice");
      // Assert: database text is returned exactly; no Date conversion can truncate its epoch.
      const persisted = await database.withContext({ userId: fixture.leader.userId, email: null }, async (transaction) => (await transaction.execute<{ mode: string; version: number; effective_from: string; later: boolean }>(sql`select mode,version,effective_from::text,effective_from>${first.preference.effectiveFrom}::timestamptz as later from public.admission_notification_preferences where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`)).rows[0]);
      expect(second.preference).toMatchObject({ mode: persisted.mode, version: 2, effectiveFrom: persisted.effective_from });
      expect(persisted.later).toBe(true);
      expect(await countRows()).toEqual({ preferences: 1, email_settings: 0, deliveries: 0 });
    }, { concurrentTransactions: 2 });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  // Both owner-runtime repetition and forced RLS must preserve account and tribe isolation.
  it("should isolate recipients and reject lost reviewer authority or direct request writes while preserving an explicit choice", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePreferences(database), repository = fixture.repository(fixture.guardian);
      // Arrange: an explicit guardian choice and a distinct tribe remain independently scoped.
      const saved = await repository.changeOwn(fixture.guardian, { mode: "individual", expectedVersion: 0 });
      await fixture.repository(fixture.otherLeader).changeOwn(fixture.otherLeader, { mode: "daily", expectedVersion: 0 });
      await database.grantTablesToNonBypass(["admission_notification_preferences", "tribe_members"]);
      const readVisible = (userId: string) => database.withContext({ userId, email: null }, async (transaction) => (await transaction.execute(sql`select tribe_id,recipient_user_id,mode from public.admission_notification_preferences`)).rows, "non_bypass");
      expect(await readVisible(fixture.guardian.userId)).toEqual([{ tribe_id: fixture.tribeId, recipient_user_id: fixture.guardian.userId, mode: "individual" }]);
      expect(await readVisible(fixture.otherLeader.userId)).toEqual([{ tribe_id: fixture.otherTribeId, recipient_user_id: fixture.otherLeader.userId, mode: "daily" }]);
      // Act/assert: native scope is never authority to impersonate another recipient or tribe.
      await expect(repository.getOwn(fixture.leader)).rejects.toMatchObject({ code: "authentication_required" });
      await expect(repository.getOwn({ ...fixture.guardian, sessionId: fixture.leader.sessionId })).rejects.toMatchObject({ code: "authentication_required" });
      await expect(repository.getOwn({ ...fixture.guardian, tribeId: fixture.otherTribeId })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(database.withContext({ userId: fixture.guardian.userId, email: null }, (transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode) values (${fixture.tribeId},${fixture.leader.userId},'omitted')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      expect(await database.withContext({ userId: fixture.guardian.userId, email: null }, async (transaction) => (await transaction.execute(sql`update public.admission_notification_preferences set mode='omitted' where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.guardian.userId} returning recipient_user_id`)).rows, "non_bypass")).toEqual([]);
      await database.withContext({ userId: fixture.leader.userId, email: null }, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardian.userId}`));
      expect(await readVisible(fixture.guardian.userId)).toEqual([]);
      await expect(repository.getOwn(fixture.guardian)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(repository.changeOwn(fixture.guardian, { mode: "omitted", expectedVersion: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      // Restoring a genuine active reviewer preserves the previously explicit subscription.
      await database.withContext({ userId: fixture.leader.userId, email: null }, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardian.userId}`));
      if (saved.status !== "changed") throw new Error("Native guardian preference was not saved");
      expect(await repository.getOwn(fixture.guardian)).toEqual({ status: "resolved", preference: { ...saved.preference, source: "stored" } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  // The real storage guard and final SQL clock must remain effective for privileged writers too.
  it("should guard identity and version and roll back a staged preference when its locked session expires", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePreferences(database), repository = fixture.repository(fixture.leader);
      const own = { userId: fixture.leader.userId, email: null };
      await repository.changeOwn(fixture.leader, { mode: "grouped", expectedVersion: 0 });
      // Arrange/assert: direct owner writes cannot forge CAS, no-op epochs or identity.
      for (const statement of [
        sql`update public.admission_notification_preferences set mode='daily' where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`,
        sql`update public.admission_notification_preferences set version=2 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`,
        sql`update public.admission_notification_preferences set effective_from=clock_timestamp() where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`,
        sql`update public.admission_notification_preferences set recipient_user_id=${fixture.guardian.userId} where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`,
      ]) await expect(database.withContext(own, (transaction) => transaction.execute(statement))).rejects.toMatchObject({ cause: { code: "23514" } });
      // This additional owned-branch trigger delays the actual write without disabling a shipped guard.
      await database.withContext(own, (transaction) => transaction.execute(sql`create function public.preference_test_write_wait() returns trigger language plpgsql as $$ begin perform pg_sleep(4); return new; end; $$; create trigger preference_test_write_wait after update on public.admission_notification_preferences for each row execute function public.preference_test_write_wait()`));
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '3 seconds' where id=${fixture.leader.sessionId}`));
      let stagedBeforeRollback: { mode: string; version: number } | null = null;
      const expiringRepository = new PostgresAdmissionNotificationPreferenceRepository((_scope, run) => database.withContext(own, async (transaction) => {
        try {
          return await run(transaction);
        } catch (error) {
          // Observe native transaction state before propagating the application failure to rollback.
          stagedBeforeRollback = (await transaction.execute<{ mode: string; version: number }>(sql`select mode,version from public.admission_notification_preferences where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`)).rows[0] ?? null;
          throw error;
        }
      }));
      // Act: the mode/version is staged before the final guard observes real elapsed SQL time.
      await expect(expiringRepository.changeOwn(fixture.leader, { mode: "daily", expectedVersion: 1 })).rejects.toMatchObject({ code: "authentication_required" });
      expect(stagedBeforeRollback).toEqual({ mode: "daily", version: 2 });
      // Assert: original record survives the transaction failure, with no second epoch committed.
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select mode,version from public.admission_notification_preferences where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leader.userId}`)).rows)).toEqual([{ mode: "grouped", version: 1 }]);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
