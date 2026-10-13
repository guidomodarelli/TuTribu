/** @vitest-environment node */
/** Exercises the production Next route with real sessions, SQL and Chromium/WebKit on an owned database branch. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { chromium, webkit, devices } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { PostgresRecentAuthenticationRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-recent-authentication-repository";
import { PostgresReauthenticationResourceAuthorizer } from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";

/**
 * Reserves a free local port without touching a user's running development server.
 * @returns A loopback port for this bounded Next server fixture.
 * @throws Error if the operating system cannot supply a usable port.
 */
async function availablePort(): Promise<number> {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Reauthentication browser fixture could not reserve a port");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("authenticated global reauthentication browser flow", () => {
  it("should preserve a current leader session until explicit native OAuth confirmation in both engines and viewport sizes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005095000_guard_global_identity_context.sql"]) await database.applyMigration(migration);
      const userId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), tribeId = randomUUID(), slug = `browser-auth-${tribeId}`;
      const own = { userId, email: `${userId}@example.test` };
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic browser leader',${own.email},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic browser academy',${slug},${userId})`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${userId},'leader','active')`);
      });
      const intents = new PostgresRecentAuthenticationRepository((run) => database.withContext(own, run), (transaction) => new PostgresReauthenticationResourceAuthorizer(transaction));
      await database.withServerEnvironment(async (databaseEnvironment) => {
        const port = await availablePort(), origin = `http://127.0.0.1:${port}`, secret = `${randomUUID()}${randomUUID()}`;
        const server = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, ...databaseEnvironment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false" } });
        const serverExited = once(server, "exit");
        try {
          let ready = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            if (server.exitCode !== null) throw new Error("Reauthentication local Next server exited before readiness");
            try { ready = (await fetch(`${origin}/auth/reauthenticate?intentId=invalid`, { signal: AbortSignal.timeout(2_000) })).ok; } catch { ready = false; }
            if (ready) break;
            await delay(250);
          }
          if (!ready) throw new Error("Reauthentication local Next server did not become ready");
          for (const browserType of [chromium, webkit]) {
            const browser = await browserType.launch({ headless: true });
            try {
              for (const mobile of [false, true]) {
                const created = await intents.create({ userId, sessionId, accountId, subject, tribeId, operation: "update_admission_policy", resourceId: tribeId, returnPath: `/${slug}` });
                if (created.status !== "created") throw new Error("Synthetic current leader intent could not be created");
                const context = await browser.newContext(mobile ? devices[browserType === webkit ? "iPhone 13" : "Pixel 7"] : { viewport: { width: 1280, height: 800 } });
                try {
                  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${sessionToken}.${await makeSignature(sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                  const page = await context.newPage();
                  let oauthRequested = false, safeOauthParameters = false;
                  let oauthStatus: number | undefined, oauthCode: string | undefined;
                  page.on("response", async (response) => {
                    if (new URL(response.url()).pathname !== "/api/auth/sign-in/social") return;
                    oauthStatus = response.status();
                    if (!response.ok()) {
                      const body = await response.json().catch(() => null);
                      if (body && typeof body.code === "string" && /^[a-z_]{1,64}$/i.test(body.code)) oauthCode = body.code;
                    }
                  });
                  await page.route("https://accounts.google.com/**", async (route) => {
                    oauthRequested = true;
                    const requested = new URL(route.request().url());
                    safeOauthParameters = Boolean(requested.searchParams.get("state") && requested.searchParams.get("nonce") && requested.searchParams.get("code_challenge") && requested.searchParams.get("claims")?.includes("auth_time"));
                    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><html lang='es'><meta charset='utf-8'><title>Proveedor de prueba</title><body><h1>Confirmación externa de prueba</h1></body></html>" });
                  });
                  await page.goto(`${origin}/auth/reauthenticate?intentId=${created.intent.id}`);
                  await page.getByRole("heading", { name: "Confirmá tu autenticación", exact: true }).waitFor({ state: "visible" });
                  expect(oauthRequested).toBe(false);
                  expect(await page.getByRole("button", { name: "Confirmar con Google", exact: true }).count()).toBe(1);
                  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
                  const beforeConfirmation = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select state,nonce_hash is not null as has_nonce from public.global_reauthentication_intents where id=${created.intent.id}`)).rows[0]);
                  expect(beforeConfirmation).toEqual({ state: "created", has_nonce: false });
                  await page.getByRole("button", { name: "Confirmar con Google", exact: true }).click();
                  try { await page.getByRole("heading", { name: "Confirmación externa de prueba", exact: true }).waitFor({ state: "visible" }); }
                  catch {
                    const state = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select state from public.global_reauthentication_intents where id=${created.intent.id}`)).rows[0]?.state);
                    throw new Error(`Native reauthentication browser did not redirect: status=${oauthStatus ?? "absent"} code=${oauthCode ?? "absent"} intentState=${state ?? "absent"} requested=${oauthRequested}`);
                  }
                  expect(oauthRequested).toBe(true);
                  expect(safeOauthParameters).toBe(true);
                  const persisted = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select state,nonce_hash is not null as has_nonce from public.global_reauthentication_intents where id=${created.intent.id}`)).rows[0]);
                  expect(persisted).toEqual({ state: "authorizing", has_nonce: true });
                } finally { await context.close(); }
              }
            } finally { await browser.close(); }
          }
        } finally {
          if (server.exitCode === null) server.kill();
          await serverExited;
        }
      });
    });
  }, 180_000);
});
