/** @vitest-environment node */
/** Exercises actual reviewer filters, native sessions, bounded scans and navigation in both engines. @module admission-review-filters-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, expect as playwrightExpect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { ADMISSION_ACTIVITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-activity-validation";
import { ADMISSION_REVIEW_BROWSER_VALIDATION as REVIEW_VALIDATION, ADMISSION_REVIEW_SQL_STATE_PATTERN } from "@/tests/support/constants/admission-review-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";

/** Native browser assertions share the bounded browser deadline, independent of the Vitest test deadline. */
const expectBrowser = playwrightExpect.configure({ timeout: VALIDATION.browserTimeoutMs });

/** Each engine and width owns its database and server; only the desktop Chromium scenario records the manual frames. */
const scenarios = [
  { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 390 },
  { name: "webkit", engine: webkit, width: 1280 }, { name: "chromium", engine: chromium, width: 1280 },
];

/** @param error - Private SQL/adapter failure. @returns A bounded SQLSTATE without SQL, parameters, credentials or provider messages. */
function sqlFailureState(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string" && ADMISSION_REVIEW_SQL_STATE_PATTERN.test(current.code)) return current.code;
    current = current.cause;
  }
  return null;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native reviewer filter navigation", () => {
  it.each(scenarios)("should preserve current filters and authority on $name at $width", async (scenario) => {
    /** Vitest timeouts skip the catch below, so each stage is reported on entry to keep a hang diagnosable. */
    const reportStage = (next: string) => { process.stdout.write(`${JSON.stringify({ phase: "native_review_filter_stage", engine: scenario.name, width: scenario.width, stage: next })}
`); return next; };
    let stage = reportStage("prepare_owned_database");
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-review-filters", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        stage = reportStage("migrate_owned_database");
        const fixture = await prepareContactVerificationDatabase(database, config);
        const tribeId = randomUUID(), slug = `review-filters-${tribeId}`, guardianId = randomUUID(), sessionId = randomUUID(), token = randomUUID();
        const reviewerId = scenario.name === "chromium" && scenario.width === 1280 ? fixture.own.userId : guardianId;
        const applicants = ["Primer solicitante de ejemplo", "Segunda solicitante de ejemplo", "Tercer solicitante de ejemplo"].map((name, index) => ({ id: randomUUID(), requestId: randomUUID(), name, email: `solicitante-${index + 1}-${randomUUID().slice(0, 8)}@example.test` }));
        await database.withContext(fixture.own, async (transaction) => {
          stage = reportStage("seed_current_reviewers");
          const activatedAt = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
          for (const user of [{ id: guardianId, name: "Guardián de ejemplo", email: `${guardianId}@example.test` }, ...applicants]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${user.id},${user.name},${user.email},false,clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${reviewerId},${token},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia de ejemplo',${slug},${fixture.own.userId})`);
          await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.own.userId},'leader','active'),(${tribeId},${guardianId},'guardian','active')`);
          stage = reportStage("activate_native_review_scope");
          await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at,mode,allow_common_exceptions) values (${tribeId},true,${activatedAt},'allowlist',true)`);
          await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activatedAt} where id=${tribeId}`);
          stage = reportStage("seed_pending_requests");
          for (const [index, applicant] of applicants.entries()) await transaction.execute(sql`with instant as (select date_trunc('second',clock_timestamp()-${applicants.length - index}*interval '1 minute')+interval '0.123456 seconds' as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) select ${applicant.requestId},${tribeId},${applicant.id},'common','email',${applicant.email},'declared','{"version":1,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,'Quiero participar.',now,now+interval '30 days' from instant`);
        });
        const preciseUntil = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ cutoff: string }>(sql`select to_char((date_trunc('second',submitted_at)+interval '0.123500 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cutoff from public.academy_admission_requests where id=${applicants[0].requestId}`)).rows[0].cutoff);
        const artifacts = process.env[REVIEW_VALIDATION.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-review-filters");
        await mkdir(artifacts, { recursive: true });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const browser = await scenario.engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: scenario.width, height: VALIDATION.height }, reducedMotion: "reduce" });
            try {
              const cookie = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);
              await runPrivateBrowserRequest("bind_review_filter_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
              const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
              const errors: string[] = [], listReads: string[] = [], writes: string[] = [];
              page.on("pageerror", (error) => errors.push(error.name));
              /* The visible inbox refreshes its first page every fifteen seconds; only reads that continue the list (with a cursor) come from these actions, so slow loads cannot count a refresh as one. */
              page.on("request", (request) => { const route = new URL(request.url()); if (route.pathname.endsWith("/admissions/requests") && route.searchParams.has("cursor")) listReads.push(route.search); if (request.method() !== "GET" && route.pathname.includes("/admissions/")) writes.push(request.method()); });
              const forbidden = [secret, token, sessionId, tribeId, guardianId, fixture.own.userId, fixture.own.email, ...applicants.flatMap((applicant) => [applicant.id, applicant.requestId])];
              const recordFrames = scenario.name === "chromium" && scenario.width === 1280;
              stage = reportStage("bounded_empty_initial_page");
              await page.goto(`${origin}/${slug}/academia/admissions?limit=1&requiresExceptionReason=false`, { waitUntil: "domcontentloaded" });
              const apply = page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true });
              await expectBrowser(apply).toBeEnabled();
              await expectBrowser(page.getByText(ADMISSION_REVIEW_FILTER_COPY.emptyPage, { exact: true })).toBeVisible();
              expect(listReads).toEqual([]);
              if (recordFrames) await captureAdmissionReview(page, "review-filter-empty-page", forbidden, REVIEW_VALIDATION.captureFile);
              for (const index of [0, 1]) {
                await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.loadMore, exact: true }).click();
                await expectBrowser(apply).toBeEnabled();
                expect(listReads).toHaveLength(index + 1);
                const query = new URLSearchParams(listReads[index]);
                expect(query.get("requiresExceptionReason")).toBe("false"); expect(query.get("limit")).toBe("1"); expect(query.get("status")).toBe("pending"); expect(query.get("cursor")).toEqual(expect.any(String));
              }
              await expectBrowser(page.getByText(ADMISSION_REVIEW_UI_COPY.empty, { exact: true })).toBeVisible();
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.loadMore, exact: true })).toHaveCount(0);
              stage = reportStage("apply_combined_filters");
              await page.getByRole("combobox", { name: "Motivo de excepción", exact: true }).click(); await page.getByRole("option", { name: "Requiere motivo ahora", exact: true }).click();
              await page.getByRole("combobox", { name: "Origen", exact: true }).click(); await page.getByRole("option", { name: "Solicitud común", exact: true }).click();
              await page.getByRole("combobox", { name: "Comprobación de contacto", exact: true }).click(); await page.getByRole("option", { name: "Sin ese requisito actual", exact: true }).click();
              await page.getByRole("combobox", { name: "Estado", exact: true }).click(); await page.getByRole("option", { name: "Todos los estados", exact: true }).click();
              await page.getByLabel("Búsqueda", { exact: true }).fill("Primer");
              await page.getByLabel("Desde (UTC)", { exact: true }).fill("2020-01-01T00:00");
              await page.getByLabel("Hasta (UTC)", { exact: true }).fill("2099-01-01T00:00");
              listReads.length = 0;
              await apply.click();
              await page.waitForURL((url) => url.searchParams.get("requiresExceptionReason") === "true" && url.searchParams.get("search") === "Primer");
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
              await expectBrowser(page.getByRole("heading", { name: applicants[0].name, exact: true })).toBeVisible();
              expect(listReads).toEqual([]);
              let filteredUrl = page.url();
              if (recordFrames) {
                await expectBrowser(page.getByText(ADMISSION_REVIEW_UI_COPY.reading, { exact: true })).toHaveCount(0);
                await captureAdmissionReview(page, "review-filter-applied", forbidden, REVIEW_VALIDATION.captureFile);
              }
              const form = page.getByRole("form", { name: ADMISSION_REVIEW_FILTER_COPY.title, exact: true });
              await form.screenshot({ path: join(artifacts, `${scenario.name}-${scenario.width}-filters.png`) });
              stage = reportStage("preserve_precise_cutoff");
              const precisionRoute = new URL(filteredUrl); precisionRoute.searchParams.set("submittedUntil", preciseUntil);
              await page.goto(precisionRoute.href, { waitUntil: "domcontentloaded" });
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
              await page.getByLabel("Búsqueda", { exact: true }).fill("Primer solicitante");
              await page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true }).click();
              await page.waitForURL((url) => url.searchParams.get("search") === "Primer solicitante");
              expect(new URL(page.url()).searchParams.get("submittedUntil")).toBe(preciseUntil);
              await expectBrowser(page.getByRole("heading", { name: applicants[0].name, exact: true })).toBeVisible();
              filteredUrl = page.url();
              stage = reportStage("detail_reload_and_history");
              await page.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${applicants[0].name}`, exact: true }).click();
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close, exact: true })).toBeEnabled();
              const approve = page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve, exact: true });
              await expectBrowser(approve).toBeDisabled();
              await page.getByLabel(ADMISSION_REVIEW_UI_COPY.internalReasonRequired, { exact: true }).fill("Revisión de excepción de ejemplo");
              await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true }).click();
              await expectBrowser(approve).toBeEnabled();
              await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true }).click();
              await page.getByLabel(ADMISSION_REVIEW_UI_COPY.internalReasonRequired, { exact: true }).fill("");
              if (recordFrames) await captureAdmissionReview(page, "review-filter-detail", forbidden, REVIEW_VALIDATION.captureFile);
              await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close, exact: true }).click();
              await expectBrowser(page.getByLabel("Búsqueda", { exact: true })).toHaveValue("Primer solicitante");
              expect(page.url()).toBe(filteredUrl);
              listReads.length = 0; await page.reload({ waitUntil: "domcontentloaded" });
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
              expect(listReads).toEqual([]);
              await expectBrowser(page.getByLabel("Búsqueda", { exact: true })).toHaveValue("Primer solicitante");
              await page.getByRole("combobox", { name: "Estado", exact: true }).click(); await page.getByRole("option", { name: "Aprobadas", exact: true }).click();
              await page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true }).click();
              await page.waitForURL((url) => url.searchParams.get("status") === "approved");
              await expectBrowser(page.getByText(ADMISSION_REVIEW_UI_COPY.empty, { exact: true })).toBeVisible();
              await page.goBack({ waitUntil: "domcontentloaded" });
              await expectBrowser(page.getByRole("heading", { name: applicants[0].name, exact: true })).toBeVisible();
              await expectBrowser(page.getByLabel("Búsqueda", { exact: true })).toHaveValue("Primer solicitante");
              stage = reportStage("reset_and_revoke_current_role");
              await page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.reset, exact: true }).click();
              await page.waitForURL((url) => url.searchParams.get("status") === "pending" && !url.searchParams.has("search"));
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
              await expectBrowser(page.getByRole("heading", { name: applicants[1].name, exact: true })).toBeVisible();
              stage = reportStage("reset_unapplied_edits_on_same_selection");
              await page.getByLabel("Búsqueda", { exact: true }).fill("Edición todavía sin aplicar");
              await page.getByLabel("Desde (UTC)", { exact: true }).fill("2020-01-01T00:00");
              await page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.reset, exact: true }).click();
              await expectBrowser(page.getByLabel("Búsqueda", { exact: true })).toHaveValue("");
              await expectBrowser(page.getByLabel("Desde (UTC)", { exact: true })).toHaveValue("");
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
              await expectBrowser(page.getByRole("heading", { name: applicants[1].name, exact: true })).toBeVisible();
              if (recordFrames) await captureAdmissionReview(page, "review-filter-default", forbidden, REVIEW_VALIDATION.captureFile);
              stage = reportStage("mute_current_reviewer");
              /* The inbox refresh holds shared locks on these rows; a bounded wait turns a rare stuck lock into a diagnosable failure instead of a silent test timeout. */
              await database.withContext(fixture.own, async (transaction) => { await transaction.execute(sql`set local lock_timeout='20s'`); await transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${tribeId} and user_id=${reviewerId}`); }).catch(async (lockError) => {
                const holders = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select activity.state, activity.wait_event_type, activity.wait_event, extract(epoch from (clock_timestamp()-activity.xact_start))::int as transaction_seconds, (select string_agg(distinct lock.locktype||':'||lock.mode||':'||lock.granted::text, ',') from pg_locks lock where lock.pid=activity.pid) as locks, cardinality(pg_blocking_pids(activity.pid)) as blockers from pg_stat_activity activity where activity.datname=current_database() and activity.pid<>pg_backend_pid() and activity.state<>'idle' order by activity.xact_start nulls last`)).rows).catch(() => []);
                process.stdout.write(JSON.stringify({ phase: "native_review_filter_lock_wait", engine: scenario.name, width: scenario.width, holders }) + "\n");
                throw lockError;
              });
              await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true }).click();
              await expectBrowser(page.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${applicants[0].name}`, exact: true })).toHaveCount(0);
              /** A lost role hides the whole private inbox, filters included, behind the route error instead of leaving them disabled. */
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toHaveCount(0);
              expect(errors).toEqual([]); expect(writes).toEqual([]);
              const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_requests where tribe_id=${tribeId} and status='pending' and version=1) as unchanged_requests`)).rows[0]);
              expect(effects).toEqual({ operations: 0, deliveries: 0, unchanged_requests: applicants.length });
              await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-proof.json`), JSON.stringify({ at: new Date().toISOString(), engine: scenario.name, width: scenario.width, role: reviewerId === guardianId ? "guardian" : "leader", errors, writes: writes.length, effects, externalMessagesSent: 0 }, null, 2));
            } finally { await context.close(); }
          } finally { await browser.close(); }
        }, { messagingSecurity }));
      });
    } catch (error) {
      process.stdout.write(JSON.stringify({ phase: "native_review_filter_failure", engine: scenario.name, width: scenario.width, stage, errorName: error instanceof Error ? error.name : "unknown", detail: error instanceof Error ? error.message.split("\n")[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[synthetic-id]").slice(0, 300) : undefined, sqlState: sqlFailureState(error) }) + "\n");
      throw new Error("Native reviewer filter flow failed; inspect its safe stage diagnostic and owned fixture");
    }
  }, REVIEW_VALIDATION.testTimeoutMs);
});
