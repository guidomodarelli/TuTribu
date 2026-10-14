/** @vitest-environment node */
/** Exercises all six retention categories through their real atomic composition roots. @module admission-retention-composition-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionRetentionComposition } from "@/tests/support/admission-retention-composition-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAdmissionDataRetentionModule } from "@/src/modules/academy-admissions/setup";
import { buildMessagingSecretRetentionModule } from "@/src/modules/messaging/setup";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native atomic retention composition", () => {
  it("should commit every due category once while keeping fresh material, selected resources and original result/usage history", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionRetentionComposition(database), backend = { userId: null, email: null };
      const beforeImports = await fixture.imports.snapshot(), beforeCandidates = await fixture.candidates.snapshot(), beforeSecrets = await fixture.secretSnapshot();
      let checkouts = 0;
      const dependencies = { execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => { checkouts += 1; return database.withContext(backend, run); }, authorize: async () => true, readRecoveryLock: async () => false };
      const admissions = buildAdmissionDataRetentionModule(dependencies).useCases.purgeData;
      const messaging = buildMessagingSecretRetentionModule(dependencies).useCases.purgeSecrets;
      await expect(admissions.execute({ auditLimit: 2_001 })).rejects.toMatchObject({ code: "invalid_input" });
      await expect(messaging.execute({ verificationLimit: 101 })).rejects.toMatchObject({ code: "invalid_input" });
      expect(checkouts).toBe(0);
      expect(await admissions.execute()).toEqual({ importMaterial: { purgedRows: 6, completedImports: 2 }, privateData: { requestsMinimized: 2, auditEventsPurged: 1, archivedAuditEventsPurged: 1, remainingRequests: false, remainingAuditEvents: false } });
      expect(checkouts).toBe(1);
      expect(await messaging.execute()).toEqual({ candidates: { expired: 3, purgedImmediately: 1 }, retiredSecretsPurged: 1, verificationMaterialPurged: 1 });
      expect(checkouts).toBe(2);
      expect(await admissions.execute()).toEqual({ importMaterial: { purgedRows: 0, completedImports: 0 }, privateData: { requestsMinimized: 0, auditEventsPurged: 0, archivedAuditEventsPurged: 0, remainingRequests: false, remainingAuditEvents: false } });
      expect(await messaging.execute()).toEqual({ candidates: { expired: 0, purgedImmediately: 0 }, retiredSecretsPurged: 0, verificationMaterialPurged: 0 });
      const afterImports = await fixture.imports.snapshot(), afterCandidates = await fixture.candidates.snapshot(), afterSecrets = await fixture.secretSnapshot();
      expect(afterImports.entries).toEqual(beforeImports.entries); expect(afterImports.operations).toEqual(beforeImports.operations); expect(afterImports.selections).toEqual(beforeImports.selections);
      const freshImport = fixture.imports.cases.find((resource) => resource.name === "fresh")!;
      expect(afterImports.rows.filter((row) => row.import_id === freshImport.importId)).toEqual(beforeImports.rows.filter((row) => row.import_id === freshImport.importId));
      expect(afterCandidates.usage).toEqual(beforeCandidates.usage); expect(afterCandidates.events).toEqual(beforeCandidates.events);
      const selected = fixture.candidates.cases.find((resource) => resource.name === "selected")!;
      expect(afterCandidates.connections.find((resource) => resource.id === selected.connectionId)).toEqual(beforeCandidates.connections.find((resource) => resource.id === selected.connectionId));
      expect(afterCandidates.resources.find((resource) => resource.connection_id === selected.connectionId && resource.version === 1)).toEqual(beforeCandidates.resources.find((resource) => resource.connection_id === selected.connectionId && resource.version === 1));
      const freshCandidate = fixture.candidates.cases.find((resource) => resource.name === "fresh")!;
      expect(afterCandidates.connections.find((resource) => resource.id === freshCandidate.connectionId)).toEqual(beforeCandidates.connections.find((resource) => resource.id === freshCandidate.connectionId));
      expect(afterCandidates.resources.find((resource) => resource.connection_id === freshCandidate.connectionId)).toEqual(beforeCandidates.resources.find((resource) => resource.connection_id === freshCandidate.connectionId));
      for (const resource of fixture.candidates.cases.filter((candidate) => candidate.name !== "selected" && candidate.name !== "fresh")) {
        expect(afterCandidates.connections.find((connection) => connection.id === resource.connectionId)).toMatchObject({ version: 2, is_candidate: false, candidate_version: null, selected_version: resource.selectedVersion });
      }
      expect(afterSecrets.retiredSecret).toEqual(beforeSecrets.retiredSecret.map((resource) => ({ ...resource, purged: true, has_material: false })));
      expect(afterSecrets.verification.find((resource) => resource.id === fixture.currentVerificationId)).toEqual(beforeSecrets.verification.find((resource) => resource.id === fixture.currentVerificationId));
      expect(afterSecrets.verification.find((resource) => resource.id === fixture.expiredVerificationId)).toMatchObject({ has_mac: true, has_envelope: false, code_envelope_id: null });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should roll back imports and private data together when authority or restore changes after every admission owner has staged effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionRetentionComposition(database), backend = { userId: null, email: null };
      const beforeImports = await fixture.imports.snapshot(), beforePrivate = await fixture.admissionSnapshot();
      const staged = async (transaction?: RequestDatabase) => transaction ? (await transaction.execute<{ minimized: boolean }>(sql`select private_material_minimized_at is not null as minimized from public.academy_admission_requests where id=${fixture.privateData.oldRequestId}`)).rows[0].minimized : false;
      for (const recovery of [false, true]) {
        const useCase = buildAdmissionDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async (transaction) => recovery || !await staged(transaction), readRecoveryLock: async (transaction) => recovery && await staged(transaction) }).useCases.purgeData;
        await expect(useCase.execute()).rejects.toMatchObject({ code: recovery ? "resource_unavailable" : "permission_denied", operation: "purge_admission_data" });
        expect(await fixture.imports.snapshot()).toEqual(beforeImports);
        expect(await fixture.admissionSnapshot()).toEqual(beforePrivate);
      }
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should stop before checkout and roll back all secret owners when current authority or restore changes after OTP destruction", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionRetentionComposition(database), backend = { userId: null, email: null };
      const beforeCandidates = await fixture.candidates.snapshot(), beforeSecrets = await fixture.secretSnapshot();
      let checkouts = 0;
      const execute = <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => { checkouts += 1; return database.withContext(backend, run); };
      await expect(buildMessagingSecretRetentionModule({ execute, authorize: async () => false, readRecoveryLock: async () => false }).useCases.purgeSecrets.execute()).rejects.toMatchObject({ code: "permission_denied" });
      await expect(buildMessagingSecretRetentionModule({ execute, authorize: async () => true, readRecoveryLock: async () => true }).useCases.purgeSecrets.execute()).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(checkouts).toBe(0);
      const staged = async (transaction?: RequestDatabase) => transaction ? (await transaction.execute<{ removed: boolean }>(sql`select code_envelope_id is null as removed from public.contact_verification_challenges where id=${fixture.expiredVerificationId}`)).rows[0].removed : false;
      for (const recovery of [false, true]) {
        const useCase = buildMessagingSecretRetentionModule({ execute, authorize: async (transaction) => recovery || !await staged(transaction), readRecoveryLock: async (transaction) => recovery && await staged(transaction) }).useCases.purgeSecrets;
        await expect(useCase.execute()).rejects.toMatchObject({ code: recovery ? "resource_unavailable" : "permission_denied" });
        expect(await fixture.candidates.snapshot()).toEqual(beforeCandidates);
        expect(await fixture.secretSnapshot()).toEqual(beforeSecrets);
      }
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should preserve an uncertain original commit for each atomic batch and reconcile its source without an automatic retry", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionRetentionComposition(database), backend = { userId: null, email: null };
      let executions = 0;
      const acknowledgement = new Error("Synthetic aggregate retention commit response lost");
      const execute = async <Result>(run: (transaction: RequestDatabase) => Promise<Result>): Promise<Result> => { executions += 1; await database.withContext(backend, run); throw acknowledgement; };
      const dependencies = { execute, authorize: async () => true, readRecoveryLock: async () => false };
      await expect(buildAdmissionDataRetentionModule(dependencies).useCases.purgeData.execute()).rejects.toMatchObject({ code: "operation_unresolved", cause: acknowledgement });
      expect(executions).toBe(1);
      expect((await fixture.imports.snapshot()).rows.filter((row) => !row.has_input && !row.has_validation)).toHaveLength(6);
      expect((await fixture.admissionSnapshot()).requests.filter((request) => request.minimized)).toHaveLength(2);
      await expect(buildMessagingSecretRetentionModule(dependencies).useCases.purgeSecrets.execute()).rejects.toMatchObject({ code: "operation_unresolved", cause: acknowledgement });
      expect(executions).toBe(2);
      expect((await fixture.secretSnapshot()).retiredSecret[0]).toMatchObject({ has_material: false, purged: true });
      const confirmed = { ...dependencies, execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(backend, run) };
      expect((await buildAdmissionDataRetentionModule(confirmed).useCases.purgeData.execute()).importMaterial).toEqual({ purgedRows: 0, completedImports: 0 });
      expect(await buildMessagingSecretRetentionModule(confirmed).useCases.purgeSecrets.execute()).toEqual({ candidates: { expired: 0, purgedImmediately: 0 }, retiredSecretsPurged: 0, verificationMaterialPurged: 0 });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
