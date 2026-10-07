/** @vitest-environment node */
/** Exercises actual reviewer pages, native SDK/auth, SQL decisions and recovery in Chromium/WebKit. @module admission-review-browser-flow-tests */
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { setTimeout as delay } from "node:timers/promises";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { buildAdmissionReviewRoute } from "@/lib/academy-admissions/admission-routes";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native current reviewer flow", () => {
  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
    it(`should approve/reject from a current guardian and reconcile the original decision in ${engine} mobile/desktop`, async () => {
      await withAcademyAdmissionDatabase(async (database) => {
        process.stdout.write(JSON.stringify({ phase: "owned_branch", engine, branch: database.branch }) + "\n");
        for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007003000_read_admission_notification_subject.sql", "20261007004000_read_exact_own_admission_request.sql", "20261007005000_read_admission_reviews.sql"]) await database.applyMigration(migration);
        const tribeId = randomUUID(), leaderId = randomUUID(), guardianId = randomUUID(), sessionId = randomUUID(), token = randomUUID(), slug = `review-ui-${tribeId}`;
        const applicants = [1280, 390].map((width) => ({ userId: randomUUID(), requestId: randomUUID(), width, email: `solicitante-${width}-${randomUUID()}@example.test`, name: width === 390 ? "Solicitante de ejemplo A" : "Solicitante de ejemplo B" }));
        await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
          const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
          for (const userId of [leaderId, guardianId, ...applicants.map((applicant) => applicant.userId)]) { const applicant = applicants.find((candidate) => candidate.userId === userId); await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${applicant?.name ?? "Responsable de ejemplo"},${applicant?.email ?? `${userId}@example.test`},false,${now},${now})`); }
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${guardianId},${token},clock_timestamp()+interval '1 hour',${now},${now})`);
          await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia sintética',${slug},${leaderId})`);
          await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active')`);
          await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
          await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
          for (const applicant of applicants) await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${applicant.requestId},${tribeId},${applicant.userId},'common','email',${applicant.email},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,'Quiero participar.',${now},${now}::timestamptz+interval '30 days')`);
        });
        const captures = join(process.cwd(), "user-guides", "assets", "academy-admissions"); await mkdir(captures, { recursive: true });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const browser = await browserType.launch({ headless: true });
          try {
            for (const applicant of applicants) {
              const context = await browser.newContext({ viewport: { width: applicant.width, height: 900 } });
              let stage = "open_inbox";
              try {
                await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${await makeSignature(token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                const page = await context.newPage(), errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) errors.push("hydration_error"); });
                const forbidden = [leaderId, guardianId, sessionId, token, secret, ...applicants.map((participant) => participant.userId)];
                // The leaf streams behind Suspense; readiness is its interactive control, not the final HTML load event.
                await page.goto(`${origin}/${slug}/academia/admissions`, { waitUntil: "commit" });
                const selectedButton = page.getByRole("button", { name: `Revisar solicitud: ${applicant.name}`, exact: true });
                await selectedButton.waitFor({ timeout: 90_000 });
                if (applicant.width === 1280) await captureAdmissionReview(page, "admission-review-inbox", forbidden);
                stage = "select_request";
                await selectedButton.click();
                stage = "open_canonical_detail";
                if (applicant.width === 1280) await page.goto(`${origin}${buildAdmissionReviewRoute(slug, applicant.requestId)}`, { waitUntil: "commit" });
                stage = "wait_detail";
                await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }).waitFor({ timeout: 90_000 });
                await page.getByRole("textbox", { name: ADMISSION_REVIEW_UI_COPY.internalReason, exact: true }).fill("Revisión manual registrada.");
                await page.getByRole("textbox", { name: ADMISSION_REVIEW_UI_COPY.externalMessage, exact: true }).fill("Te avisamos el resultado de tu solicitud.");
                await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }).check();
                expect(await page.getByText(ADMISSION_REVIEW_UI_COPY.declared, { exact: true }).count()).toBe(1);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                await page.screenshot({ path: join(captures, `${engine}-${applicant.width}-review.png`), fullPage: true });
                if (applicant.width === 1280) {
                  await captureAdmissionReview(page, "admission-review-detail", forbidden);
                  await captureAdmissionReview(page, "admission-review-facts", forbidden, "review-captures.json", { selector: 'section[aria-label="Detalle de la solicitud"]', omit: "form" });
                  await captureAdmissionReview(page, "admission-review-form", forbidden, "review-captures.json", { selector: 'section[aria-label="Detalle de la solicitud"] form' });
                }
                let writes = 0;
                let interceptionFailed = false;
                let mutationEntered!: () => void;
                const mutationStarted = new Promise<void>((resolve) => { mutationEntered = resolve; });
                let interceptionComplete!: () => void;
                const interceptionFinished = new Promise<void>((resolve) => { interceptionComplete = resolve; });
                await context.route(`**/api/tribes/${slug}/admissions/requests/${applicant.requestId}/decision`, async (route) => {
                  writes += 1;
                  mutationEntered();
                  try { if (engine === "chromium" && applicant.width === 390 && writes === 1) {
                    // Own transport fault: never let Playwright serialize request headers in an unhandled error.
                    try {
                      const response = route.fetch().then(() => true, () => false);
                      await delay(5_000);
                      const waits = await database.withContext({ userId: guardianId, email: null }, async (transaction) => (await transaction.execute(sql`select wait_event_type,wait_event,state,cardinality(pg_blocking_pids(pid))::int as blockers from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state='active'`)).rows);
                      process.stdout.write(JSON.stringify({ phase: "decision_wait_metadata", engine, waits }) + "\n");
                      if (!await response) interceptionFailed = true;
                    } catch { interceptionFailed = true; }
                    await route.abort("failed").catch(() => undefined);
                  }
                  else await route.continue();
                  } catch { interceptionFailed = true; }
                  finally { interceptionComplete(); }
                });
                stage = "decide_request";
                await page.getByRole("button", { name: applicant.width === 390 ? ADMISSION_REVIEW_UI_COPY.approve : ADMISSION_REVIEW_UI_COPY.reject, exact: true }).click();
                stage = "wait_decision";
                if (engine === "chromium" && applicant.width === 390) {
                  await mutationStarted;
                  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
                  const recovered = page.getByText(ADMISSION_REVIEW_UI_COPY.recovered, { exact: true });
                  await page.getByText(ADMISSION_REVIEW_UI_COPY.uncertain, { exact: true }).or(recovered).first().waitFor({ timeout: 90_000 });
                  if (!await recovered.isVisible()) {
                    await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true }).click();
                    await recovered.waitFor({ timeout: 90_000 });
                  }
                } else await page.getByText(ADMISSION_REVIEW_UI_COPY.complete, { exact: true }).waitFor({ timeout: 90_000 });
                await interceptionFinished;
                expect(writes, "reviewer decision must issue a single original POST").toBe(1);
                expect(interceptionFailed, "owned decision transport must complete before recovery assertions").toBe(false);
                expect(await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve, exact: true }).count(), "a decided request must not offer another approval").toBe(0);
                expect(errors, "reviewer page must render without runtime or hydration errors").toEqual([]);
                if (applicant.width === 1280) await captureAdmissionReview(page, "admission-review-complete", forbidden);
              } catch (error) {
                const assertion = error instanceof Error && error.name === "AssertionError" ? error.message.split("\n")[0].slice(0, 180) : undefined;
                process.stdout.write(JSON.stringify({ phase: "review_failure_stage", engine, width: applicant.width, stage, errorName: error instanceof Error ? error.name : "unknown", assertion }) + "\n");
                const currentPage = context.pages()[0];
                if (currentPage && !currentPage.isClosed()) {
                  await currentPage.screenshot({ path: join(captures, `${engine}-${applicant.width}-review-failure.png`), fullPage: true }).catch(() => undefined);
                  const message = await currentPage.locator("main").allTextContents().catch(() => []);
                  process.stdout.write(JSON.stringify({ phase: "review_failure", engine, width: applicant.width, visibleText: message.map((text) => text.slice(0, 900)) }) + "\n");
                }
                throw new Error("Native admission reviewer flow failed; inspect the safe stage diagnostic and fixture capture");
              } finally { await context.close(); process.stdout.write(JSON.stringify({ phase: "context_closed", engine, width: applicant.width }) + "\n"); }
            }
          } finally { await browser.close(); process.stdout.write(JSON.stringify({ phase: "browser_closed", engine }) + "\n"); }
        }));
        process.stdout.write(JSON.stringify({ phase: "server_closed", engine }) + "\n");
        expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select count(*) filter(where status='approved')::int as approved,count(*) filter(where status='rejected')::int as rejected from public.academy_admission_requests where tribe_id=${tribeId}`)).rows)).toEqual([{ approved: 1, rejected: 1 }]);
        expect(await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${tribeId} and role='tribemate' and status='active') as basic,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${tribeId}) as bindings,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows)).toEqual([{ basic: 1, bindings: 0, deliveries: 0 }]);
        process.stdout.write(JSON.stringify({ phase: "business_checks_complete", engine, branch: database.branch.id }) + "\n");
      });
      process.stdout.write(JSON.stringify({ phase: "cleanup_verified", engine }) + "\n");
    }, 600_000);
  }
});
