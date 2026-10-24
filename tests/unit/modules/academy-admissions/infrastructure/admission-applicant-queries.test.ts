/** @vitest-environment node */
/** Measures native pg transactions, statements and sequential round trips per applicant admission page and command on the real built server, behind the closed synthetic provider transport. @module admission-applicant-queries-tests */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionRequestMeasurement, findAdmissionBudgetOverruns, signedAdmissionSessionCookie, withAdmissionQueryCounter } from "@/tests/support/admission-request-measurement";
import { ADMISSION_REQUEST_MEASUREMENT } from "@/tests/support/constants/admission-request-measurement";
import { ADMISSION_APPLICANT_QUERY_BUDGET as BUDGET, ADMISSION_APPLICANT_QUERY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-applicant-queries";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";

const SAMPLES = ADMISSION_REQUEST_MEASUREMENT.samples;
/** @param text - JSON command response. @returns Its original result. */
const resultOf = (text: string) => (JSON.parse(text) as { result: Record<string, unknown> }).result;

/**
 * @param database - Owned branch.
 * @param context - Seeding identity.
 * @param name - Display name of a new synthetic account.
 * @param existingUserId - Existing user that gets a fresh session instead of a new account.
 * @returns A Google-bound account with a live session, held only in memory.
 */
async function seedSessionAccount(database: AcademyAdmissionTestDatabase, context: { userId: string; email: string | null }, name: string, existingUserId?: string) {
  const userId = existingUserId ?? randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  return database.withContext(context, async (transaction) => {
    const email = existingUserId ? (await transaction.execute<{ email: string }>(sql`select email from public."user" where id=${existingUserId}`)).rows[0].email : `${userId}@example.test`;
    if (!existingUserId) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${name},${email},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
    return { userId, email, sessionToken };
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native applicant query counts", () => {
  it("should keep applicant pages and commands within their per-request database budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, await readMessagingHostingSecurityConfig()), tribeId = fixture.context.tribeId, slug = `issue-${tribeId}`;
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${tribeId}`));
      const leader = await seedSessionAccount(database, fixture.fixture.own, "", fixture.fixture.userId);
      const common = await Promise.all(Array.from({ length: SAMPLES }, (_, index) => seedSessionAccount(database, fixture.fixture.own, `Solicitante medido ${index + 1}`)));
      const invited = await Promise.all(Array.from({ length: SAMPLES }, (_, index) => seedSessionAccount(database, fixture.fixture.own, `Invitado medido ${index + 1}`)));
      const applicants = [...common, ...invited], codes = new Map<string, string>();
      let lastCode = "";
      const measurement = createAdmissionRequestMeasurement({ [slug]: "[slug]" });

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const { send, measure } = measurement.connect({ origin });
        const cookies = new Map(await Promise.all(applicants.map(async (applicant) => [applicant.userId, await signedAdmissionSessionCookie(applicant.sessionToken, secret, makeSignature)] as const)));
        const leaderCookie = await signedAdmissionSessionCookie(leader.sessionToken, secret, makeSignature), api = `/api/tribes/${slug}/admissions`;
        /** @returns The synthetic code received for the challenge just issued. */
        const awaitCode = async () => {
          for (let attempt = 0; attempt < VALIDATION.codePolls && !lastCode; attempt += 1) await delay(VALIDATION.codePollMs);
          if (!lastCode) throw new Error("Applicant measurement expected the private synthetic verification receipt");
          const code = lastCode; lastCode = ""; return code;
        };
        // Warm-up compiles the applicant routes; none of it is reported.
        await send("GET", { path: `/admissions/${slug}`, cookie: cookies.get(applicants[0].userId) });
        await send("GET", { path: `${api}/own-request`, cookie: cookies.get(applicants[0].userId) });

        // Invitations are issued by the leader before the applicants arrive; that cost belongs to the leader workspace suite.
        const tokens: string[] = [];
        for (const applicant of invited) {
          const response = await send("POST", { path: `${api}/invitations`, cookie: leaderCookie, body: { operationId: randomUUID(), confirmed: true, internalName: "Invitación del solicitante medido", recipient: { type: "email", value: applicant.email }, requiresAllowlist: false, acknowledgeNoAllowlist: true } });
          expect({ status: response.status, code: response.status === 201 ? null : JSON.parse(response.text).code }).toEqual({ status: 201, code: null });
          const token = new URL(String(JSON.parse(response.text).invitationUrl)).pathname.split("/").at(-1)!;
          measurement.addRedaction(token, "[token]");
          tokens.push(token);
        }

        await measure("page_public_entry", "GET", common.map((applicant) => ({ path: `/admissions/${slug}`, cookie: cookies.get(applicant.userId) })));
        await measure("page_invitation_entry", "GET", invited.map((applicant, index) => ({ path: `/admissions/invitations/${tokens[index]}`, cookie: cookies.get(applicant.userId) })));
        await measure("read_invitation_overview", "GET", invited.map((applicant, index) => ({ path: `/api/admissions/invitations/${tokens[index]}/overview`, cookie: cookies.get(applicant.userId) })));
        const challenges = new Map<string, string>();
        for (const applicant of applicants) {
          const [issued] = await measure("issue_verification_code", "POST", [{ path: `${api}/challenges`, cookie: cookies.get(applicant.userId), body: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 2, channel: "email" } }], [201]);
          challenges.set(applicant.userId, String(resultOf(issued).challengeId));
          codes.set(applicant.userId, await awaitCode());
        }
        const proofs = new Map<string, string>();
        for (const applicant of applicants) {
          const [verified] = await measure("verify_verification_code", "POST", [{ path: `${api}/challenges/${challenges.get(applicant.userId)}/verify`, cookie: cookies.get(applicant.userId), body: { operationId: randomUUID(), confirmed: true, verificationCode: codes.get(applicant.userId) } }]);
          proofs.set(applicant.userId, String(resultOf(verified).proofId));
        }
        const requests = (await measure("submit_request", "POST", common.map((applicant) => ({ path: `${api}/submissions`, cookie: cookies.get(applicant.userId), body: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 2, proofId: proofs.get(applicant.userId) } })), [201])).map((text) => String((JSON.parse(text) as { request: { id: string } }).request.id));
        await measure("redeem_invitation", "POST", invited.map((applicant, index) => ({ path: `${api}/submissions`, cookie: cookies.get(applicant.userId), body: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 2, invitationToken: tokens[index], proofId: proofs.get(applicant.userId) } })), [201]);
        await measure("read_own_request", "GET", common.map((applicant) => ({ path: `${api}/own-request`, cookie: cookies.get(applicant.userId) })));
        await measure("page_own_request", "GET", common.map((applicant, index) => ({ path: `/admissions/requests/${requests[index]}`, cookie: cookies.get(applicant.userId) })));
      }, withAdmissionQueryCounter(measurement.onQueryCount, {
        preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")],
        environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: applicants.map((applicant) => applicant.email).join(","), ADMISSION_TEST_ZAVU_TEST_MODE: "false" },
        onDiagnosticCode: (code) => { lastCode = code; },
      })));

      const report = measurement.report();
      process.stdout.write(`${JSON.stringify({ phase: "admission_applicant_queries", report })}\n`);
      if (process.env[VALIDATION.reportEnvironmentVariable]) await writeFile(process.env[VALIDATION.reportEnvironmentVariable]!, JSON.stringify(report, null, 2));
      expect(await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${tribeId}) as requests,(select count(*)::int from public.contact_verification_challenges where tribe_id=${tribeId}) as challenges`)).rows)).toEqual([{ requests: SAMPLES * 2, challenges: SAMPLES * 2 }]);
      expect(findAdmissionBudgetOverruns(measurement.measured, BUDGET)).toEqual([]);
    });
  }, VALIDATION.timeoutMs);
});
