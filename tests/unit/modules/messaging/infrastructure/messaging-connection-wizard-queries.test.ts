/** @vitest-environment node */
/** Measures native pg transactions, statements and sequential round trips per step of the messaging connection wizard on the real built server, behind the closed synthetic provider transport. @module messaging-connection-wizard-queries-tests */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionRequestMeasurement, findAdmissionBudgetOverruns, signedAdmissionSessionCookie, withAdmissionQueryCounter } from "@/tests/support/admission-request-measurement";
import { ADMISSION_REQUEST_MEASUREMENT } from "@/tests/support/constants/admission-request-measurement";
import { MESSAGING_CONNECTION_WIZARD_QUERY_BUDGET as BUDGET, MESSAGING_CONNECTION_WIZARD_QUERY_VALIDATION as VALIDATION } from "@/tests/support/constants/messaging-connection-wizard-queries";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

/** @param text - JSON command response. @returns Its original result. */
const resultOf = (text: string) => (JSON.parse(text) as { result: Record<string, unknown> }).result;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native messaging connection wizard query counts", () => {
  it("should keep every wizard step within its per-request database budget without real provider traffic", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs, securityConfig: await readMessagingHostingSecurityConfig() });
      const credential = randomUUID(), senderId = randomUUID(), measurement = createAdmissionRequestMeasurement({ [leader.slug]: "[slug]" });
      let receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, leader.slug, async (origin, secret) => {
        const { send, measure } = measurement.connect({ origin, cookie: await signedAdmissionSessionCookie(leader.sessionToken, secret, makeSignature) });
        const base = `/api/tribes/${leader.slug}/messaging`, page = `/${leader.slug}/academia/admissions/messaging/connections`;
        // Warm-up compiles the wizard routes; none of it is reported.
        await send("GET", { path: page });
        await send("GET", { path: `${base}/configuration` });
        await measure("initialize_usage_policy", "POST", [{ path: `${base}/usage-policy`, body: { operationId: randomUUID(), confirmed: true } }], [200, 201]);
        /** @param connectionId - Connection whose stored lifecycle version the next command observes, as the leader UI does. @returns That version. */
        const lifecycleVersionOf = async (connectionId: string) => (await database.withContext(leader.fixture.own, (transaction) => transaction.execute<{ version: number }>(sql`select version from public.tenant_messaging_connections where id=${connectionId}`))).rows[0].version;
        // Every step changes state, so its samples come from complete rounds. The diagnostic is limited per leader, so only the
        // last round issues, verifies and activates; earlier candidates are disconnected (unreported) before the next round.
        for (let round = 0; round < ADMISSION_REQUEST_MEASUREMENT.samples; round += 1) {
          const [created] = await measure("create_connection", "POST", [{ path: `${base}/connections`, body: { operationId: randomUUID(), confirmed: true, providerId: "zavu", name: `Conexión medida ${round + 1}`, apiKey: credential } }], [201]);
          const connectionId = String(resultOf(created).id), path = `${base}/connections/${connectionId}`;
          await measure("configure_connection", "PUT", [{ path: `${path}/configuration`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, channel: "email", senderId } }]);
          await measure("validate_connection", "POST", [{ path: `${path}/validate`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 2 } }]);
          if (round < ADMISSION_REQUEST_MEASUREMENT.samples - 1) {
            const disconnected = await send("POST", { path: `${path}/disconnect`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: await lifecycleVersionOf(connectionId) } });
            expect(disconnected.status).toBe(200);
            continue;
          }
          receivedCode = "";
          const [issued] = await measure("issue_diagnostic", "POST", [{ path: `${path}/diagnostics`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: 3, channel: "email", recipient: leader.fixture.own.email } }]);
          if (!/^\d{6}$/u.test(receivedCode)) throw new Error("Wizard measurement expected the private synthetic diagnostic receipt");
          await measure("verify_diagnostic", "POST", [{ path: `${path}/diagnostics/${String(resultOf(issued).diagnosticId)}/verify`, body: { operationId: randomUUID(), confirmed: true, verificationCode: receivedCode } }]);
          // The diagnostic advances the lifecycle version, so activation observes the stored one.
          const lifecycleVersion = await lifecycleVersionOf(connectionId);
          const [activated] = await measure("activate_connection", "POST", [{ path: `${path}/activate`, body: { operationId: randomUUID(), confirmed: true, expectedVersion: lifecycleVersion } }]);
          expect(resultOf(activated)).toMatchObject({ state: "active", version: lifecycleVersion + 1 });
        }
      }, withAdmissionQueryCounter(measurement.onQueryCount, {
        preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")],
        environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: credential, ADMISSION_TEST_ZAVU_SENDER_ID: senderId, ADMISSION_TEST_ZAVU_RECIPIENT: leader.fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" },
        onDiagnosticCode: (code) => { receivedCode = code; },
      })));

      const report = measurement.report();
      process.stdout.write(`${JSON.stringify({ phase: "messaging_connection_wizard_queries", report })}\n`);
      if (process.env[VALIDATION.reportEnvironmentVariable]) await writeFile(process.env[VALIDATION.reportEnvironmentVariable]!, JSON.stringify(report, null, 2));
      expect(await database.withContext(leader.fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${leader.tribeId} and is_selected) as selected,(select count(*)::int from public.message_deliveries where tribe_id=${leader.tribeId} and purpose='connection_diagnostic') as diagnostics`)).rows)).toEqual([{ selected: 1, diagnostics: 1 }]);
      expect(findAdmissionBudgetOverruns(measurement.measured, BUDGET)).toEqual([]);
    });
  }, VALIDATION.timeoutMs);
});
