/** @vitest-environment node */
/** Exercises actual pages, SDK, crypto, PostgreSQL and UI in both engines on a disposable owned branch. @module admission-manual-browser-flow-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, type Page } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";

/** Reserves only this fixture's loopback port and closes its temporary listener. */
async function reservePort(): Promise<number> {
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const address = socket.address(); if (!address || typeof address === "string") throw new Error("Admission UI fixture could not reserve a port");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("manual admission native browser", () => {
  for (const [selectedEngine, selectedBrowser] of [["chromium", chromium], ["webkit", webkit]] as const) {
  it(`should submit, recover a lost response, show own state and cancel without membership in ${selectedEngine} mobile and desktop`, async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_branch", engine: selectedEngine, branch: database.branch }) + "\n");
      for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007003000_read_admission_notification_subject.sql", "20261007004000_read_exact_own_admission_request.sql"]) await database.applyMigration(migration);
      const leaderId = randomUUID(), tribeId = randomUUID(), slug = `manual-ui-${tribeId}`;
      const participants = Array.from({ length: 2 }, () => ({ userId: randomUUID(), sessionId: randomUUID(), token: randomUUID() }));
      await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        for (const userId of [leaderId, ...participants.map((participant) => participant.userId)]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Participante sintético',${`${userId}@example.test`},false,${now},${now})`);
        for (const participant of participants) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${participant.sessionId},${participant.userId},${participant.token},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia sintética',${slug},${leaderId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
      });
      const captures = join(process.cwd(), "user-guides", "assets", "academy-admissions"); await mkdir(captures, { recursive: true });
      const captureSource = process.env.ADMISSION_CAPTURE_SNIPPET ? await readFile(process.env.ADMISSION_CAPTURE_SNIPPET, "utf8") : null;
      await database.withServerEnvironment(async (environment) => {
        const port = await reservePort(), origin = `http://127.0.0.1:${port}`, secret = `${randomUUID()}${randomUUID()}`;
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const server = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, ...environment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false", MESSAGING_SECURITY_ENVIRONMENT: "synthetic-ui", MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) } });
        const exited = once(server, "exit");
        try {
          let ready = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            if (server.exitCode !== null) throw new Error("Admission UI Next server exited before readiness");
            try { ready = (await fetch(`${origin}/api/tribes/${slug}/admissions/overview?role=leader`, { signal: AbortSignal.timeout(2_000) })).status === 400; } catch { ready = false; }
            if (ready) break; await delay(250);
          }
          if (!ready) throw new Error("Admission UI Next server did not become ready");
          let participantIndex = 0;
          for (const [engine, browserType] of [[selectedEngine, selectedBrowser]] as const) {
            const browser = await browserType.launch({ headless: true });
            try {
              for (const width of [390, 1280]) {
                const participant = participants[participantIndex++], context = await browser.newContext({ viewport: { width, height: 900 } });
                try {
                  const page = await context.newPage(), errors: string[] = [];
                  /** Captures actual current UI for the manual, with no synthetic product implementation. */
                  const captureFragment = async (currentPage: Page, name: string) => {
                    if (!captureSource) return;
                    await currentPage.evaluate(captureSource);
                    const capture = await currentPage.evaluate((captureName) => {
                      const helpers = window as unknown as { __umCap: (name: string, element: Element) => { blockedSheets: string[] }; __umCheck: (forbidden: string[]) => unknown[] };
                      const currentMain = Array.from(document.querySelectorAll("main")).find((element) => element.getClientRects().length > 0);
                      if (!currentMain) throw new Error("Visible admission capture root was unavailable");
                      return helpers.__umCap(captureName, currentMain);
                    }, name);
                    expect(capture.blockedSheets).toEqual([]);
                  };
                  page.on("pageerror", (error) => errors.push(error.message));
                  page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) errors.push("hydration_error"); });
                  await page.goto(`${origin}/admissions/${slug}`);
                  await page.getByRole("link", { name: ADMISSION_UI_COPY.signIn }).waitFor();
                  expect(await page.getByRole("link", { name: ADMISSION_UI_COPY.signIn }).getAttribute("href")).toContain(encodeURIComponent(`/admissions/${slug}`));
                  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${participant.token}.${await makeSignature(participant.token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                  await page.goto(`${origin}/admissions/${slug}`);
                  await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).waitFor();
                  await page.getByRole("textbox", { name: ADMISSION_UI_COPY.message }).fill("Quiero participar de la academia.");
                  await page.screenshot({ path: join(captures, `${engine}-${width}-form.png`), fullPage: true });
                  await captureFragment(page, "admission-form");
                  let submissions = 0;
                  await context.route(`**/api/tribes/${slug}/admissions/submissions`, async (route) => {
                    submissions += 1;
                    if (engine === "chromium" && width === 390 && submissions === 1) { await route.fetch(); await route.abort("failed"); }
                    else await route.continue();
                  });
                  await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).check();
                  await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
                  if (engine === "chromium" && width === 390) {
                    await page.getByText(ADMISSION_UI_COPY.uncertain, { exact: true }).waitFor({ timeout: 60_000 });
                    let viewerReadFailed = false;
                    await context.route("**/api/auth/get-session**", async (route) => {
                      if (!viewerReadFailed) { viewerReadFailed = true; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "Synthetic session transport interruption" }) }); }
                      else await route.continue();
                    });
                    await page.reload();
                    await page.getByText(ADMISSION_UI_COPY.readFailed, { exact: true }).waitFor({ timeout: 60_000 });
                    expect(await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }).isDisabled()).toBe(true);
                    await page.getByRole("button", { name: ADMISSION_UI_COPY.read, exact: true }).click();
                  }
                  await page.getByRole("link", { name: "Ver solicitud", exact: true }).waitFor({ timeout: 90_000 });
                  expect(submissions).toBe(1);
                  expect(await page.getByRole("link", { name: ADMISSION_UI_COPY.openAcademy }).count()).toBe(0);
                  const requestHref = await page.getByRole("link", { name: "Ver solicitud", exact: true }).getAttribute("href");
                  expect(requestHref).toContain(`tribe=${slug}`);
                  await page.getByRole("link", { name: "Ver solicitud", exact: true }).click();
                  await page.waitForURL(`${origin}${requestHref}`);
                  await page.getByRole("link", { name: "Ver solicitud", exact: true }).waitFor({ state: "hidden", timeout: 60_000 });
                  await page.getByRole("heading", { name: ADMISSION_UI_COPY.statusTitle }).waitFor({ timeout: 60_000 });
                  const requestRegion = page.getByRole("region", { name: "Estado de tu solicitud", exact: true });
                  await requestRegion.getByRole("status").waitFor();
                  expect(await requestRegion.getByRole("status").textContent()).toBe(ADMISSION_UI_COPY.pending);
                  await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }).waitFor({ state: "visible" });
                  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                  await page.screenshot({ path: join(captures, `${engine}-${width}-pending.png`), fullPage: true });
                  await captureFragment(page, "admission-pending");
                  try { await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }).check(); }
                  catch (error) {
                    await page.screenshot({ path: join(captures, `${engine}-${width}-navigation-failure.png`), fullPage: true });
                    const panels = await page.locator("main").evaluateAll((elements) => elements.map((element) => ({ visible: Boolean(element.getBoundingClientRect().height), text: element.textContent?.slice(0, 900) })));
                    process.stdout.write(JSON.stringify({ navigationPath: new URL(page.url()).pathname, panels }) + "\n");
                    throw error;
                  }
                  await page.getByRole("button", { name: ADMISSION_UI_COPY.cancel, exact: true }).click();
                  await page.getByText(ADMISSION_UI_COPY.cancelled, { exact: true }).first().waitFor({ timeout: 90_000 });
                  await page.reload();
                  await page.getByText(ADMISSION_UI_COPY.cancelled, { exact: true }).first().waitFor({ timeout: 60_000 });
                  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                  await page.screenshot({ path: join(captures, `${engine}-${width}-cancelled.png`), fullPage: true });
                  await captureFragment(page, "admission-cancelled");
                  if (captureSource) {
                    const payload = await page.evaluate((forbidden) => {
                      const helpers = window as unknown as { __umCheck: (values: string[]) => unknown[] };
                      if (helpers.__umCheck(forbidden).length) throw new Error("Admission capture contained a private fixture identity");
                      return { meta: { capturedAt: new Date().toISOString().slice(0, 10) }, rules: JSON.parse(sessionStorage.getItem("__umRules")!), caps: JSON.parse(sessionStorage.getItem("__umCaps")!) };
                    }, [participant.userId, participant.sessionId, participant.token, secret, `${participant.userId}@example.test`]);
                    for (let ruleIndex = 0; ruleIndex < payload.rules.length; ruleIndex += 1) {
                      const rule: string = payload.rules[ruleIndex];
                      if (!rule.startsWith("@font-face")) continue;
                      for (const font of rule.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                        if (font[1].startsWith("data:")) continue;
                        const url = new URL(font[1], origin);
                        if (url.origin !== origin) throw new Error("Admission capture tried to embed an unrelated font origin");
                        const response = await context.request.get(url.href);
                        expect(response.ok()).toBe(true);
                        payload.rules[ruleIndex] = payload.rules[ruleIndex].replace(font[1], `data:font/woff2;base64,${(await response.body()).toString("base64")}`);
                      }
                    }
                    await writeFile(join(captures, `${engine}-${width}-captures.json`), JSON.stringify(payload), "utf8");
                  }
                  expect(errors).toEqual([]);
                } finally { await context.close(); process.stdout.write(JSON.stringify({ phase: "context_closed", engine, width }) + "\n"); }
              }
            } finally { await browser.close(); process.stdout.write(JSON.stringify({ phase: "browser_closed", engine }) + "\n"); }
          }
        } finally { if (server.exitCode === null) server.kill(); await exited; process.stdout.write(JSON.stringify({ phase: "server_closed", engine: selectedEngine }) + "\n"); }
      });
      expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select count(*)::int as requests,count(*) filter(where status='cancelled')::int as cancelled from public.academy_admission_requests where tribe_id=${tribeId}`)).rows)).toEqual([{ requests: 2, cancelled: 2 }]);
      expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${tribeId} and user_id<>${leaderId}) as members,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${tribeId}) as bindings,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows)).toEqual([{ members: 0, bindings: 0, deliveries: 0 }]);
      process.stdout.write(JSON.stringify({ phase: "business_checks_complete", engine: selectedEngine, branch: database.branch.id }) + "\n");
    });
    process.stdout.write(JSON.stringify({ phase: "cleanup_verified", engine: selectedEngine }) + "\n");
  }, 600_000);
  }
});
