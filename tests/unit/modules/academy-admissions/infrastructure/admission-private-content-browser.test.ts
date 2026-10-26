/** @vitest-environment node */
/** Exercises current admission states and former reviewer authority against actual private HTTP/UI surfaces. @module admission-private-content-browser-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPrivateContent } from "@/tests/support/admission-private-content-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { TRIBE_EVENT_CALENDAR_FEED_TOKEN } from "@/src/modules/events/constants/tribe-event-calendar-feed";
import { buildAdmissionReviewRoute } from "@/lib/academy-admissions/admission-routes";
import { buildAdmissionExpirationModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native private content and former reviewer boundaries", () => {
  it.each([{ name: "chromium", engine: chromium }, { name: "webkit", engine: webkit }])("should keep pending and terminal applicants outside private content and close a former guardian on $name", async ({ engine }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, createApplicant, leader, guardian, privateDirectoryMarker } = await prepareAdmissionPrivateContent(database);
      const slug = `allowlist-${fixture.tribeId}`, privateMarker = randomUUID();
      const messageId = randomUUID(), assetId = randomUUID(), courseId = randomUUID(), channelId = randomUUID(), eventId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_channels(id,tribe_id,name,slug,emoji,sort_order) values (${channelId},${fixture.tribeId},${privateMarker},'private-example','🔥',0)`);
        await transaction.execute(sql`insert into public.messages(id,tribe_id,channel_id,author_id,content) values (${messageId},${fixture.tribeId},${channelId},${fixture.userId},${privateMarker})`);
        await transaction.execute(sql`insert into public.message_files(id,tribe_id,message_id,uploaded_by,storage_key,file_name,mime_type,file_size_bytes,status,sort_order) values (${assetId},${fixture.tribeId},${messageId},${fixture.userId},${`message-files/${fixture.tribeId}/${assetId}`},'private-example.txt','text/plain',1,'attached',0)`);
        await transaction.execute(sql`insert into public.courses(id,tribe_id,title,sort_order) values (${courseId},${fixture.tribeId},${privateMarker},0)`);
        await transaction.execute(sql`insert into public.events(id,tribe_id,created_by,title,description,starts_at,ends_at) values (${eventId},${fixture.tribeId},${fixture.userId},${privateMarker},${privateMarker},clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour')`);
      });
      const applicants: Array<{ userId: string; sessionToken: string; requestId: string; status: "pending" | "rejected" | "cancelled" | "expired"; feedToken: string }> = [];
      for (const status of ["pending", "rejected", "cancelled", "expired"] as const) {
        const owner = await createApplicant(), requestId = randomUUID();
        let actualRequestId: string = requestId;
        if (status === "expired") {
          // Seed a coherent historical pending; the real expiration owner determines its terminal state.
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${requestId},${fixture.tribeId},${owner.userId},'common','email',${owner.email},'declared','{"version":3,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,${privateMarker},transaction_timestamp()-interval '31 days',transaction_timestamp()-interval '1 day')`));
          const expiration = buildAdmissionExpirationModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true });
          expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
        } else {
          const submitted = await owner.commands.submit.execute({ ...owner.input, expectedPolicyVersion: 3, message: privateMarker });
          if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Private content setup failed: pending request unavailable");
          actualRequestId = submitted.value.result.admissionRequestId;
          if (status === "rejected") expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true, admissionRequestId: actualRequestId, expectedVersion: 1, decision: "reject", internalReason: "Revisión sintética", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed" } });
          if (status === "cancelled") expect(await owner.commands.cancelOwn.execute({ ...owner.input, operationId: randomUUID(), admissionRequestId: actualRequestId, expectedVersion: 1 })).toMatchObject({ ok: true, value: { state: "completed" } });
        }
        const sessionToken = owner.sessionToken;
        const feedToken = randomBytes(TRIBE_EVENT_CALENDAR_FEED_TOKEN.byteLength).toString("base64url");
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.event_calendar_feed_tokens(user_id,tribe_id,token_hash) values (${owner.userId},${fixture.tribeId},${createHash("sha256").update(feedToken).digest("hex")})`));
        applicants.push({ userId: owner.userId, sessionToken, requestId: actualRequestId, status, feedToken });
      }
      const guardianToken = guardian.sessionToken;
      const leaderFeed = randomBytes(TRIBE_EVENT_CALENDAR_FEED_TOKEN.byteLength).toString("base64url");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.event_calendar_feed_tokens(user_id,tribe_id,token_hash) values (${fixture.userId},${fixture.tribeId},${createHash("sha256").update(leaderFeed).digest("hex")})`));
      /** @returns Safe effect counts plus public terminal states, excluding private rows and credentials. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        counts: (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate') as members`)).rows[0],
        requests: (await transaction.execute<{ id: string; status: string; version: number }>(sql`select id,status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows,
      }));
      const before = await snapshot();
      expect(applicants.every((applicant) => before.requests.some((request) => request.id === applicant.requestId && request.status === applicant.status))).toBe(true);
      expect(before.counts).toMatchObject({ members: 0 });
      /** Synthetic attachment storage lets the download route reach its access check instead of answering storage-unavailable; denied downloads never sign or contact storage. */
      const attachmentStorage = { CLOUDFLARE_ACCOUNT_ID: randomUUID(), CLOUDFLARE_R2_ACCESS_KEY_ID: randomUUID(), CLOUDFLARE_R2_SECRET_ACCESS_KEY: randomUUID(), CLOUDFLARE_R2_BUCKET_NAME: `synthetic-${randomUUID()}` };
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const leaderCookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`;
        // Positive controls prove the actual endpoints can see the private resources for a current leader.
        for (const suffix of ["channels", "messages?channel=private-example", "events"]) {
          const response = await runPrivateBrowserRequest("read_leader_content", () => fetch(`${origin}/api/tribes/${slug}/${suffix}`, { headers: { cookie: leaderCookie } }));
          expect(response.status).toBe(200);
          expect((await response.text()).includes(privateMarker)).toBe(true);
        }
        const leaderCalendar = await runPrivateBrowserRequest("read_leader_calendar", () => fetch(`${origin}/api/calendar/tribes/${slug}/feed/${leaderFeed}.ics`));
        expect(leaderCalendar.status).toBe(200);
        expect((await leaderCalendar.text()).includes(privateMarker)).toBe(true);
        const leaderDirectory = await runPrivateBrowserRequest("read_leader_directory", () => fetch(`${origin}/api/tribes/${slug}/academy/members`, { headers: { cookie: leaderCookie } }));
        expect(leaderDirectory.status).toBe(200);
        expect((await leaderDirectory.text()).includes(privateDirectoryMarker)).toBe(true);
        const browser = await engine.launch({ headless: true });
        try {
          for (const applicant of applicants) {
            for (const width of [390, 1280]) {
              const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
              try {
                await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${applicant.sessionToken}.${await makeSignature(applicant.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                const page = await context.newPage();
                await runPrivateBrowserRequest("open_own_admission", () => page.goto(`${origin}/admissions/${slug}`, { waitUntil: "commit" }));
                await page.getByText(ADMISSION_UI_COPY[applicant.status], { exact: true }).first().waitFor({ timeout: 90_000 });
                expect(await page.getByRole("link", { name: ADMISSION_UI_COPY.openAcademy }).count()).toBe(0);
                const ownRequest = await runPrivateBrowserRequest("read_own_admission", () => context.request.get(`${origin}/api/tribes/${slug}/admissions/own-request`));
                expect(ownRequest.status()).toBe(200);
                expect(await ownRequest.json()).toMatchObject({ id: applicant.requestId, status: applicant.status });
                for (const suffix of ["channels", "events"]) {
                  const response = await runPrivateBrowserRequest("read_hidden_content", () => context.request.get(`${origin}/api/tribes/${slug}/${suffix}`));
                  expect(response.status()).toBe(200);
                  const payload = await response.json();
                  if (suffix === "channels") expect(payload).toEqual({ channels: [] });
                  else expect(payload).toMatchObject({ events: [], pendingProposalCount: 0, recordedOccurrenceKeys: [], selectedOccurrenceKey: null });
                  expect([privateMarker, privateDirectoryMarker].every((value) => !JSON.stringify(payload).includes(value))).toBe(true);
                }
                const messages = await runPrivateBrowserRequest("read_hidden_messages", () => context.request.get(`${origin}/api/tribes/${slug}/messages?channel=private-example`));
                expect(messages.status()).toBe(404);
                expect([privateMarker, privateDirectoryMarker].every((value) => !(messages.headers().location ?? "").includes(value))).toBe(true);
                const messagesBody = await messages.text();
                expect([privateMarker, privateDirectoryMarker].every((value) => !messagesBody.includes(value))).toBe(true);
                for (const suffix of ["events/calendar-feed", "academy/members"]) {
                  const response = await runPrivateBrowserRequest("read_denied_resource", () => context.request.get(`${origin}/api/tribes/${slug}/${suffix}`));
                  expect([403, 404]).toContain(response.status());
                  const payload = await response.text();
                  expect([privateMarker, privateDirectoryMarker].every((value) => !payload.includes(value))).toBe(true);
                }
                const download = await runPrivateBrowserRequest("download_private_file", () => context.request.get(`${origin}/api/tribes/${slug}/messages/files/${assetId}/download`, { maxRedirects: 0 }));
                expect(download.status()).toBe(404);
                expect(download.headers().location).toBeUndefined();
                const calendar = await runPrivateBrowserRequest("read_private_calendar", () => context.request.get(`${origin}/api/calendar/tribes/${slug}/feed/${applicant.feedToken}.ics`));
                expect(calendar.status()).toBe(404);
                expect((await calendar.text()).includes(privateMarker)).toBe(false);
                for (const suffix of ["", "/tribu", "/cursos"]) {
                  const response = await runPrivateBrowserRequest("read_private_page_props", () => context.request.get(`${origin}/${slug}${suffix}`));
                  expect(response.status()).toBeLessThan(500);
                  const html = await response.text();
                  expect([privateMarker, privateDirectoryMarker].every((value) => !html.includes(value))).toBe(true);
                }
              } finally { await context.close(); }
            }
          }
          const guardianContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
          try {
            await guardianContext.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${guardianToken}.${await makeSignature(guardianToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
            const page = await guardianContext.newPage(), pending = applicants.find((applicant) => applicant.status === "pending")!;
            const reviewUrl = `${origin}${buildAdmissionReviewRoute(slug, pending.requestId)}`;
            await runPrivateBrowserRequest("open_current_guardian_review", () => page.goto(reviewUrl, { waitUntil: "commit" }));
            await page.getByText(privateMarker, { exact: true }).first().waitFor({ timeout: 90_000 });
            expect(await snapshot()).toEqual(before);
            await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${guardian.userId}`));
            const denied = await runPrivateBrowserRequest("read_former_guardian_props", () => guardianContext.request.get(reviewUrl));
            expect(denied.status()).toBeLessThan(500);
            expect((await denied.text()).includes(privateMarker)).toBe(false);
            await runPrivateBrowserRequest("open_former_guardian_review", () => page.goto(reviewUrl, { waitUntil: "networkidle" }));
            expect((await page.locator("body").innerText()).includes(privateMarker)).toBe(false);
            const decision = await runPrivateBrowserRequest("decide_as_former_guardian", () => guardianContext.request.post(`${origin}/api/tribes/${slug}/admissions/requests/${pending.requestId}/decision`, { headers: { origin }, data: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión sintética" } }));
            expect(decision.status()).toBeGreaterThanOrEqual(400);
            expect(decision.status()).toBeLessThan(500);
            expect(await snapshot()).toEqual(before);
          } finally { await guardianContext.close(); }
        } finally { await browser.close(); }
      }, { environment: attachmentStorage }));
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
