/** @vitest-environment node */
/** Exercises the actual Next query routes with native signed sessions, SQL and both browser engines. @module admission-query-browser-flow-tests */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

/** Reserves only this fixture's free loopback port, without altering another server. */
async function reservePort(): Promise<number> {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Admission query fixture could not reserve a local port");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("admission native query routes", () => {
  it("should allow public overview and a current nonmember's own query in Chromium/WebKit without admission or messaging effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const userId = randomUUID(), tribeId = randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), requestId = randomUUID(), slug = `query-${tribeId}`, email = `${userId}@example.test`;
      const own = { userId, email };
      await database.withContext(own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic query applicant',${email},false,${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia de consultas',${slug},${userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
        await transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${requestId},${tribeId},${userId},'common','email',${email},'declared',now,now+interval '30 days' from instant`);
      });
      await database.withServerEnvironment(async (databaseEnvironment) => {
        const port = await reservePort(), origin = `http://127.0.0.1:${port}`, secret = `${randomUUID()}${randomUUID()}`;
        const server = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, ...databaseEnvironment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false", MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: "" } });
        const exited = once(server, "exit");
        try {
          const base = `${origin}/api/tribes/${slug}/admissions`;
          let ready = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            if (server.exitCode !== null) throw new Error("Admission query Next server exited before readiness");
            try { ready = (await fetch(`${base}/overview?role=leader`, { signal: AbortSignal.timeout(2_000) })).status === 400; } catch { ready = false; }
            if (ready) break;
            await delay(250);
          }
          if (!ready) throw new Error("Admission query Next server did not become ready");
          expect((await fetch(`${base}/own-request`)).status).toBe(401);
          for (const browserType of [chromium, webkit]) {
            const browser = await browserType.launch({ headless: true });
            try {
              for (const width of [390, 1280]) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                try {
                  const page = await context.newPage();
                  const anonymous = await page.goto(`${base}/overview`);
                  expect(anonymous?.status()).toBe(200);
                  expect(await anonymous?.json()).toMatchObject({ state: "sign_in_required", nextAction: "sign_in" });
                  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${sessionToken}.${await makeSignature(sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                  const read = await page.evaluate(async (url) => { const response = await fetch(url); return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") }; }, `${base}/own-request`);
                  expect(read).toMatchObject({ status: 200, cache: "no-store", body: { id: requestId, status: "pending", version: 1 } });
                  expect(JSON.stringify(read.body)).not.toContain(email);
                  const overview = await page.evaluate(async (url) => (await fetch(url)).json(), `${base}/overview`);
                  expect(overview).toMatchObject({ state: "pending", nextAction: "view_request", request: { id: requestId } });
                  const invalid = await page.evaluate(async (url) => { const response = await fetch(url); return { status: response.status, body: await response.json() }; }, `${base}/own-request?userId=foreign`);
                  expect(invalid).toMatchObject({ status: 400, body: { code: "invalid_input" } });
                } finally { await context.close(); }
              }
            } finally { await browser.close(); }
          }
        } finally { if (server.exitCode === null) server.kill(); await exited; }
      });
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${tribeId}) as requests,(select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.tribe_members where tribe_id=${tribeId}) as members,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows)).toEqual([{ requests: 1, operations: 0, members: 0, deliveries: 0 }]);
    });
  }, 240_000);
});
