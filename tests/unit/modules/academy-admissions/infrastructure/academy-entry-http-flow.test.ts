/** @vitest-environment node */
/** Exercises the actual historical endpoint and native entry composition on an owned branch. @module academy-entry-http-flow-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { chromium } from "@playwright/test";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native historical academy entry", () => {
  it("should return real pending/replay/already_member and preserve unprotected direct entry without granting from an old protected body", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      process.stdout.write(JSON.stringify({ phase: "owned_branch", branch: database.branch }) + "\n");
      const fixture = await prepareContactVerificationDatabase(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007005000_read_admission_reviews.sql", "20261007010000_read_academy_admission_entry.sql"]) await database.applyMigration(migration);
      const tribeId = randomUUID(), historicalTribeId = randomUUID(), applicantId = randomUUID(), sessionId = randomUUID(), token = randomUUID(), leaderSessionId = randomUUID(), leaderToken = randomUUID(), slug = `entry-http-${tribeId}`, historicalSlug = `old-entry-${historicalTribeId}`;
      await database.withContext(fixture.own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Participante de ejemplo',${`${applicantId}@example.test`},false,${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${applicantId},${token},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${leaderSessionId},${fixture.userId},${leaderToken},clock_timestamp()+interval '1 hour',${now},${now})`);
        for (const [id, targetSlug] of [[tribeId, slug], [historicalTribeId, historicalSlug]]) {
          await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${id},'Academia de ejemplo',${targetSlug},${fixture.userId})`);
          await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${id},'academy',true)`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${id},${fixture.userId},'leader','active')`);
        }
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
      });
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)}`;
        const endpoint = `${origin}/api/tribes/${slug}/academy/join`;
        if (process.env.ADMISSION_CAPTURE_SNIPPET) {
          const browser = await chromium.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            try {
              await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${await makeSignature(token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
              const page = await context.newPage();
              await page.goto(`${origin}/${slug}/academia`, { waitUntil: "commit" });
              const entry = page.getByRole("link", { name: "Solicitar ingreso", exact: true });
              await entry.waitFor({ timeout: 90_000 });
              expect(await entry.getAttribute("href")).toBe(`/admissions/${slug}`);
              expect(await page.getByRole("button", { name: "Ingresar gratis", exact: true }).count()).toBe(0);
              await captureAdmissionReview(page, "academy-admission-entry", [fixture.userId, applicantId, sessionId, token, leaderSessionId, leaderToken, secret], "academy-entry-captures.json");
            } finally { await context.close(); }
          } finally { await browser.close(); }
        }
        const post = (url: string, body?: object) => fetch(url, { method: "POST", headers: { cookie, origin, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        expect((await post(endpoint)).status).toBe(400);
        const input = { operationId: randomUUID(), expectedPolicyVersion: 1, confirmed: true };
        const created = await post(endpoint, input);
        expect(created.status).toBe(201);
        const pending = await created.json();
        expect(pending).toMatchObject({ outcome: "pending", operationId: input.operationId, request: { status: "pending", version: 1 } });
        expect(pending).not.toHaveProperty("membership");
        expect((await post(endpoint, input)).status).toBe(200);
        const recovered = await fetch(`${origin}/api/tribes/${slug}/admissions/operations/${input.operationId}`, { headers: { cookie } });
        expect(await recovered.json()).toMatchObject({ type: "submit_admission", state: "completed", result: { admissionRequestId: pending.request.id } });
        expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as members from public.tribe_members where tribe_id=${tribeId} and user_id=${applicantId}`)).rows)).toEqual([{ members: 0 }]);
        const leaderCookie = `better-auth.session_token=${encodeURIComponent(`${leaderToken}.${await makeSignature(leaderToken, secret)}`)}`;
        const approved = await fetch(`${origin}/api/tribes/${slug}/admissions/requests/${pending.request.id}/decision`, { method: "POST", headers: { cookie: leaderCookie, origin, "content-type": "application/json" }, body: JSON.stringify({ operationId: randomUUID(), expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Revisión HTTP de compatibilidad" }) });
        expect(approved.status).toBe(200);
        const already = await post(endpoint, { ...input, operationId: randomUUID() });
        expect(already.status).toBe(200);
        expect(await already.json()).toMatchObject({ outcome: "already_member", membership: { role: "tribemate", status: "active" } });
        expect(await (await post(endpoint, input)).json()).toMatchObject({ outcome: "pending", request: { version: 1 } });
        const historical = await post(`${origin}/api/tribes/${historicalSlug}/academy/join`);
        expect(historical.status).toBe(201);
        expect(await historical.json()).toMatchObject({ status: "joined" });
        expect((await post(endpoint, { ...input, operationId: randomUUID(), paid: true })).status).toBe(400);
      }));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tribe_members where tribe_id=${tribeId} and user_id=${applicantId}) as protected_members,(select count(*)::int from public.academy_admission_requests where tribe_id=${tribeId} and user_id=${applicantId}) as requests,(select count(*)::int from public.tribe_members where tribe_id=${historicalTribeId} and user_id=${applicantId}) as historical_members,(select count(*)::int from public.message_deliveries where tribe_id in (${tribeId},${historicalTribeId})) as deliveries`)).rows)).toEqual([{ protected_members: 1, requests: 1, historical_members: 1, deliveries: 0 }]);
    });
    process.stdout.write(JSON.stringify({ phase: "cleanup_verified", workflow: "academy_entry" }) + "\n");
  }, 360_000);
});
