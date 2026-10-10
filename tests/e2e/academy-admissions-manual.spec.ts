/** Exercises actual preadmission, private-content denial and basic-only approval with native fixtures. @module academy-admissions-manual-e2e */
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";

test("should keep manual pending outside membership and open only basic academy access after a real decision", async ({ page, context }) => {
  await withAcademyAdmissionDatabase(async (database) => {
    process.stdout.write(JSON.stringify({ phase: "owned_branch", branch: database.branch }) + "\n");
    const fixture = await prepareContactVerificationDatabase(database);
    for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007003000_read_admission_notification_subject.sql", "20261007004000_read_exact_own_admission_request.sql", "20261007005000_read_admission_reviews.sql", "20261007010000_read_academy_admission_entry.sql"]) await database.applyMigration(migration);
    for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261007030000_capture_admission_decision_evidence.sql"]) await database.applyMigration(migration);
    const tribeId = randomUUID(), slug = `manual-e2e-${tribeId}`, applicantId = randomUUID(), applicantSessionId = randomUUID(), applicantToken = randomUUID(), leaderSessionId = randomUUID(), leaderToken = randomUUID(), messageId = randomUUID(), assetId = randomUUID(), courseId = randomUUID(), channelId = randomUUID();
    const privateMessage = `Mensaje privado de ejemplo ${messageId}`, privateCourse = `Curso privado de ejemplo ${courseId}`;
    await database.withContext(fixture.own, async (transaction) => {
      const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Participante de ejemplo',${`${applicantId}@example.test`},false,${now},${now})`);
      for (const [userId, sessionId, token] of [[applicantId, applicantSessionId, applicantToken], [fixture.userId, leaderSessionId, leaderToken]]) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${token},clock_timestamp()+interval '1 hour',${now},${now})`);
      await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia de ejemplo',${slug},${fixture.userId})`);
      await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
      await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
      await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
      await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
      await transaction.execute(sql`insert into public.tribe_channels(id,tribe_id,name,slug,emoji,sort_order) values (${channelId},${tribeId},'Canal privado de ejemplo','ejemplo','🔥',0)`);
      await transaction.execute(sql`insert into public.messages(id,tribe_id,channel_id,author_id,content) values (${messageId},${tribeId},${channelId},${fixture.userId},${privateMessage})`);
      await transaction.execute(sql`insert into public.message_files(id,tribe_id,message_id,uploaded_by,storage_key,file_name,mime_type,file_size_bytes,status,sort_order) values (${assetId},${tribeId},${messageId},${fixture.userId},${`message-files/${tribeId}/${assetId}`},'ejemplo-privado.txt','text/plain',1,'attached',0)`);
      await transaction.execute(sql`insert into public.courses(id,tribe_id,title,sort_order) values (${courseId},${tribeId},${privateCourse},0)`);
    });
    await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
      await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "commit" });
      await expect(page.getByRole("link", { name: ADMISSION_UI_COPY.signIn })).toHaveAttribute("href", new RegExp(encodeURIComponent(`/admissions/${slug}`)), { timeout: 90_000 });
      await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${applicantToken}.${await makeSignature(applicantToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
      await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "commit" });
      await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).check({ timeout: 90_000 });
      await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
      await expect(page.getByText(ADMISSION_UI_COPY.pending, { exact: true }).first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole("link", { name: ADMISSION_UI_COPY.openAcademy })).toHaveCount(0);
      const own = await context.request.get(`${origin}/api/tribes/${slug}/admissions/own-request`);
      expect(own.status()).toBe(200);
      const request = await own.json();
      expect(request).toMatchObject({ status: "pending", version: 1 });
      expect(request).not.toHaveProperty("internalReason");
      const denied = await context.request.get(`${origin}/api/tribes/${slug}/academy/members`);
      expect([403, 404]).toContain(denied.status());
      const privateDownload = await context.request.get(`${origin}/api/tribes/${slug}/messages/files/${assetId}/download`, { maxRedirects: 0 });
      expect(privateDownload.status()).toBe(404);
      expect(privateDownload.headers()).not.toHaveProperty("location");
      for (const path of [`/${slug}`, `/${slug}/tribu`, `/${slug}/cursos`]) {
        const privatePage = await context.request.get(`${origin}${path}`);
        const html = await privatePage.text();
        expect(html).not.toContain(privateMessage);
        expect(html).not.toContain(privateCourse);
      }
      const leaderCookie = `better-auth.session_token=${encodeURIComponent(`${leaderToken}.${await makeSignature(leaderToken, secret)}`)}`;
      const approved = await fetch(`${origin}/api/tribes/${slug}/admissions/requests/${request.id}/decision`, { method: "POST", headers: { cookie: leaderCookie, origin, "content-type": "application/json" }, body: JSON.stringify({ operationId: randomUUID(), expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Revisión E2E real" }) });
      expect(approved.status).toBe(200);
      await page.reload({ waitUntil: "commit" });
      await expect(page.getByRole("link", { name: ADMISSION_UI_COPY.openAcademy })).toBeVisible({ timeout: 90_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }));
    expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${tribeId} and user_id=${applicantId} and role='tribemate' and status='active') as basic,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${tribeId}) as bindings`)).rows)).toEqual([{ basic: 1, deliveries: 0, bindings: 0 }]);
    expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select evidence_snapshot from public.academy_admission_decisions where tribe_id=${tribeId} and user_id=${applicantId}`)).rows)).toEqual([{ evidence_snapshot: { kind: "declared", referenceId: null, verifiedAt: null } }]);
  });
  process.stdout.write(JSON.stringify({ phase: "cleanup_verified", workflow: "manual_e2e" }) + "\n");
});
