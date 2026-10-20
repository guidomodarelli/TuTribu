/** @vitest-environment node */
/** Measures native pg checkouts, transactions and statements per leader admission page and policy write on the real built server. @module admission-leader-flow-queries-tests */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { withAdmissionNextServer, type AdmissionRequestQueryCount } from "@/tests/support/admission-next-server";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_LEADER_FLOW_QUERY_BUDGET as BUDGET, ADMISSION_LEADER_FLOW_QUERY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-leader-flow-queries";

/** One measured request: its label, the median of its samples and every sample for the evidence report. */
type MeasuredRequest = { label: string; median: Omit<AdmissionRequestQueryCount, "method" | "path" | "status">; samples: AdmissionRequestQueryCount[] };

/** @param samples - Observations of one request label. @param field - Numeric field. @returns Its median, rounding down between the two central samples. */
function median(samples: readonly AdmissionRequestQueryCount[], field: keyof MeasuredRequest["median"]): number {
  const sorted = samples.map((sample) => sample[field]).sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native leader flow query counts", () => {
  it("should keep leader pages and policy writes within their per-request database budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs, securityConfig: await readMessagingHostingSecurityConfig() }), observations: AdmissionRequestQueryCount[] = [];
      const measured: MeasuredRequest[] = [];
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, leader.slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${leader.sessionToken}.${await makeSignature(leader.sessionToken, secret)}`)}`;
        const pages = { inbox: `/${leader.slug}/academia/admissions`, rules: `/${leader.slug}/academia/admissions/settings`, notifications: `/${leader.slug}/academia/admissions/notifications`, usage: `/${leader.slug}/academia/admissions/messaging`, connections: `/${leader.slug}/academia/admissions/messaging/connections` };
        const api = `/api/tribes/${leader.slug}/admissions`;
        /** @param method - HTTP method. @param path - Same-origin path. @param body - JSON command. @returns The consumed response status and JSON or HTML body. */
        const send = async (method: string, path: string, body?: object) => {
          const response = await fetch(`${origin}${path}`, { method, headers: { cookie, origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
          return { status: response.status, text: await response.text() };
        };
        /** @param method - HTTP method. @param path - Observed path. @returns The preload's report for the request just completed. */
        const observe = async (method: string, path: string) => {
          for (let attempt = 0; attempt < VALIDATION.observationPolls; attempt += 1) {
            const index = observations.findIndex((observation) => observation.method === method && observation.path === path);
            if (index >= 0) return observations.splice(index, 1)[0];
            await delay(VALIDATION.observationPollMs);
          }
          throw new Error(`Leader flow query count missing: ${method} ${path.replace(leader.slug, "[slug]")}`);
        };
        /** @param label - Report label. @param method - HTTP method. @param path - Request path. @param bodies - One command per sample; reads repeat without a body. */
        const measure = async (label: string, method: string, path: string, bodies: readonly (object | undefined)[]) => {
          const samples: AdmissionRequestQueryCount[] = [];
          for (const body of bodies) {
            const response = await send(method, path, body);
            expect({ label, status: response.status }).toEqual({ label, status: 200 });
            samples.push({ ...await observe(method, path), path: path.replace(leader.slug, "[slug]") });
          }
          const fields = ["durationMs", "checkouts", "transactions", "commits", "rollbacks", "queries", "statements", "sequentialRoundTrips", "pending"] as const;
          measured.push({ label, samples, median: Object.fromEntries(fields.map((field) => [field, median(samples, field)])) as MeasuredRequest["median"] });
        };
        const reads = Array.from({ length: VALIDATION.samples }, () => undefined);

        // Warm-up compiles routes and fills the pools; none of it is reported.
        for (const path of Object.values(pages)) { await send("GET", path); await observe("GET", path); }
        await measure("initialize_policy", "POST", `${api}/policy`, [{ operationId: randomUUID(), confirmed: true }]);
        const patch = { mode: "manual_review", contactType: "email", isOpen: true, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null };
        await measure("save_policy", "PUT", `${api}/policy`, Array.from({ length: VALIDATION.samples }, (_, index) => ({ ...patch, operationId: randomUUID(), confirmed: true, expectedVersion: index + 1, allowCommonExceptions: index % 2 === 0 })));
        for (const [label, path] of Object.entries(pages)) await measure(`page_${label}`, "GET", path, reads);
        await measure("read_policy", "GET", `${api}/policy`, reads);
        await measure("read_policy_preflight", "GET", `${api}/policy/preflight`, reads);
        await measure("activate_policy", "POST", `${api}/policy/activate`, [{ operationId: randomUUID(), confirmed: true, expectedVersion: VALIDATION.samples + 1 }]);
      }, { preloadModules: [join(process.cwd(), "tests/support/admission-query-counter.mjs")], onQueryCount: (observation) => observations.push(observation) }));

      const report = measured.map(({ label, median: summary, samples }) => ({ label, ...summary, samples: samples.map(({ durationMs, checkouts, transactions, queries, sequentialRoundTrips }) => ({ durationMs, checkouts, transactions, queries, sequentialRoundTrips })) }));
      process.stdout.write(`${JSON.stringify({ phase: "admission_leader_flow_queries", report })}\n`);
      if (process.env[VALIDATION.reportEnvironmentVariable]) await writeFile(process.env[VALIDATION.reportEnvironmentVariable]!, JSON.stringify(report, null, 2));
      expect(await database.withContext(leader.fixture.own, async (transaction) => (await transaction.execute(sql`select admissions_control_activated_at is not null as activated,(select count(*)::int from public.message_deliveries where tribe_id=${leader.tribeId}) as deliveries from public.tribes where id=${leader.tribeId}`)).rows)).toEqual([{ activated: true, deliveries: 0 }]);
      for (const { label, median: summary } of measured) {
        const budget = BUDGET[label as keyof typeof BUDGET];
        expect({ label, transactions: summary.transactions <= budget.transactions, queries: summary.queries <= budget.queries }).toEqual({ label, transactions: true, queries: true });
      }
    });
  }, VALIDATION.timeoutMs);
});
