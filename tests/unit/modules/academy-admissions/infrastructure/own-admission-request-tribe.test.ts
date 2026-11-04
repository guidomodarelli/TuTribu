/** @vitest-environment node */
/** Exercises the tribe lookup of an own request link without its tribe, with the real versioned SQL function and account context. @module own-admission-request-tribe-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("tribe of an own request link", () => {
  it("should return the tribe slug only to the request owner with a live session", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), requestId = randomUUID();
      await database.applyMigration("20261101130000_read_own_admission_request_tribe_slug.sql");
      const slug = await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${requestId},${fixture.context.tribeId},${fixture.context.userId},'common',null,null,'none',${now},${new Date(now.getTime() + 86_400_000)})`);
        return (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.context.tribeId}`)).rows[0].slug;
      });
      const own = new PostgresOwnAdmissionRequestReader((_scope, run) => database.withContext(fixture.own, run), async () => false);
      expect(await own.readOwnTribeSlug({ userId: fixture.context.userId, sessionId: fixture.context.sessionId, admissionRequestId: requestId })).toBe(slug);
      expect(await own.readOwnTribeSlug({ userId: fixture.context.userId, sessionId: fixture.context.sessionId, admissionRequestId: randomUUID() })).toBeNull();
      expect(await own.readOwnTribeSlug({ userId: fixture.context.userId, sessionId: randomUUID(), admissionRequestId: requestId })).toBeNull();
      // Another account cannot learn which tribe holds this request.
      const other = new PostgresOwnAdmissionRequestReader((_scope, run) => database.withContext(fixture.fixture.own, run), async () => false);
      expect(await other.readOwnTribeSlug({ userId: fixture.fixture.own.userId, sessionId: fixture.context.sessionId, admissionRequestId: requestId })).toBeNull();
    });
  }, 600_000);
});
