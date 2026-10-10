/** @vitest-environment node */
/** Exercises the actual Next mutation routes with native signed cookies, crypto and PostgreSQL. @module admission-mutation-http-flow-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Reserves only this fixture's loopback port. */
async function freePort(): Promise<number> {
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Admission mutation fixture did not reserve a port");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("admission native mutation HTTP", () => {
  it("should confirm and replay one request, approve only basic membership and cancel own during pause through actual Next routes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      await database.applyMigration("20261007005000_read_admission_reviews.sql");
      const leaderId = randomUUID(), applicantId = randomUUID(), otherId = randomUUID(), tribeId = randomUUID(), slug = `mutation-${tribeId}`;
      const identities = [leaderId, applicantId, otherId].map((userId) => ({ userId, sessionId: randomUUID(), token: randomUUID() }));
      await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        for (const identity of identities) {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${identity.userId},'Synthetic HTTP participant',${`${identity.userId}@example.test`},false,${now},${now})`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${identity.sessionId},${identity.userId},${identity.token},clock_timestamp()+interval '1 hour',${now},${now})`);
        }
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia HTTP sintética',${slug},${leaderId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
      });
      await database.withServerEnvironment(async (databaseEnvironment) => {
        const port = await freePort(), origin = `http://127.0.0.1:${port}`, secret = `${randomUUID()}${randomUUID()}`;
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const server = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, ...databaseEnvironment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false", MESSAGING_SECURITY_ENVIRONMENT: "synthetic-http", MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) } });
        const exited = once(server, "exit");
        try {
          const base = `${origin}/api/tribes/${slug}/admissions`;
          let ready = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            if (server.exitCode !== null) throw new Error("Admission mutation Next server exited before readiness");
            try { ready = (await fetch(`${base}/overview?role=leader`, { signal: AbortSignal.timeout(2_000) })).status === 400; } catch { ready = false; }
            if (ready) break; await delay(250);
          }
          if (!ready) throw new Error("Admission mutation Next server did not become ready");
          const cookies = await Promise.all(identities.map(async (identity) => `better-auth.session_token=${encodeURIComponent(`${identity.token}.${await makeSignature(identity.token, secret)}`)}`));
          const policyResponse = await fetch(`${base}/policy`, { headers: { cookie: cookies[0] } });
          expect(policyResponse.status).toBe(200);
          expect(await policyResponse.json()).toMatchObject({ state: "active", controlActivated: true, policy: { version: 1, contactType: "email", isOpen: true }, preparation: { state: "not_evaluated" }, impact: { pendingRequestCount: 0, historicalLinksProtected: true, contactTypeLocked: true } });
          expect((await fetch(`${base}/policy`, { headers: { cookie: cookies[1] } })).status).toBe(403);
          expect((await fetch(`${base}/policy`, { headers: { cookie: cookies[2] } })).status).toBe(403);
          expect(policyResponse.headers.get("cache-control")).toContain("no-store");
          const post = (path: string, body: object, cookie: string) => fetch(`${base}${path}`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
          const intent = { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 };
          const foreignOrigin = await fetch(`${base}/submissions`, { method: "POST", headers: { cookie: cookies[1], origin: "https://foreign.example.invalid", "content-type": "application/json" }, body: JSON.stringify(intent) });
          expect(foreignOrigin.status).toBe(403);
          expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select count(*)::int as operations from public.academy_admission_operations where tribe_id=${tribeId}`)).rows)).toEqual([{ operations: 0 }]);
          const createdResponse = await post("/submissions", intent, cookies[1]);
          expect(createdResponse.status).toBe(201);
          const created = await createdResponse.json();
          expect(created).toMatchObject({ outcome: "pending", operationId: intent.operationId, request: { status: "pending", version: 1 } });
          expect(JSON.stringify(created)).not.toContain(`${applicantId}@example.test`);
          const pendingRecovery = await fetch(`${base}/operations/${intent.operationId}`, { headers: { cookie: cookies[1] } });
          expect(pendingRecovery.status).toBe(200);
          expect(pendingRecovery.headers.get("cache-control")).toContain("no-store");
          expect(await pendingRecovery.json()).toMatchObject({ type: "submit_admission", state: "completed", result: { requestSnapshot: { status: "pending", version: 1 } } });
          expect((await post("/submissions", intent, cookies[1])).status).toBe(200);
          const requestId = created.request.id as string;
          const pendingImpact = await fetch(`${base}/policy`, { headers: { cookie: cookies[0] } });
          expect(pendingImpact.status).toBe(200);
          expect(await pendingImpact.json()).toMatchObject({ impact: { pendingRequestCount: 1 } });
          const approved = await post(`/requests/${requestId}/decision`, { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión HTTP sintética" }, cookies[0]);
          expect(approved.status).toBe(200);
          expect(await approved.json()).toMatchObject({ admissionRequestId: requestId, status: "approved", version: 2 });
          const resolvedImpact = await fetch(`${base}/policy`, { headers: { cookie: cookies[0] } });
          expect(resolvedImpact.status).toBe(200);
          expect(await resolvedImpact.json()).toMatchObject({ impact: { pendingRequestCount: 0 } });
          const historical = await post("/submissions", intent, cookies[1]);
          expect(historical.status).toBe(200);
          expect(await historical.json()).toMatchObject({ outcome: "pending", request: { id: requestId, version: 1, status: "pending" } });
          const recovered = await fetch(`${base}/operations/${intent.operationId}`, { headers: { cookie: cookies[1] } });
          expect(recovered.status).toBe(200);
          expect(await recovered.json()).toMatchObject({ type: "submit_admission", state: "completed", replayed: true, result: { requestSnapshot: { status: "pending", version: 1 } } });
          expect((await fetch(`${base}/operations/${intent.operationId}`, { headers: { cookie: cookies[2] } })).status).toBe(404);
          const current = await fetch(`${base}/own-request`, { headers: { cookie: cookies[1] } });
          expect(await current.json()).toMatchObject({ status: "approved", version: 2 });
          const other = await post("/submissions", { ...intent, operationId: randomUUID() }, cookies[2]);
          const otherRequest = await other.json();
          expect(otherRequest).toMatchObject({ outcome: "pending" });
          await database.withContext({ userId: leaderId, email: null }, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${tribeId}`));
          const cancelOperationId = randomUUID();
          const cancelled = await post(`/requests/${otherRequest.request.id}/cancel`, { operationId: cancelOperationId, confirmed: true, expectedVersion: 1 }, cookies[2]);
          expect(cancelled.status).toBe(200);
          expect(await cancelled.json()).toMatchObject({ status: "cancelled", version: 2 });
          const cancelledRecovery = await fetch(`${base}/operations/${cancelOperationId}`, { headers: { cookie: cookies[2] } });
          expect(cancelledRecovery.status).toBe(200);
          expect(await cancelledRecovery.json()).toMatchObject({ type: "cancel_admission_request", state: "completed", result: { status: "cancelled", version: 2 } });
          const missingRecency = await post(`/requests/${otherRequest.request.id}/retry-eligibility`, { operationId: randomUUID(), confirmed: true, expectedVersion: 2, internalReason: "Corrección HTTP" }, cookies[0]);
          expect(missingRecency.status).toBe(401);
          const accountId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
          await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
            const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + 540_000);
            await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${leaderId},'google',${subject},${now},${now})`);
            await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${identities[0].sessionId},${leaderId},${accountId},${subject},${`${leaderId}@example.test`})`);
            await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${leaderId},${identities[0].sessionId},${accountId},${subject},${tribeId},'advance_admission_retry',${otherRequest.request.id},'/synthetic-retry',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
            await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${leaderId},${accountId},${subject},${identities[0].sessionId},${tribeId},'advance_admission_retry',${otherRequest.request.id},${now},${now},${validUntil})`);
          });
          const retryIntent = { operationId: randomUUID(), confirmed: true, expectedVersion: 2, internalReason: "Corrección HTTP" };
          const retry = await post(`/requests/${otherRequest.request.id}/retry-eligibility`, retryIntent, cookies[0]);
          expect(retry.status).toBe(200);
          expect(await retry.json()).toMatchObject({ admissionRequestId: otherRequest.request.id, version: 3, retryAllowedAt: expect.any(String) });
          expect((await post(`/requests/${otherRequest.request.id}/retry-eligibility`, retryIntent, cookies[0])).status).toBe(200);
          const retryRecovery = await fetch(`${base}/operations/${retryIntent.operationId}`, { headers: { cookie: cookies[0] } });
          expect(retryRecovery.status).toBe(200);
          expect(await retryRecovery.json()).toMatchObject({ type: "allow_admission_retry", state: "completed", result: { version: 3 } });
        } finally { if (server.exitCode === null) server.kill(); await exited; }
      });
      expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${tribeId} and user_id=${applicantId}`)).rows)).toEqual([{ role: "tribemate", status: "active" }]);
      expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.tribe_member_subscriptions where tribe_id=${tribeId} and user_id in (${applicantId},${otherId})) as subscriptions`)).rows)).toEqual([{ deliveries: 0, subscriptions: 0 }]);
    });
  }, 600_000);
});
