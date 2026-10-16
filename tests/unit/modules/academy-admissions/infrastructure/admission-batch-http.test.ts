/** @vitest-environment node */
/** Exercises the real Next POST/GET composition, native accounts and original PostgreSQL batch effects without a provider transport. @module admission-batch-http-tests */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_BATCH_HTTP_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-batch-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_BATCH_DECISION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-batch-decision";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native batch POST and original GET", () => {
  it("should resolve only explicit rows, recover without another decision and recheck native roles and sessions through the actual server", async () => {
    let stage = VALIDATION.stages.prepare as string;
    const artifacts = process.env[VALIDATION.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-batch-http");
    await mkdir(artifacts, { recursive: true });
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        stage = VALIDATION.stages.bootstrap;
        const securityConfig = await readMessagingHostingSecurityConfig();
        const keyringsJson = process.env.MESSAGING_KEYRINGS_JSON;
        if (!keyringsJson) throw new Error("Native batch HTTP validation requires its own synthetic hosting keyrings");
        const guardianId = randomUUID(), guardianSession = randomUUID(), guardianToken = randomUUID(), foreignTribeId = randomUUID();
        const foreignSlug = `batch-foreign-${foreignTribeId}`;
        const fixture = await prepareAdmissionBatch(database, async (scope) => {
          await database.withContext({ userId: guardianId, email: `${guardianId}@example.test` }, async (transaction) => {
            const accountId = randomUUID(), subject = randomUUID();
            await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianId},'Guardián de prueba',${`${guardianId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
            await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${guardianId},'google',${subject},clock_timestamp(),clock_timestamp())`);
            await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSession},${guardianId},${guardianToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
            await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${guardianSession},${guardianId},${accountId},${subject},${`${guardianId}@example.test`})`);
          });
          await database.withContext({ userId: scope.leaderUserId, email: null }, async (transaction) => {
            await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${scope.tribeId},${guardianId},'guardian','active')`);
            await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${foreignTribeId},'Otra tribu de prueba',${foreignSlug},${scope.leaderUserId})`);
            await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${foreignTribeId},'academy',true)`);
            await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${foreignTribeId},${scope.leaderUserId},'leader','active')`);
            await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${foreignTribeId})`);
          });
        }, { securityConfig });
        const selected = await fixture.seedPendingSelection(VALIDATION.maximumSelection + 3);
        const slug = `allowlist-${fixture.tribeId}`, privateReason = "Motivo interno del ensayo HTTP, nunca público";
        stage = VALIDATION.stages.server;
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          /** @param token - Generated native fixture token retained only in memory. @returns Same-origin request headers; never persisted as evidence. */
          const headers = async (token: string) => ({ "content-type": "application/json", origin, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)}` });
          const guardianHeaders = await headers(guardianToken), leaderHeaders = await headers(fixture.sessionToken);
          const prefix = `/api/tribes/${slug}/admissions`, operationId = randomUUID();
          const input = { operationId, confirmed: true, decision: "reject", internalReason: privateReason, externalMessage: "Respuesta externa de prueba", items: [{ requestId: selected[0].admissionRequestId, expectedVersion: 1 }, { requestId: selected[1].admissionRequestId, expectedVersion: 2 }] };
          /** @param path - Local own endpoint. @param requestHeaders - One native account binding. @param body - Optional explicit POST body. @returns The real HTTP response, bounded independently of the test. */
          const request = (path: string, requestHeaders: Readonly<Record<string, string>>, body?: unknown) => fetch(new URL(path, origin), { method: body === undefined ? "GET" : "POST", headers: requestHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(VALIDATION.requestTimeoutMs) });

          stage = VALIDATION.stages.mixed;
          const first = await request(`${prefix}/request-decisions`, guardianHeaders, input);
          expect(first.status).toBe(200);
          const mixed = await first.json();
          expect(first.headers.get("cache-control")).toBe("no-store");
          expect(mixed).toMatchObject({ operationId, state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [{ requestId: selected[0].admissionRequestId, status: "rejected", version: 2 }, { requestId: selected[1].admissionRequestId, status: "conflict", code: "request_conflict" }] });
          expect(JSON.stringify(mixed)).not.toContain(privateReason);
          const replay = await request(`${prefix}/request-decisions`, guardianHeaders, input);
          expect(replay.status).toBe(200);
          expect(await replay.json()).toEqual(mixed);

          stage = VALIDATION.stages.recovery;
          const originalBeforeRead = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner,lease_until,public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows);
          const original = await request(`${prefix}/operations/${operationId}`, guardianHeaders);
          expect(original.status).toBe(200);
          expect(original.headers.get("cache-control")).toBe("no-store");
          const recovered = await original.json();
          expect(recovered).toMatchObject({ type: ADMISSION_BATCH_DECISION_OPERATION, state: "completed", operationId, replayed: true });
          expect(recovered.result.results).toHaveLength(2);
          expect(recovered.result.results).toEqual(expect.arrayContaining([{ admissionRequestId: selected[0].admissionRequestId, status: "rejected", version: 2 }, { admissionRequestId: selected[1].admissionRequestId, status: "conflict", code: "request_conflict" }]));
          expect(JSON.stringify(recovered)).not.toContain(privateReason);
          expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner,lease_until,public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows)).toEqual(originalBeforeRead);
          expect((await request(`/api/tribes/${foreignSlug}/admissions/operations/${operationId}`, leaderHeaders)).status).toBe(404);

          stage = VALIDATION.stages.maximum;
          const maximum = { ...input, operationId: randomUUID(), externalMessage: undefined, items: selected.slice(2, 2 + VALIDATION.maximumSelection).map((item) => ({ requestId: item.admissionRequestId, expectedVersion: 1 })) };
          const fifty = await request(`${prefix}/request-decisions`, leaderHeaders, maximum);
          expect(fifty.status).toBe(200);
          const complete = await fifty.json();
          expect(complete).toMatchObject({ state: "completed", result: "all_succeeded", completedCount: VALIDATION.maximumSelection, failedCount: 0, unresolvedCount: 0 });
          expect(complete.items).toHaveLength(VALIDATION.maximumSelection);

          stage = VALIDATION.stages.overflow;
          const overflow = { ...maximum, operationId: randomUUID(), items: [...maximum.items, { requestId: selected.at(-1)!.admissionRequestId, expectedVersion: 1 }] };
          expect((await request(`${prefix}/request-decisions`, leaderHeaders, overflow)).status).toBe(400);
          expect((await request(`${prefix}/request-decisions`, leaderHeaders, { ...input, operationId: randomUUID(), confirmed: false })).status).toBe(400);
          expect((await request(`${prefix}/request-decisions`, leaderHeaders, { ...input, userId: fixture.userId })).status).toBe(400);

          stage = VALIDATION.stages.role;
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.tribeId} and user_id=${guardianId}`));
          expect((await request(`${prefix}/operations/${operationId}`, guardianHeaders)).status).toBe(403);
          expect((await request(`${prefix}/request-decisions`, guardianHeaders, input)).status).toBe(403);
          stage = VALIDATION.stages.session;
          await database.withContext(fixture.own, async (transaction) => {
            await transaction.execute(sql`update public.tribe_members set status='active' where tribe_id=${fixture.tribeId} and user_id=${guardianId}`);
            await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${guardianSession}`);
          });
          expect((await request(`${prefix}/operations/${operationId}`, guardianHeaders)).status).toBe(401);
          expect((await request(`${prefix}/request-decisions`, guardianHeaders, input)).status).toBe(401);
        }, { messagingSecurity: { environment: securityConfig.environment, securityEpoch: securityConfig.securityEpoch, keyringsJson } }));

        stage = VALIDATION.stages.effects;
        const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ batch_operations: number; decisions: number; memberships: number; pending: number; deliveries: number }>(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId} and operation_type=${ADMISSION_BATCH_DECISION_OPERATION}) as batch_operations,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and status='pending' and version=1) as pending,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
        expect(effects).toEqual({ batch_operations: 2, decisions: VALIDATION.maximumSelection + 1, memberships: 0, pending: 2, deliveries: 0 });
        stage = VALIDATION.stages.complete;
        await writeFile(join(artifacts, VALIDATION.proofFile), JSON.stringify({ at: new Date().toISOString(), stage, transport: "native_fetch_actual_next", effects, externalMessagesSent: 0, explicitMaximum: VALIDATION.maximumSelection, nativeLeaderAndGuardian: true, reauthorizationVerified: true }, null, 2) + "\n");
      });
    } catch (error) {
      await writeFile(join(artifacts, VALIDATION.failureFile), JSON.stringify({ at: new Date().toISOString(), stage, name: error instanceof Error ? error.name : typeof error }, null, 2) + "\n");
      throw error;
    }
  }, VALIDATION.testTimeoutMs);
});
