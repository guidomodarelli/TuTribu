/** Prepares actual own-branch sessions and submissions shared by native review journeys. @module admission-batch-browser-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import type { BrowserContext } from "@playwright/test";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase, type AdmissionReviewHistoryTestIdentity } from "./admission-review-history-database";
import { runPrivateBrowserRequest } from "./private-browser-request";
import type { AdmissionBatchBrowserRow } from "./admission-batch-browser-validation";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { admissionOutcomeSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_BATCH_BROWSER_FIXTURE } from "./constants/admission-batch-browser-fixture";
import { ADMISSION_CONTEXTUAL_REFRESH_VALIDATION } from "./constants/admission-contextual-refresh-validation";

/** @param database - Exact owned ephemeral database. @param security - In-memory generated hosting scope shared with the real server. @param names - Synthetic names visible in the tested explicit selection. @param onPhase - Optional safe progress. @returns Native reviewer scope and accounts without a sender or global verification changes. */
export async function prepareAdmissionBatchBrowserDatabase(database: AcademyAdmissionTestDatabase, security: MessagingSecurityConfig, names: readonly string[], onPhase?: (phase: string) => void) {
  const fixture = await prepareAdmissionReviewHistoryDatabase(database, security, onPhase);
  onPhase?.(ADMISSION_BATCH_BROWSER_FIXTURE.seedStage);
  const applicants = names.map((name) => ({ name, identity: { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: `batch-${randomUUID()}@example.test` } satisfies AdmissionReviewHistoryTestIdentity }));
  await database.withContext(fixture.own, async (transaction) => {
    for (const { name, identity } of applicants) {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${identity.userId},${name},${identity.email},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${identity.sessionId},${identity.userId},${identity.sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    }
  });
  return { ...fixture, applicants };
}

/** @param context - Owned real browser context. @param identity - Already seeded synthetic session. @param origin - Current owned server origin. @param secret - Private real server signing secret kept only in memory. @returns After native Better Auth cookie binding without serializing private call logs. */
export async function bindAdmissionBatchBrowserSession(context: BrowserContext, identity: AdmissionReviewHistoryTestIdentity, origin: string, secret: string): Promise<void> {
  const value = encodeURIComponent(`${identity.sessionToken}.${await makeSignature(identity.sessionToken, secret)}`);
  await runPrivateBrowserRequest("bind_native_batch_cookie", () => context.addCookies([{ name: ADMISSION_BATCH_BROWSER_FIXTURE.sessionCookie, value, url: origin, httpOnly: true, sameSite: "Lax" }]));
}

/** @param context - Separate owned real applicant context. @param fixture - Current native accounts and fixed tribe. @param origin - Own server origin. @param secret - Current private session signing material. @returns Only real confirmed request IDs/names, never session or contact data. */
export async function submitAdmissionBatchBrowserRows(context: BrowserContext, fixture: Awaited<ReturnType<typeof prepareAdmissionBatchBrowserDatabase>>, origin: string, secret: string): Promise<AdmissionBatchBrowserRow[]> {
  const rows: AdmissionBatchBrowserRow[] = [];
  for (const { name, identity } of fixture.applicants) {
    await context.clearCookies();
    await bindAdmissionBatchBrowserSession(context, identity, origin, secret);
    const response = await runPrivateBrowserRequest("submit_native_batch_row", () => context.request.post(`${origin}/api/tribes/${fixture.slug}/admissions/submissions`, { timeout: ADMISSION_CONTEXTUAL_REFRESH_VALIDATION.responseTimeoutMs, headers: { origin }, data: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, message: "Quiero participar." } }));
    if (response.status() !== ADMISSION_BATCH_BROWSER_FIXTURE.createdStatus) throw new Error("Native batch submission did not return a confirmed creation");
    const result = admissionOutcomeSchema.parse(await response.json());
    if (result.outcome !== "pending" || result.request.version !== 1) throw new Error("Native batch submission did not create a version-one pending request");
    rows.push({ requestId: result.request.id, name });
  }
  return rows;
}
