/** @vitest-environment node */
/** Measures native pg transactions, statements and sequential round trips per invocation of the admission maintenance route (expiry, purge, reminders, notice producer, outbox dispatch, leases) on the real built server, behind the closed synthetic provider transport. @module admission-maintenance-queries-tests */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionRequestMeasurement, findAdmissionBudgetOverruns, signedAdmissionSessionCookie, withAdmissionQueryCounter } from "@/tests/support/admission-request-measurement";
import { ADMISSION_REQUEST_MEASUREMENT } from "@/tests/support/constants/admission-request-measurement";
import { ADMISSION_MAINTENANCE_QUERY_BUDGET as BUDGET, ADMISSION_MAINTENANCE_QUERY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-maintenance-queries";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

const SAMPLES = ADMISSION_REQUEST_MEASUREMENT.samples;
/** Phase summary kept as evidence: status and metrics only, never identifiers. */
type PhaseSummary = { phase: string; status: string; metrics: { key: string; value: number }[] };

/**
 * @param database - Owned branch.
 * @param context - Seeding identity.
 * @param existingUserId - Existing user that gets a fresh session instead of a new account.
 * @returns A Google-bound account with a live session, held only in memory.
 */
async function seedSessionAccount(database: AcademyAdmissionTestDatabase, context: { userId: string; email: string | null }, existingUserId?: string) {
  const userId = existingUserId ?? randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  return database.withContext(context, async (transaction) => {
    const email = existingUserId ? (await transaction.execute<{ email: string }>(sql`select email from public."user" where id=${existingUserId}`)).rows[0].email : `${userId}@example.test`;
    if (!existingUserId) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Solicitante de mantenimiento',${email},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
    return { userId, email, sessionToken };
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission maintenance query counts", () => {
  it("should keep every maintenance invocation within its database budget, with and without pending work", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, await readMessagingHostingSecurityConfig()), tribeId = fixture.context.tribeId, slug = `issue-${tribeId}`;
      const leader = await seedSessionAccount(database, fixture.fixture.own, fixture.fixture.userId);
      const applicants = await Promise.all(Array.from({ length: SAMPLES }, () => seedSessionAccount(database, fixture.fixture.own)));
      const cronSecret = randomUUID(), measurement = createAdmissionRequestMeasurement({}), phases: { label: string; phases: PhaseSummary[] }[] = [];

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const { send, measure } = measurement.connect({ origin });
        const api = `/api/tribes/${slug}/admissions`, maintenance = { path: VALIDATION.maintenancePath, headers: { authorization: `Bearer ${cronSecret}` } };
        const leaderCookie = await signedAdmissionSessionCookie(leader.sessionToken, secret, makeSignature);
        /** @param label - Report label. @param text - Maintenance response whose phase summary is kept as evidence. */
        const keepPhases = (label: string, text: string) => {
          const body = JSON.parse(text) as { phases?: PhaseSummary[] };
          phases.push({ label, phases: (body.phases ?? []).map(({ phase, status: phaseStatus, metrics }) => ({ phase, status: phaseStatus, metrics })) });
        };
        // Leader email notices are on, so new requests produce notices for the producer and the outbox.
        const enabled = await send("POST", { path: `${api}/email-settings`, cookie: leaderCookie, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 0, enabled: true, timeZone: "America/Argentina/Buenos_Aires" } });
        expect(enabled.status).toBe(200);
        // Warm-up drains any work the fixture left and compiles the route; it is not reported.
        await send("GET", maintenance);
        for (const applicant of applicants) {
          const submitted = await send("POST", { path: `${api}/submissions`, cookie: await signedAdmissionSessionCookie(applicant.sessionToken, secret, makeSignature), body: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 } });
          expect(submitted.status).toBe(201);
          const [text] = await measure("maintenance_with_new_request", "GET", [maintenance], VALIDATION.maintenanceStatuses);
          keepPhases("maintenance_with_new_request", text);
        }
        for (let index = 0; index < SAMPLES; index += 1) {
          const [text] = await measure("maintenance_idle", "GET", [maintenance], VALIDATION.maintenanceStatuses);
          keepPhases("maintenance_idle", text);
        }
      }, withAdmissionQueryCounter(measurement.onQueryCount, {
        preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")],
        environment: { CRON_SECRET: cronSecret, ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_NOTIFICATION_RECIPIENTS: leader.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" },
      })));

      const report = { requests: measurement.report(), phases };
      process.stdout.write(`${JSON.stringify({ phase: "admission_maintenance_queries", report })}\n`);
      if (process.env[VALIDATION.reportEnvironmentVariable]) await writeFile(process.env[VALIDATION.reportEnvironmentVariable]!, JSON.stringify(report, null, 2));
      expect(await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as requests from public.academy_admission_requests where tribe_id=${tribeId}`)).rows)).toEqual([{ requests: SAMPLES }]);
      expect(findAdmissionBudgetOverruns(measurement.measured, BUDGET)).toEqual([]);
    });
  }, VALIDATION.timeoutMs);
});
