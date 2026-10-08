/** @vitest-environment node */
/** Exercises actual Next applicant routes with native signed cookies, PostgreSQL, Web Crypto and SDK behind owned closed HTTP. @module admission-contact-verification-http-flow-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/** Bounds only controlled native HTTP waits; production worker/SDK deadlines remain unchanged. */
const NATIVE_ADMISSION_HTTP_TIMEOUT_MS = 180_000;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native applicant contact verification HTTP", () => {
  it("should issue and explicitly resend after the actual cooldown, recover original failures and apply a proof locally without another send or membership", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-admission-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      let providerRequests = 0, receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const signedCookie = encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), headers = { cookie: `better-auth.session_token=${signedCookie}`, origin, "content-type": "application/json" }, base = `${origin}/api/tribes/${slug}/admissions`;
        /** @param path - Own admission subpath. @param body - Original explicit proposal. @returns Native HTTP response without credentials in output. */
        const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(NATIVE_ADMISSION_HTTP_TIMEOUT_MS) });
        const anonymous = await fetch(`${base}/challenges`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, channel: "email" }), signal: AbortSignal.timeout(NATIVE_ADMISSION_HTTP_TIMEOUT_MS) });
        expect(anonymous.status).toBe(401);
        const off = await post("/challenges", { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, channel: "email" });
        expect(off.status).toBe(400);
        expect(await off.json()).toMatchObject({ code: "invalid_input" });
        expect(await fixture.counts()).toMatchObject({ challenges: 0, deliveries: 0, operations: 0, events: 0 });
        expect(providerRequests).toBe(0);
        await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
        const input = { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 2, channel: "email" };
        const issued = await post("/challenges", input), issuedBody = await issued.json();
        expect(issued.status).toBe(201);
        expect(issuedBody).toMatchObject({ state: "completed", operationId: input.operationId, result: { purpose: "admission", channel: "email", deliveryState: "queued" } });
        expect(issuedBody.result.maskedDestination === fixture.own.email).toBe(false);
        expect(receivedCode.length).toBe(6);
        expect(providerRequests).toBe(1);
        const replay = await post("/challenges", input);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual({ ...issuedBody, replayed: true });
        expect(providerRequests).toBe(1);
        const original = await fetch(`${base}/operations/${input.operationId}`, { headers, signal: AbortSignal.timeout(NATIVE_ADMISSION_HTTP_TIMEOUT_MS) });
        expect(original.status).toBe(200);
        expect(await original.json()).toMatchObject({ type: "issue_contact_challenge", state: "completed", result: issuedBody.result });
        const previousChallengeId = String(issuedBody.result.challengeId);
        const clock = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ now: Date | string; created_at: Date | string }>(sql`select clock_timestamp() as now,created_at from public.contact_verification_challenges where id=${previousChallengeId}`)).rows[0]);
        const remainingWaitMs = Math.max(0, new Date(clock.created_at).getTime() + ADMISSION_LIMIT.verificationResendWaitMs - new Date(clock.now).getTime());
        if (remainingWaitMs > 0) await delay(remainingWaitMs);
        const resendInput = { operationId: randomUUID(), confirmed: true };
        const replacement = await post(`/challenges/${previousChallengeId.toUpperCase()}/resend`, resendInput), replacementBody = await replacement.json();
        expect(replacement.status).toBe(201);
        expect(replacementBody).toMatchObject({ state: "completed", result: { purpose: "admission", channel: "email" } });
        const challengeId = String(replacementBody.result.challengeId);
        expect(challengeId).not.toBe(previousChallengeId);
        expect(providerRequests).toBe(2);
        expect((await post(`/challenges/${previousChallengeId}/resend`, resendInput)).status).toBe(200);
        expect(providerRequests).toBe(2);
        expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,is_current,code_mac is null as mac_removed,code_envelope_id from public.contact_verification_challenges where id=${previousChallengeId}`)).rows[0])).toEqual({ state: "invalidated", is_current: false, mac_removed: true, code_envelope_id: null });
        const wrongId = randomUUID(), wrongCode = receivedCode === "000000" ? "111111" : "000000";
        const wrong = await post(`/challenges/${challengeId}/verify`, { operationId: wrongId, confirmed: true, verificationCode: wrongCode });
        expect(wrong.status).toBe(422);
        expect(await wrong.json()).toMatchObject({ code: "verification_code_incorrect", operation: { operationId: wrongId, state: "completed" } });
        const wrongReplay = await post(`/challenges/${challengeId}/verify`, { operationId: wrongId, confirmed: true, verificationCode: wrongCode });
        expect(wrongReplay.status).toBe(422);
        const wrongOriginal = await fetch(`${base}/operations/${wrongId}`, { headers, signal: AbortSignal.timeout(NATIVE_ADMISSION_HTTP_TIMEOUT_MS) });
        expect(wrongOriginal.status).toBe(200);
        expect(await wrongOriginal.json()).toMatchObject({ type: "verify_contact_challenge", state: "completed", result: { purpose: "admission", result: "denied", code: "verification_code_incorrect" } });
        await database.withContext(fixture.fixture.own, async (transaction) => {
          await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.context.tribeId}`);
          await transaction.execute(sql`update public.tenant_messaging_connections set state='suspended',state_reason='security_pause',version=version+1 where id=${fixture.fixture.scope.connectionId}`);
        });
        const verified = await post(`/challenges/${challengeId.toUpperCase()}/verify`, { operationId: randomUUID(), confirmed: true, verificationCode: receivedCode }), verifiedBody = await verified.json();
        expect(verified.status).toBe(200);
        expect(verifiedBody).toMatchObject({ state: "completed", result: { purpose: "admission", result: "verified", proofId: expect.any(String) } });
        expect(providerRequests).toBe(2);
        const pendingId = randomUUID();
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${pendingId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`));
        const originalDates = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows[0]);
        const applyInput = { operationId: randomUUID().toUpperCase(), confirmed: true, expectedVersion: 1, proofId: String(verifiedBody.result.proofId).toUpperCase() };
        const applied = await post(`/requests/${pendingId.toUpperCase()}/proof`, applyInput);
        expect(applied.status).toBe(200);
        expect(await applied.json()).toMatchObject({ state: "completed", result: { outcome: "applied", requestId: pendingId, requestVersion: 2, status: "pending", proofId: verifiedBody.result.proofId } });
        expect((await post(`/requests/${pendingId}/proof`, { ...applyInput, operationId: applyInput.operationId.toLowerCase(), proofId: applyInput.proofId.toLowerCase() })).status).toBe(200);
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows[0]).toEqual(originalDates);
          expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${pendingId} and event_type='proof_attached'`)).rows).toEqual([{ count: 1 }]);
        });
        expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, events: 3, proofs: 1, memberships: 0 });
        expect(providerRequests).toBe(2);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
        const expired = await fetch(`${base}/operations/${input.operationId}`, { headers, signal: AbortSignal.timeout(NATIVE_ADMISSION_HTTP_TIMEOUT_MS) });
        expect(expired.status).toBe(401);
      }, { preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], messagingSecurity, environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests += 1; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 900_000);
});
