/** @vitest-environment node */
/** Exercises own common pending code issuance without first-contact attachment or renewal. @module admission-pending-contact-issuance-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY } from "@/src/constants/time";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native common pending contact issuance", () => {
  it.each([
    { reason: "fixed contact", contact: "synthetic-fixed@example.test", expired: false, code: "contact_binding_conflict" },
    { reason: "expired request", contact: null, expired: true, code: "request_conflict" },
  ])("should deny $reason before claiming or issuing and preserve the original pending", async ({ contact, expired, code }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), admissionRequestId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now), dayDurationMs = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND, requestAgeMs = expired ? ADMISSION_LIMIT.pendingValidityMs + dayDurationMs : dayDurationMs, submittedAt = new Date(now.getTime() - requestAgeMs), expiresAt = new Date(submittedAt.getTime() + ADMISSION_LIMIT.pendingValidityMs);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${admissionRequestId},${fixture.context.tribeId},${fixture.context.userId},'common',${contact ? "email" : null},${contact},${contact ? "declared" : "none"},${submittedAt},${expiresAt})`);
      });
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,contact_type,normalized_contact,submitted_at,expires_at from public.academy_admission_requests where id=${admissionRequestId}`)).rows[0]);
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      await expect(operations.issue({ ...fixture.input, expectedPolicyVersion: 2, admissionRequestId })).rejects.toMatchObject({ code });
      expect(await fixture.counts()).toMatchObject({ operations: 0, challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,contact_type,normalized_contact,submitted_at,expires_at from public.academy_admission_requests where id=${admissionRequestId}`)).rows[0])).toEqual(original);
    });
  }, 600_000);

  it("should issue for an own pending with its first proposed contact while keeping request, binding and original dates intact", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), admissionRequestId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${admissionRequestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`);
      });
      const readPending = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,contact_type,normalized_contact,proof_id,binding_id,evidence_source,submitted_at,expires_at from public.academy_admission_requests where id=${admissionRequestId}`)).rows[0]);
      const original = await readPending(), operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const input = { ...fixture.input, expectedPolicyVersion: 2, admissionRequestId };
      const issued = await operations.issue(input);
      expect(issued).toMatchObject({ state: "completed", replayed: false, result: { purpose: "admission", channel: "email" } });
      expect(await operations.issue(input)).toMatchObject({ state: "completed", replayed: true });
      expect(await readPending()).toEqual(original);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows)).toEqual([{ count: 0 }]);
      await expect(operations.issue({ ...input, operationId: randomUUID(), admissionRequestId: randomUUID() })).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, operations: 1, proofs: 0, memberships: 0 });
    });
  }, 600_000);
});
