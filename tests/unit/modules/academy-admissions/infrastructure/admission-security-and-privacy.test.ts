/** @vitest-environment node */
/** Exercises crossed native HTTP resources and caller-controlled send payloads without granting authority. @module admission-security-and-privacy-tests */
import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalInvitationManagementDatabase } from "@/tests/support/personal-invitation-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission security and privacy", () => {
  it("should reject crossed request resources and arbitrary send fields before effects through the actual routes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePersonalInvitationManagementDatabase(database);
      for (const migration of ["20261007004000_read_exact_own_admission_request.sql", "20261007005000_read_admission_reviews.sql"]) await database.applyMigration(migration);
      const ownSlug = `allowlist-${fixture.tribeId}`, otherTribeId = randomUUID(), otherSlug = `security-${otherTribeId}`;
      const applicantId = randomUUID(), otherRequestId = randomUUID(), ownRequestId = randomUUID();
      const privateMarker = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic private applicant',${`${applicantId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic crossed academy',${otherSlug},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${otherTribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${otherTribeId},${fixture.userId},'leader','active')`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${otherTribeId})`);
        for (const scope of [{ tribeId: fixture.tribeId, requestId: ownRequestId }, { tribeId: otherTribeId, requestId: otherRequestId }]) {
          await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,applicant_message,submitted_at,expires_at) values (${scope.requestId},${scope.tribeId},${applicantId},'common','email',${`${applicantId}@example.test`},'declared',${privateMarker},clock_timestamp(),clock_timestamp()+interval '30 days')`);
        }
      });
      /** @returns Safe persisted effect counts, excluding all private row data. */
      const counts = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id in (${fixture.tribeId},${otherTribeId})) as operations,(select count(*)::int from public.contact_verification_challenges where tribe_id in (${fixture.tribeId},${otherTribeId})) as challenges,(select count(*)::int from public.message_deliveries where tribe_id in (${fixture.tribeId},${otherTribeId})) as deliveries,(select count(*)::int from public.message_delivery_attempts where tribe_id in (${fixture.tribeId},${otherTribeId})) as attempts,(select count(*)::int from public.academy_admission_decisions where tribe_id in (${fixture.tribeId},${otherTribeId})) as decisions`)).rows[0]);
      const before = await counts();
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, ownSlug, async (origin, signingSecret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, signingSecret)}`)}`;
        const headers = { cookie, origin, "content-type": "application/json" };
        /** @param path - Exact owned route. @param method - Observable native HTTP operation. @param body - Caller-controlled input. @returns Actual Next response; request secrets remain ephemeral. */
        const request = (path: string, method = "GET", body?: unknown) => fetch(`${origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        for (const scope of [{ slug: ownSlug, requestId: ownRequestId, foreignId: otherRequestId }, { slug: otherSlug, requestId: otherRequestId, foreignId: ownRequestId }]) {
          const base = `/api/tribes/${scope.slug}/admissions`;
          const ownResponse = await request(`${base}/requests/${scope.requestId}`);
          expect(ownResponse.status).toBe(200);
          const ownResult = await ownResponse.json();
          expect(ownResult).toMatchObject({ id: scope.requestId });
          const crossed = await request(`${base}/requests/${scope.foreignId}`);
          expect(crossed.status).toBe(404);
          expect((await crossed.text()).includes(privateMarker)).toBe(false);
          const malformed = await request(`${base}/requests/not-a-uuid`);
          expect(malformed.status).toBe(400);
          const decision = await request(`${base}/requests/${scope.foreignId}/decision`, "POST", { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión sintética" });
          expect(decision.status).toBe(404);
          expect((await decision.text()).includes(privateMarker)).toBe(false);
        }
        const base = `/api/tribes/${ownSlug}/admissions`;
        for (const field of ["sender", "senderId", "text", "template", "templateId", "templateVariables", "destination", "recipient", "verified", "apiKey", "host", "baseUrl"]) {
          const response = await request(`${base}/challenges`, "POST", { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, channel: "email", [field]: privateMarker });
          expect(response.status).toBe(400);
          expect((await response.text()).includes(privateMarker)).toBe(false);
        }
        const originDenied = await fetch(`${origin}${base}/challenges`, { method: "POST", headers: { ...headers, origin: "https://unrelated.example.test" }, body: JSON.stringify({ operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, channel: "email" }) });
        expect(originDenied.status).toBe(403);
        expect(await counts()).toEqual(before);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
        const previousLeader = await request(`${base}/requests/${ownRequestId}`);
        expect(previousLeader.status).toBeGreaterThanOrEqual(400);
        expect(previousLeader.status).toBeLessThan(500);
        expect((await previousLeader.text()).includes(privateMarker)).toBe(false);
        const previousLeaderDecision = await request(`${base}/requests/${ownRequestId}/decision`, "POST", { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión sintética" });
        expect(previousLeaderDecision.status).toBeGreaterThanOrEqual(400);
        expect(previousLeaderDecision.status).toBeLessThan(500);
        expect(await counts()).toEqual(before);
      }));
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
