/** @vitest-environment node */
/** Exercises public/own overview facts and query composition on an owned PostgreSQL branch. @module admission-overview-reader-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOverviewReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-overview-reader";
import { GetAdmissionOverviewUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-overview-use-case";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission overview reader", () => {
  it("should serve public setup without identity and own nonmember state under both roles without a request, claim or message side effect", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const tribeId = randomUUID(), sessionId = randomUUID(), otherUserId = randomUUID(), slug = `overview-${tribeId}`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic existing member',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia sintética',${slug},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open) values (${tribeId},true)`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      });
      await database.grantTablesToNonBypass(["session", "tribe_members"]);
      const query = { slug, requestId: randomUUID() };
      for (const role of ["runtime", "non_bypass"] as const) {
        const reader = new PostgresAdmissionOverviewReader((run) => database.withContext({ userId: null, email: null }, run, role), (scope, run) => database.withContext({ userId: scope.userId, email: null }, run, role), async () => false);
        const publicFacts = await reader.readOverview(query, null);
        expect(publicFacts).toMatchObject({ tribe: { slug, controlActivated: false }, policy: { isOpen: true, version: 1 }, membership: null, request: null });
        expect(JSON.stringify(publicFacts)).not.toContain(otherUserId);
        expect(await reader.readOverview({ ...query, slug: "missing-academy" }, null)).toBeNull();
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
        expect(await new GetAdmissionOverviewUseCase(accounts, reader, () => new Date()).execute(query)).toMatchObject({ ok: true, value: { state: "closed", nextAction: "contact_leader" } });
      }
      await database.withContext(fixture.own, async (transaction) => {
        const requestId = randomUUID();
        await transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,submitted_at,expires_at) select ${requestId},${tribeId},${fixture.userId},'common',now,now+interval '30 days' from instant`);
      });
      const reader = new PostgresAdmissionOverviewReader((run) => database.withContext({ userId: null, email: null }, run), (scope, run) => database.withContext({ userId: scope.userId, email: null }, run), async () => false);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
      expect(await new GetAdmissionOverviewUseCase(accounts, reader, () => new Date()).execute(query)).toMatchObject({ ok: true, value: { state: "pending", nextAction: "view_request" } });
      expect((await reader.readOverview(query, null))?.request).toBeNull();
      await database.withContext(fixture.own, async (transaction) => {
        const instant = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`update public.academy_admission_policies set activated_at=${instant},version=version+1 where tribe_id=${tribeId}`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
        await transaction.execute(sql`delete from public.tribe_academy_settings where tribe_id=${tribeId}`);
      });
      expect(await reader.readIdentity(query)).toMatchObject({ id: tribeId });
      expect(await new GetAdmissionOverviewUseCase(accounts, reader, () => new Date()).execute(query)).toMatchObject({ ok: true, value: { state: "pending", nextAction: "view_request" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`));
      await expect(reader.readOverview(query, { userId: fixture.userId, sessionId })).rejects.toMatchObject({ code: "authentication_required" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.tribe_members where tribe_id=${tribeId}) as members,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows)).toEqual([{ operations: 0, members: 0, deliveries: 0 }]);
    });
  }, 180_000);
});
