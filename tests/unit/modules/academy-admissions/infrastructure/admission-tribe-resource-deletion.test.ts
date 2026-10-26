/** @vitest-environment node */
/** Exercises live personal-proof and CSV relationships during actual tribe deletion. @module admission-tribe-resource-deletion-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("physical tribe personal and import resource deletion", () => {
  it("should delete a personal invitation and its genuinely verified unused proof without retaining a reusable code", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database);
      for (const migration of ["20261005100000_guard_messaging_secret_retirement.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql", "20261010121000_retire_deleted_tribe_messaging.sql"]) await database.applyMigration(migration);
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Personal tribe deletion fixture failed: current_challenge_unavailable");
      const original = issued.result;
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, channel: "email", verificationEpoch: 2 } }, original.challengeId);
      const verified = await operations.verify({ ...fixture.context, challengeId: original.challengeId, verificationCode: code.code, operationId: randomUUID() });
      expect(verified).toMatchObject({ state: "completed", result: { result: "verified", purpose: "admission" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: 1 }]);
        await transaction.execute(sql`delete from public.tribes where id=${fixture.context.tribeId}`);
      });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.contact_verification_challenges where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ retired: true }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and event_type='code_request'`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, 1_200_000);

  it("should remove CSV contacts and rows after completed import while preserving only private original operation provenance", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261009061000_guard_allowlist_import_progress.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql"]) await database.applyMigration(migration);
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => fixture.config);
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport);
      const csvText = "identity,display_name\nretired-import@example.test,Nombre transitorio\n";
      const preview = await repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (preview.state !== "completed") throw new Error("CSV tribe deletion fixture failed: original_preview_unavailable");
      const importId = preview.result.importId;
      const confirmContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
      const confirmed = await repository.confirm({ context: confirmContext, importId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] });
      expect(confirmed).toMatchObject({ state: "completed", result: { counts: { selected: 1, added: 1 } } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_imports where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_import_rows where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_operations where tribe_id=${fixture.tribeId} and operation_type in ('preview_allowlist_import','confirm_allowlist_import')`)).rows).toEqual([{ total: 2 }]);
      });
    });
  }, 1_200_000);
});
