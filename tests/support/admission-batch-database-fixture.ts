/** Seeds actual pending requests and composes their DB-only decision owner. @module admission-batch-database-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistManagement } from "./allowlist-management-database-fixture";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/**
 * Creates a current manual academy with no provider capability or external transport.
 * @param database - Verified disposable branch with native PostgreSQL and current migrations.
 * @param beforeActivation - Optional genuine existing actors seeded before admission cutover, without bypassing its guards.
 * @param options - Optional synthetic host security shared privately with an actual local Next process.
 * @returns The concrete writer, real human scope and a helper that submits each pending request normally.
 */
export async function prepareAdmissionBatch(database: AcademyAdmissionTestDatabase, beforeActivation?: (scope: { tribeId: string; leaderUserId: string }) => Promise<void>, options: { securityConfig?: MessagingSecurityConfig } = {}) {
  const fixture = await prepareAllowlistManagement(database, options.securityConfig);
  if (beforeActivation) await beforeActivation({ tribeId: fixture.tribeId, leaderUserId: fixture.userId });
  await database.withContext(fixture.own, async (transaction) => {
    const instant = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`update public.academy_admission_policies set is_open=true,activated_at=${instant},version=version+1 where tribe_id=${fixture.tribeId}`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
  });
  let loseCommittedReply = false;
  const writer = new PostgresAdmissionRequestRepository(async (scope, run) => {
    const result = await database.withContext({ userId: scope.userId, email: null }, run);
    if (loseCommittedReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") {
      loseCommittedReply = false;
      throw new Error("Controlled admission batch COMMIT reply loss");
    }
    return result;
  }, async () => fixture.config, (transaction) => ({
    memberships: createAcademyApprovedMembershipWriter(transaction),
    notifications: createPostgresAdmissionNotificationObligationWriter(transaction),
  }));

  /** @returns A real submitted pending request and its actual applicant, without community membership. */
  async function submitPending() {
    const applicantId = randomUUID(), sessionId = randomUUID(), email = `${applicantId}@example.test`;
    await database.withContext(fixture.own, async (transaction) => {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic batch applicant',${email},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${applicantId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    });
    const submitted = await writer.submit({
      tribeId: fixture.tribeId, userId: applicantId, sessionId, requestId: randomUUID(), operationId: randomUUID(),
      type: "submit_admission", confirmed: true, expectedPolicyVersion: 2, source: { kind: "common" },
      contact: { type: "email", value: email }, proofId: null, message: null,
    });
    if (submitted.state !== "completed" || submitted.result.outcome !== "pending" || !submitted.result.admissionRequestId) throw new Error("AdmissionBatchFixture.submitPending failed: pending_request_not_created");
    return { applicantId, sessionId, admissionRequestId: submitted.result.admissionRequestId, expectedVersion: submitted.result.committedRequestVersion! };
  }

  /** @param count - Number of independent current pending fixtures. @param existingApplicantIds - Optional native actors whose existing accounts must be retained. @returns Valid persisted requests seeded together for the fifty-row boundary without unrelated submission load. */
  async function seedPendingSelection(count: number, existingApplicantIds: readonly string[] = []) {
    const pending = Array.from({ length: count }, (_unusedValue, index) => ({ applicantId: existingApplicantIds[index] ?? randomUUID(), admissionRequestId: randomUUID(), expectedVersion: 1 }));
    await database.withContext(fixture.own, async (transaction) => {
      const accounts = pending.filter((request) => !existingApplicantIds.includes(request.applicantId)).map((request) => sql`(${request.applicantId},'Synthetic batch boundary account',${`${request.applicantId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
      if (accounts.length > 0) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values ${sql.join(accounts, sql`,`)}`);
      const snapshot = JSON.stringify({ version: 2, verificationEpoch: 1, mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false });
      const requests = pending.map((request) => sql`(${request.admissionRequestId},${fixture.tribeId},${request.applicantId},'common','none',${snapshot}::jsonb,clock_timestamp()+interval '30 days')`);
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,expires_at) values ${sql.join(requests, sql`,`)}`);
    });
    return pending;
  }

  return {
    ...fixture, writer, submitPending, seedPendingSelection,
    scope: { tribeId: fixture.tribeId, userId: fixture.userId, sessionId: fixture.sessionId, requestId: randomUUID() },
    loseNextCommittedReply: () => { loseCommittedReply = true; },
  };
}
