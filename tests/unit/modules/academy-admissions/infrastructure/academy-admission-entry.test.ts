/** @vitest-environment node */
/** Exercises actual public offer navigation metadata before/after cutover under ordinary RLS. @module academy-admission-entry-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresProductAccessRepository } from "@/src/modules/product-access/infrastructure/repositories/postgres-product-access-repository";
import { toAcademyOfferDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyOfferDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";

describe("academy admission entry cutover", () => {
  it.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("should navigate to requests only after irreversible activation without changing membership or commercial offer", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261007010000_read_academy_admission_entry.sql");
      const tribeId = randomUUID(), slug = `entry-${tribeId}`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia de ejemplo',${slug},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled,title,description) values (${tribeId},'academy',true,'Academia de ejemplo','Oferta sintética')`);
        await transaction.execute(sql`grant execute on function public.tribe_academy_public_offer(text) to ${sql.identifier(database.nonBypassRole.name)}`);
      });
      for (const role of ["runtime", "non_bypass"] as const) {
        const repository = new PostgresProductAccessRepository((run) => database.withContext({ userId: null, email: null }, run, role));
        const offer = await repository.getPublicOffer({ tribeSlug: slug });
        expect(offer).toMatchObject({ admissionEnabled: true, admissionRequiresRequest: false, title: "Academia de ejemplo", price: null });
        expect(academyOfferDtoSchema.parse(toAcademyOfferDto(offer!)).admissionRequiresRequest).toBe(false);
        expect(await repository.getPublicOffer({ tribeSlug: `missing-${randomUUID()}` })).toBeNull();
      }
      await database.withContext(fixture.own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
      });
      for (const role of ["runtime", "non_bypass"] as const) {
        const repository = new PostgresProductAccessRepository((run) => database.withContext({ userId: null, email: null }, run, role));
        expect(await repository.getPublicOffer({ tribeSlug: slug })).toMatchObject({ admissionEnabled: true, admissionRequiresRequest: true, title: "Academia de ejemplo", price: null });
      }
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${tribeId}) as members,(select count(*)::int from public.academy_admission_requests where tribe_id=${tribeId}) as requests,(select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations`)).rows)).toEqual([{ members: 0, requests: 0, operations: 0 }]);
    });
  }, 180_000);
});
