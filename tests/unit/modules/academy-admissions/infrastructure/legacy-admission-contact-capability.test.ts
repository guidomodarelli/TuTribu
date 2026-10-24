/** @vitest-environment node */
/** Prevents billable historical challenges from unavailable arrival attribution. @module legacy-admission-contact-capability-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresLegacyAdmissionInvitationReader } from "@/src/modules/tribes/infrastructure/repositories/postgres-legacy-admission-invitation-reader";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS, LEGACY_ADMISSION_TOKEN_BYTE_LENGTH } from "@/tests/support/constants/legacy-admission-entry";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native historical contact capability guard", () => {
  it.each([false, true])("should deny an unavailable historical source with revoked=$revoked before reserving or issuing a code", async (revoked) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.applyMigration("20261011143000_read_locked_legacy_admission_arrival.sql");
      const token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at,revoked_at) values (${randomUUID()},${fixture.context.tribeId},${createHash("sha256").update(token).digest("hex")},${fixture.fixture.userId},${revoked ? TRIBE_INVITATION_STATUS.revoked : TRIBE_INVITATION_STATUS.active},clock_timestamp(),${revoked ? new Date() : null})`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations(
        (_scope, run) => database.withContext(fixture.own, run),
        async () => fixture.fixture.config,
        (transaction) => new PostgresLegacyAdmissionInvitationReader(transaction),
      );
      await expect(operations.issue({ ...fixture.input, expectedPolicyVersion: 2, source: { kind: ADMISSION_REQUEST_SOURCE.legacy, token: revoked ? token : randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url") } })).rejects.toMatchObject({ code: ADMISSION_ERROR_CODE.invitationUnavailable });
      expect(await fixture.counts()).toMatchObject({ operations: 0, challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
