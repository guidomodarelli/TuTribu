/** @vitest-environment node */
/** Exercises complete native administrative HTML and context reads without browser scheduling. @module personal-invitation-management-ssr-flow-tests */
import { devices } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalInvitationManagementDatabase } from "@/tests/support/personal-invitation-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { sql } from "drizzle-orm";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal management SSR transport", () => {
  it("should complete the current leader context and administrative HTML for Chromium and WebKit request headers without writes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePersonalInvitationManagementDatabase(database), slug = `allowlist-${fixture.tribeId}`;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`;
        for (const browser of ["Desktop Safari", "Desktop Chrome"]) {
          const headers = { cookie, "user-agent": devices[browser].userAgent };
          const startedAt = performance.now();
          try {
            const response = await fetch(`${origin}/${slug}/academia/admissions/invitations`, { headers, signal: AbortSignal.timeout(180_000) });
            expect(response.status).toBe(200);
            const markup = await response.text();
            // A failed assertion never serializes private HTML into the report.
            for (const fragment of ["Nueva invitación", "Nombre interno", "Correo destinatario", "</body>", "</html>"]) expect(markup.includes(fragment)).toBe(true);
            for (const privateValue of [fixture.sessionToken, secret, cookie]) expect(markup.includes(privateValue)).toBe(false);
            process.stdout.write(JSON.stringify({ phase: "personal_management_ssr", browser, stage: "document_completed", elapsedMs: Math.round(performance.now() - startedAt), bytes: Buffer.byteLength(markup) }) + "\n");
            const contextResponse = await fetch(`${origin}/api/tribes/${slug}/admissions/invitations/context`, { headers, signal: AbortSignal.timeout(180_000) });
            expect(contextResponse.status).toBe(200);
            expect(await contextResponse.json()).toMatchObject({ kind: "ready", viewerId: fixture.userId, contactType: "email", page: { items: [] } });
            process.stdout.write(JSON.stringify({ phase: "personal_management_ssr", browser, stage: "context_completed", elapsedMs: Math.round(performance.now() - startedAt) }) + "\n");
          } catch (error) {
            const errorName = error instanceof Error ? error.name : "Unknown";
            throw new Error(`Personal management SSR transport failed browser=${browser} errorName=${errorName}`, { cause: error });
          }
        }
      }));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_personal_invitations where tribe_id=${fixture.tribeId}) as invitations,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations`)).rows).toEqual([{ invitations: 0, requests: 0, operations: 0 }]);
      });
    });
  }, 1_200_000);
});
