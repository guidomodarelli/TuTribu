/** @vitest-environment node */
/** Exercises real list reads, literal wildcard search, microsecond cursors and current leader denial. @module allowlist-reader-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-reader";
import { admissionAllowlistQuerySchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { presentAllowlistEntry } from "@/src/modules/academy-admissions/application/results/allowlist-query-schemas";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist reader", () => {
  it("should retain microsecond page boundaries and literal wildcard search while recording only fixed authorized read facts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database), ids = [randomUUID(), randomUUID(), randomUUID()], foreignTribeId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${foreignTribeId},'Foreign list fixture',${`foreign-${foreignTribeId}`},${fixture.userId})`);
        for (let index = 0; index < ids.length; index += 1) await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,status,created_at) values (${ids[index]},${fixture.tribeId},'email',${`entry-${index}@example.test`},${new Uint8Array(32)},'synthetic-fingerprint',${index === 1 ? 'Grupo %_' : 'Grupo AB'},${index === 1 ? 'disabled' : 'enabled'},${`2026-10-09T04:00:00.00000${index + 1}Z`}::timestamptz)`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name) values (${foreignTribeId},'email','foreign@example.test',${new Uint8Array(32)},'synthetic-fingerprint','Grupo %_')`);
      });
      const context: AuthorizedAdmissionContext = { userId: fixture.userId, sessionId: fixture.sessionId, tribeId: fixture.tribeId, requestId: randomUUID(), action: "manage_allowlist", role: "leader", membershipStatus: "active", resourceId: fixture.tribeId };
      const reader = new PostgresAllowlistReader((_context, run) => database.withContext(fixture.own, run));
      const first = await reader.list(context, { limit: 1 });
      expect(first.entries.map((entry) => entry.id)).toEqual([ids[2]]);
      expect(first.nextCursor?.includes(".000003Z")).toBe(true);
      const second = await reader.list(context, admissionAllowlistQuerySchema.parse({ limit: 1, cursor: first.nextCursor }));
      expect(second.entries.map((entry) => entry.id)).toEqual([ids[1]]);
      const third = await reader.list(context, admissionAllowlistQuerySchema.parse({ limit: 1, cursor: second.nextCursor }));
      expect(third.entries.map((entry) => entry.id)).toEqual([ids[0]]);
      expect(third.nextCursor).toBeNull();
      const found = await reader.list(context, { limit: 25, search: "%_", status: "disabled" });
      expect(found.entries.map((entry) => entry.id)).toEqual([ids[1]]);
      expect(presentAllowlistEntry(found.entries[0])).toMatchObject({ id: ids[1], version: 1, displayName: "Grupo %_", status: "disabled" });
      expect(presentAllowlistEntry(found.entries[0])).not.toHaveProperty("createdByUserId");
      expect(presentAllowlistEntry(found.entries[0])).not.toHaveProperty("fingerprintKeyId");
      await database.withContext(fixture.own, async (transaction) => {
        const accesses = (await transaction.execute<{ actor_user_id: string; operation_id: string | null; resource_version: number | null; metadata: Record<string, unknown> }>(sql`select actor_user_id,operation_id,resource_version,metadata from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='authorized_resource_exposure' order by created_at,id`)).rows;
        expect(accesses).toHaveLength(4);
        expect(accesses.every((access) => access.actor_user_id === fixture.userId && access.operation_id === null && access.resource_version === null)).toBe(true);
        expect(accesses.map((access) => access.metadata)).toEqual(Array.from({ length: 4 }, () => ({ surface: "allowlist", itemCount: 1, resourceKind: "entries" })));
        expect(JSON.stringify(accesses)).not.toContain("@example.test");
        expect(JSON.stringify(accesses)).not.toContain("Grupo");
      });
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(reader.list(context, { limit: 25 })).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 600_000);
});
