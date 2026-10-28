/** @vitest-environment node */
/** Exercises actual base identity effects and their serial transport budget. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { createAdmissionStatementObserver, observeAdmissionDatabase } from "@/tests/support/admission-database-observation";
import { ADMISSION_BASE_BINDING_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-base-binding-validation";
import { bindBaseAdmissionContact } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-base-admission-binding";
import { readAllowlistAdmissionFacts } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-admission-facts";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import type { AutomaticAdmissionFacts } from "@/src/modules/academy-admissions/domain/entities/automatic-admission-decision";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { prepareBaseAdmissionBinding, writeBaseAdmissionBinding } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-base-admission-binding-storage";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_CONTACT_BINDING_LOCK_DOMAIN } from "@/src/modules/academy-admissions/constants/admission-proof";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native base contact binding transport", () => {
  it("should bind the actual capture within budget and roll back a failed request CAS", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      /** @returns A distinct persisted own request and the current native base capture. */
      const prepareSubmission = async () => {
        const claimant = await applicant();
        const context = { userId: claimant.userId, email: claimant.email };
        const contact = { type: ADMISSION_CONTACT_TYPE.email, value: claimant.email };
        const scope = { userId: claimant.userId, sessionId: claimant.sessionId, tribeId: fixture.tribeId, requestId: randomUUID() };
        const proposal = await database.withContext(context, async (transaction) => {
          const policy = await readAdmissionPolicy(transaction, fixture.tribeId, false);
          if (!policy) throw new Error("Base binding transport preparation failed: policy_unavailable");
          const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId: fixture.tribeId, userId: claimant.userId, source: ADMISSION_REQUEST_SOURCE.common, contact, evidence: { kind: ADMISSION_EVIDENCE_KIND.declared }, policy, message: null, now });
          await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${request.id},${request.tribeId},${request.userId},${request.source},${contact.type},${contact.value},${request.evidence.kind},${JSON.stringify(request.originalPolicy)}::jsonb,${request.submittedAt},${request.expiresAt})`);
          const current = await readAllowlistAdmissionFacts(transaction, scope, contact);
          const facts: AutomaticAdmissionFacts = { ...current, now, tribe: { id: fixture.tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, policy, source: { kind: ADMISSION_REQUEST_SOURCE.common }, contact, membership: null, localProof: null, currentConnection: null };
          return { request, facts };
        });
        return { ...proposal, claimant, context, contact, scope };
      };
      const prepared = await prepareSubmission();
      const { claimant, context, scope } = prepared;
      const namespace = JSON.stringify([ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, fixture.tribeId, prepared.contact.type, prepared.contact.value]);
      const contended = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${namespace},0))`);
      }, () => database.withContext(context, (transaction) => prepareBaseAdmissionBinding(transaction, fixture.tribeId, prepared.contact)));
      expect(contended).toEqual({ status: "fulfilled", value: { binding_id: null, binding_owner_user_id: null, has_minimized_bindings: false } });
      const observation = await database.withContext(context, async (transaction) => {
        const observer = createAdmissionStatementObserver();
        await bindBaseAdmissionContact(observeAdmissionDatabase(transaction, observer), scope, { request: prepared.request, facts: prepared.facts }, fixture.config);
        return observer.snapshot();
      });
      const stored = await database.withContext(context, async (transaction) => (await transaction.execute<{ version: number; evidence_source: string; capture_id: string; owner_user_id: string; fingerprint_matches: boolean }>(sql`select request.version,request.evidence_source,request.global_identity_evidence_id as capture_id,binding.owner_user_id,request.contact_fingerprint=binding.contact_fingerprint as fingerprint_matches from public.academy_admission_requests request join public.academy_admission_contact_bindings binding on binding.id=request.binding_id where request.id=${prepared.request.id}`)).rows[0]);
      expect(stored).toEqual({ version: VALIDATION.boundRequestVersion, evidence_source: ADMISSION_EVIDENCE_KIND.base, capture_id: claimant.evidenceId, owner_user_id: claimant.userId, fingerprint_matches: true });
      const stale = database.withContext(context, (transaction) => bindBaseAdmissionContact(transaction, scope, { request: prepared.request, facts: prepared.facts }, fixture.config));
      await expect(stale).rejects.toMatchObject({ code: ADMISSION_ERROR_CODE.requestConflict });
      expect(await database.withContext(context, async (transaction) => (await transaction.execute(sql`select version from public.academy_admission_requests where id=${prepared.request.id}`)).rows)).toEqual([{ version: VALIDATION.boundRequestVersion }]);

      const failedCas = await prepareSubmission();
      await expect(database.withContext(failedCas.context, (transaction) => bindBaseAdmissionContact(transaction, failedCas.scope, { request: { ...failedCas.request, version: VALIDATION.boundRequestVersion }, facts: failedCas.facts }, fixture.config))).rejects.toMatchObject({ code: ADMISSION_ERROR_CODE.requestConflict });
      const rolledBack = await database.withContext(failedCas.context, async (transaction) => ({
        bindings: (await transaction.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${failedCas.claimant.userId}`)).rows,
        requests: (await transaction.execute(sql`select version,evidence_source,binding_id,global_identity_evidence_id from public.academy_admission_requests where id=${failedCas.request.id}`)).rows,
      }));
      expect(rolledBack).toEqual({ bindings: [], requests: [{ version: VALIDATION.initialRequestVersion, evidence_source: ADMISSION_EVIDENCE_KIND.declared, binding_id: null, global_identity_evidence_id: null }] });

      const restrictedRole = `admission_binding_${randomUUID().replaceAll("-", "")}`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql.raw(`create role "${restrictedRole}" nologin nobypassrls`));
        await transaction.execute(sql.raw(`grant "${restrictedRole}" to current_user`));
        await transaction.execute(sql.raw(`grant usage on schema public to "${restrictedRole}"`));
      });
      /** @param run - An actual native operation attempted with no table privileges. @returns Safe SQLSTATE metadata only. */
      const restrictedAccess = (run: (transaction: RequestDatabase) => Promise<unknown>) => database.withContext(context, async (transaction) => {
        await transaction.execute(sql.raw(`set local role "${restrictedRole}"`));
        return run(transaction);
      }).then(() => [], (error: unknown) => readPostgresTestDiagnostics(error).sqlStates);
      expect(await restrictedAccess((transaction) => transaction.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} for update`))).toContain(VALIDATION.permissionDeniedSqlState);
      expect(await restrictedAccess((transaction) => prepareBaseAdmissionBinding(transaction, fixture.tribeId, prepared.contact))).toContain(VALIDATION.permissionDeniedSqlState);
      const fingerprint = await createAdmissionContactFingerprint(failedCas.contact, fixture.config);
      expect(await restrictedAccess((transaction) => writeBaseAdmissionBinding(transaction, failedCas.request, failedCas.contact, { evidenceId: failedCas.claimant.evidenceId, fingerprint, bindingId: null }))).toContain(VALIDATION.permissionDeniedSqlState);
      const metadata = await database.withContext(context, async (transaction) => (await transaction.execute<{ invoker: boolean; volatility: string }>(sql`select not prosecdef as invoker,provolatile as volatility from pg_proc where oid in ('public.prepare_base_admission_contact_binding(uuid,text,text,text)'::regprocedure,'public.write_base_admission_contact_binding(uuid,text,uuid,integer,text,text,uuid,bytea,text,uuid)'::regprocedure)`)).rows);
      expect(metadata).toHaveLength(VALIDATION.sqlHelpers);
      expect(metadata.every((routine) => routine.invoker && routine.volatility === "v")).toBe(true);
      expect(observation.pendingStatements).toBe(0);
      expect(observation.statementCount).toBeLessThanOrEqual(VALIDATION.maximumStatements);
    }, { concurrentTransactions: VALIDATION.concurrentTransactions });
  }, VALIDATION.timeoutMs);
});
