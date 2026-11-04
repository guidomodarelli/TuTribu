/** @vitest-environment node */
/** Exercises an original admission issuance that meets a live code of the same person and destination, with real SQL, crypto and budgets. @module admission-contact-current-reuse-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("original admission issuance with a live code for the same destination", () => {
  it("should return the live code from another tab without another send, and replace it once it expired", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const first = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (first.state !== "completed") throw new Error("Current reuse fixture expected a committed first code");
      const before = await fixture.counts();
      // Another tab or device has no reference to the first code: it asks for a code with a new operation.
      const second = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2, operationId: randomUUID() });
      expect(second).toMatchObject({ state: "completed", replayed: false, result: { challengeId: first.result.challengeId, deliveryId: first.result.deliveryId, channel: "email", expiresAt: first.result.expiresAt, resendAllowedAt: first.result.resendAllowedAt, reusedCurrent: true } });
      expect(await fixture.counts()).toEqual({ ...before, operations: Number(before.operations) + 1 });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.contact_verification_challenges set created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute' where id=${first.result.challengeId}`));
      await advanceVerificationRequestCooldown(database, { scope: { ...fixture.fixture.scope, tribeId: fixture.context.tribeId }, own: fixture.fixture.own });
      const replaced = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2, operationId: randomUUID() });
      if (replaced.state !== "completed" || !("challengeId" in replaced.result)) throw new Error(`Expired current code was not replaced: ${JSON.stringify(replaced)}`);
      expect(replaced.result.challengeId).not.toBe(first.result.challengeId);
      expect(replaced.result.reusedCurrent).toBeUndefined();
      const lineage = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select id=${first.result.challengeId} as original,state,is_current from public.contact_verification_challenges where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId} order by created_at`));
      expect(lineage.rows).toEqual([{ original: true, state: "invalidated", is_current: false }, { original: false, state: "issued", is_current: true }]);
    });
  }, 600_000);
});
