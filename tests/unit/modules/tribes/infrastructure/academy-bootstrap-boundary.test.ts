/** @vitest-environment node */
/** Exercises the actual creator bootstrap and protected raw SQL under both database roles. @module academy-bootstrap-boundary-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { createTribe } from "@/src/modules/tribes/application/use-cases/create-tribe-use-case";
import { PostgresTribeCreationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { PostgresTribeCreatorWhitelistRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";
import { LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS } from "@/tests/support/constants/legacy-admission-entry";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native academy bootstrap boundary", () => {
  it("should bootstrap only the creator as the first leader and reject another role or paid flag after protection under runtime and non-bypass SQL", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database), applicantId = randomUUID();
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_creator_whitelist(email) values (${fixture.own.email}) on conflict do nothing`);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Participante de ejemplo',${`${applicantId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
      });
      const executor = <Result>(run: Parameters<typeof database.withContext<Result>>[1]) => database.withContext(fixture.own, run);
      const create = createTribe({ tribeCreationRepository: new PostgresTribeCreationRepository(executor), tribeCreatorWhitelistRepository: new PostgresTribeCreatorWhitelistRepository(executor) });
      const result = await create({ creatorId: fixture.userId, creatorEmail: fixture.own.email, name: "Academia de ejemplo", slug: `bootstrap-${randomUUID()}` });
      expect(result).toMatchObject({ status: "created", leaderMemberRole: "leader" });
      if (result.status !== "created") throw new Error("AcademyBootstrapBoundaryTest: native creator did not create its tribe");
      const tribeId = result.tribeId;
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select user_id,role,status,admission_membership_effect_id from public.tribe_members where tribe_id=${tribeId}`)).rows).toEqual([{ user_id: fixture.userId, role: "leader", status: "active", admission_membership_effect_id: null }]);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_policies(tribe_id,is_open,activated_at) select ${tribeId},true,now from instant`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=(select activated_at from public.academy_admission_policies where tribe_id=${tribeId}) where id=${tribeId}`);
      });
      await database.grantTablesToNonBypass(["tribe_members"]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`grant select on public.tribes,public.tribe_invitations,public.tribe_subscription_prices to ${sql.identifier(database.nonBypassRole.name)}`));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`grant execute on function public.can_open_join_tribe_free(uuid),public.can_open_join_tribe_paid_plan(uuid) to ${sql.identifier(database.nonBypassRole.name)}`));
      for (const role of ["runtime", "non_bypass"] as const) for (const proposedRole of ["leader", "guardian", "tribemate"] as const) {
        let deniedCode: string | null = null;
        try { await database.withContext({ userId: applicantId, email: null }, async (transaction) => {
          await transaction.execute(sql`select set_config('app.paid','true',true),set_config('app.academy_admissions_enabled','false',true)`);
          return transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${applicantId},${proposedRole},'active')`);
        }, role); } catch (error) {
          const databaseError = error instanceof Error && "cause" in error ? error.cause : error;
          deniedCode = databaseError && typeof databaseError === "object" && "code" in databaseError ? String(databaseError.code) : "unknown";
        }
        if (deniedCode !== "23514") throw new Error(`AcademyBootstrapBoundaryTest: ${role}/${proposedRole} requires source guard, received ${deniedCode ?? "no_denial"}`);
      }
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select user_id,role,status from public.tribe_members where tribe_id=${tribeId}`)).rows).toEqual([{ user_id: fixture.userId, role: "leader", status: "active" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${tribeId}`)).rows).toEqual([]);
      });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
