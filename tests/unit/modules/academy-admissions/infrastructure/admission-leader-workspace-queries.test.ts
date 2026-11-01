/** @vitest-environment node */
/** Measures native pg transactions, statements and sequential round trips per leader admission page and command that the leader flow suite does not cover, on the real built server. @module admission-leader-workspace-queries-tests */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionRequestMeasurement, findAdmissionBudgetOverruns, signedAdmissionSessionCookie, withAdmissionQueryCounter } from "@/tests/support/admission-request-measurement";
import { ADMISSION_REQUEST_MEASUREMENT } from "@/tests/support/constants/admission-request-measurement";
import { ADMISSION_LEADER_WORKSPACE_QUERY_BUDGET as BUDGET, ADMISSION_LEADER_WORKSPACE_QUERY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-leader-workspace-queries";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

const SAMPLES = ADMISSION_REQUEST_MEASUREMENT.samples;
/** @param count - Samples to build. @param build - Builds the sample at one index. @returns The samples, in order. */
const repeat = <Sample>(count: number, build: (index: number) => Sample) => Array.from({ length: count }, (_, index) => build(index));
/** @param text - JSON command response. @returns Its original result. */
const resultOf = (text: string) => (JSON.parse(text) as { result: Record<string, unknown> }).result;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native leader workspace query counts", () => {
  it("should keep leader pages and commands within their per-request database budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionBatch(database, undefined, { securityConfig: await readMessagingHostingSecurityConfig() });
      const slug = `allowlist-${fixture.tribeId}`, pending = await fixture.seedPendingSelection(SAMPLES * 3);
      // The fixture session lasts ten minutes and this suite runs longer at ~170 ms per round trip; an expired session would measure the signed-out page instead.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${VALIDATION.sessionExtension}::interval where id=${fixture.sessionId}`));
      /** @param statement - Version lookup for the tribe. @returns The stored version, or zero while the row does not exist. */
      const versionOf = async (statement: ReturnType<typeof sql>) => (await database.withContext(fixture.own, (transaction) => transaction.execute<{ version: number }>(statement))).rows[0]?.version ?? 0;
      const measurement = createAdmissionRequestMeasurement({ [slug]: "[slug]", ...Object.fromEntries(pending.map((request) => [request.admissionRequestId, "[requestId]"])) });

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const { send, measure } = measurement.connect({ origin, cookie: await signedAdmissionSessionCookie(fixture.sessionToken, secret, makeSignature) });
        const page = `/${slug}/academia/admissions`, api = `/api/tribes/${slug}/admissions`, messaging = `/api/tribes/${slug}/messaging`;
        const pages = { activity: `${page}/activity`, allowlist: `${page}/allowlist`, allowlist_imports: `${page}/allowlist/imports`, invitations: `${page}/invitations` };
        const reads = (path: string) => repeat(SAMPLES, () => ({ path }));
        // Warm-up compiles routes and fills the pools; none of it is reported.
        for (const path of [...Object.values(pages), `${page}/history/${pending[0].admissionRequestId}`]) await send("GET", { path });

        // Individual and batch decisions over seeded pending requests.
        const individual = pending.slice(0, SAMPLES), batches = repeat(SAMPLES, (index) => pending.slice(SAMPLES + index * 2, SAMPLES + index * 2 + 2));
        await measure("decide_request", "POST", individual.map((request) => ({ path: `${api}/requests/${request.admissionRequestId}/decision`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: request.expectedVersion, decision: "approve", internalReason: "Revisión medida" } })));
        await measure("decide_batch", "POST", batches.map((selection) => ({ path: `${api}/request-decisions`, body: { operationId: randomUUID(), confirmed: true, decision: "reject", internalReason: "Revisión por lote medida", items: selection.map((request) => ({ requestId: request.admissionRequestId, expectedVersion: request.expectedVersion })) } })));
        for (const [label, path] of Object.entries(pages)) await measure(`page_${label}`, "GET", reads(path));
        await measure("page_request_history", "GET", individual.map((request) => ({ path: `${page}/history/${request.admissionRequestId}` })));

        // List commands.
        const identities = repeat(SAMPLES, (index) => `medida.${index}.${randomUUID()}@example.test`);
        const entries = (await measure("create_allowlist_entry", "POST", identities.map((identity) => ({ path: `${api}/allowlist`, body: { operationId: randomUUID(), confirmed: true, contactType: "email", identity, displayName: "Grupo medido" } })), [201])).map((text) => String(resultOf(text).entryId));
        await measure("update_allowlist_entry", "PATCH", entries.map((entryId) => ({ path: `${api}/allowlist/${entryId}`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, displayName: "Grupo medido renombrado" } })));
        const policyVersion = await versionOf(sql`select version from public.academy_admission_policies where tribe_id=${fixture.tribeId}`);
        const imports = (await measure("preview_allowlist_import", "POST", repeat(SAMPLES, (index) => ({ path: `${api}/allowlist/imports`, body: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: policyVersion, contactType: "email", csvText: `identity,display_name\nimport.${index}.${randomUUID()}@example.test,Importado` } })), [201])).map((text) => String(resultOf(text).importId));
        await measure("confirm_allowlist_import", "POST", imports.map((importId) => ({ path: `${api}/allowlist/imports/${importId}/confirm`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] } })));

        // Personal invitations for listed recipients.
        const invitations = (await measure("create_invitation", "POST", identities.map((identity, index) => ({ path: `${api}/invitations`, body: { operationId: randomUUID(), confirmed: true, internalName: `Invitación medida ${index + 1}`, recipient: { type: "email", value: identity }, requiresAllowlist: true } })), [201])).map((text) => String(resultOf(text).invitationId));
        await measure("rename_invitation", "PATCH", invitations.map((invitationId) => ({ path: `${api}/invitations/${invitationId}`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, internalName: "Invitación medida renombrada" } })));
        await measure("revoke_invitation", "POST", invitations.map((invitationId) => ({ path: `${api}/invitations/${invitationId}/revoke`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 2, reason: "Enlace retirado", revokeRedeemedAuthorization: false } })));

        // Notices and email, countries and quotas: each sample observes the version the previous one stored.
        for (let index = 0; index < SAMPLES; index += 1) {
          const expectedVersion = await versionOf(sql`select version from public.admission_email_settings where tribe_id=${fixture.tribeId}`);
          await measure("save_email_settings", "POST", [{ path: `${api}/email-settings`, body: { operationId: randomUUID(), confirmed: true, expectedVersion, enabled: index % 2 === 0, timeZone: "America/Argentina/Buenos_Aires" } }]);
        }
        for (const mode of ["grouped", "daily", "individual"] as const) {
          const expectedVersion = await versionOf(sql`select version from public.admission_notification_preferences where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.userId}`);
          await measure("save_notification_preference", "PATCH", [{ path: `${api}/notification-preferences`, body: { mode, expectedVersion } }]);
        }
        await measure("initialize_usage_policy", "POST", [{ path: `${messaging}/usage-policy`, body: { operationId: randomUUID(), confirmed: true } }], [200, 201]);
        for (const allowedCountries of [["AR"], ["AR", "UY"], ["AR", "UY", "CL"]]) {
          const expectedVersion = await versionOf(sql`select version from public.messaging_usage_policies where tribe_id=${fixture.tribeId}`);
          await measure("save_usage_policy", "PUT", [{ path: `${messaging}/usage-policy`, body: { operationId: randomUUID(), confirmed: true, expectedVersion, allowedCountries, verificationDailyLimit: 50 + allowedCountries.length, notificationDailyLimit: 100 + allowedCountries.length } }]);
        }

        // Pausing closes admission, so it runs last; every pause observes the stored version.
        for (let index = 0; index < SAMPLES; index += 1) {
          const expectedVersion = await versionOf(sql`select version from public.academy_admission_policies where tribe_id=${fixture.tribeId}`);
          await measure("pause_policy", "POST", [{ path: `${api}/policy/pause`, body: { operationId: randomUUID(), confirmed: true, expectedVersion, reason: `Pausa medida ${index + 1}` } }]);
        }
      }, withAdmissionQueryCounter(measurement.onQueryCount)));

      const report = measurement.report();
      process.stdout.write(`${JSON.stringify({ phase: "admission_leader_workspace_queries", report })}\n`);
      if (process.env[VALIDATION.reportEnvironmentVariable]) await writeFile(process.env[VALIDATION.reportEnvironmentVariable]!, JSON.stringify(report, null, 2));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows)).toEqual([{ decisions: SAMPLES * 3, deliveries: 0 }]);
      expect(findAdmissionBudgetOverruns(measurement.measured, BUDGET)).toEqual([]);
    });
  }, VALIDATION.timeoutMs);
});
