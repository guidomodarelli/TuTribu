/** @vitest-environment node */
/** Exercises native list uniqueness, original recovery and competing configuration CAS without a provider. @module allowlist-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist persistence", () => {
  it("should preserve version-one creation, aliases, original replay and disabled duplicates without binding accounts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database), context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const create = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: "first.last+tag@example.test" }, displayName: "Grupo" };
      fixture.loseNextReply();
      const original = await fixture.writer.create(create);
      expect(original).toMatchObject({ state: "completed", replayed: true, result: { version: 1, changed: true, created: true } });
      if (original.state !== "completed") throw new Error("Native allowlist fixture expected a committed entry");
      expect(await fixture.writer.create(create)).toEqual(original);
      const entryId = original.result.entryId, editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId);
      const update = { context: editContext, entryId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, patch: { displayName: "Otro nombre", status: "disabled" as const } };
      const changed = await fixture.writer.update(update);
      expect(changed).toMatchObject({ state: "completed", result: { entryId, version: 2, changed: true, created: false } });
      // Later resource changes cannot replace either previously committed result.
      expect(await fixture.writer.create(create)).toEqual(original);
      expect(await fixture.writer.update(update)).toEqual({ ...changed, replayed: true });
      await expect(fixture.writer.update({ ...update, expectedVersion: 2 })).rejects.toMatchObject({ code: "idempotency_conflict" });
      await expect(fixture.writer.update({ ...update, operationId: randomUUID(), patch: { status: "disabled" } })).rejects.toMatchObject({ code: "allowlist_conflict", operationState: "completed" });
      expect(await fixture.writer.update({ ...update, operationId: randomUUID(), expectedVersion: 2, patch: { status: "disabled" } })).toMatchObject({ state: "completed", result: { version: 2, changed: false } });
      const duplicate = { ...create, operationId: randomUUID() };
      await expect(fixture.writer.create(duplicate)).rejects.toMatchObject({ code: "allowlist_conflict", operationId: duplicate.operationId, operationState: "completed" });
      await expect(fixture.writer.create(duplicate)).rejects.toMatchObject({ code: "allowlist_conflict", operationState: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,status,display_name,normalized_contact=${create.contact.value} as same_contact,octet_length(contact_fingerprint) as digest_length from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ version: 2, status: "disabled", display_name: "Otro nombre", same_contact: true, digest_length: 32 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate'`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 2 }]);
      });
      const later = await fixture.writer.update({ ...update, operationId: randomUUID(), expectedVersion: 2, patch: { displayName: "Cambio posterior" } });
      expect(later).toMatchObject({ state: "completed", result: { version: 3, changed: true } });
      expect(await fixture.writer.update(update)).toEqual({ ...changed, replayed: true });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,status,display_name from public.academy_allowlist_entries where id=${entryId}`)).rows)).toEqual([{ version: 3, status: "disabled", display_name: "Cambio posterior" }]);
      const reenable = { ...update, operationId: randomUUID(), expectedVersion: 3, patch: { status: "enabled" as const } };
      expect(await fixture.writer.update(reenable)).toMatchObject({ state: "completed", result: { entryId, version: 4, changed: true } });
      expect(await fixture.writer.update({ ...reenable, operationId: randomUUID(), expectedVersion: 4 })).toMatchObject({ state: "completed", result: { entryId, version: 4, changed: false } });
      await expect(fixture.writer.update({ ...reenable, operationId: randomUUID() })).rejects.toMatchObject({ code: "allowlist_conflict", operationState: "completed" });
      expect(await fixture.writer.update(update)).toEqual({ ...changed, replayed: true });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,status,display_name from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ version: 4, status: "enabled", display_name: "Cambio posterior" }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate'`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, 1_200_000);

  it("should allow one competing writer and complete the stale original without overwriting the winner", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database), context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const created = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "race@example.test" }, displayName: null });
      if (created.state !== "completed") throw new Error("Native allowlist CAS fixture expected a committed entry");
      const entryId = created.result.entryId, editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId);
      const first = { context: editContext, entryId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, patch: { displayName: "Primero" } }, second = { ...first, operationId: randomUUID(), patch: { displayName: "Segundo" } };
      const outcomes = await Promise.allSettled([fixture.writer.update(first), fixture.writer.update(second)]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      expect(rejected).toMatchObject({ reason: { code: "allowlist_conflict", operationState: "completed" } });
      const failed = outcomes[0].status === "rejected" ? first : second;
      await expect(fixture.writer.update(failed)).rejects.toMatchObject({ code: "allowlist_conflict", operationId: failed.operationId, operationState: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        const row = (await transaction.execute<{ version: number; display_name: string }>(sql`select version,display_name from public.academy_allowlist_entries where id=${entryId}`)).rows[0];
        expect(row.version).toBe(2);
        expect(["Primero", "Segundo"]).toContain(row.display_name);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${entryId}`)).rows).toEqual([{ count: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId} and state='completed'`)).rows).toEqual([{ count: 3 }]);
      });
    }, { concurrentTransactions: 2 });
  }, 1_200_000);
});
