/** @vitest-environment node */
/** Exercises the committed commercial membership review migration, its owner functions, the original ledger and RLS on an owned Neon branch. @module commercial-membership-review-sql-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import { PostgresCommercialMembershipReviewRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-commercial-membership-review-repository";
import { commercialMembershipExpectedState } from "@/src/modules/academy-admissions/domain/entities/commercial-membership-review";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

type MemberRow = { role: string; status: string; status_reason: string; commercial_recovery_status: string | null };

/** @param database - Owned branch. @returns A leader session, a tribe with commercial cases and the real repository over the ledger. */
async function prepareReview(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database);
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID();
  const members = { unknown: randomUUID(), removed: randomUUID(), guardian: randomUUID(), conduct: randomUUID() };
  const memberIds: Record<keyof typeof members, string> = { unknown: "", removed: "", guardian: "", conduct: "" };
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic commercial review',${`commercial-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime() + 3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    for (const userId of Object.values(members)) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic member',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    const insert = async (key: keyof typeof members, role: string, status: string, reason: string, recovery: string | null) => {
      memberIds[key] = (await transaction.execute<{ id: string }>(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason,commercial_recovery_status) values (${tribeId},${members[key]},${role},${status},${reason},${recovery}) returning id`)).rows[0].id;
    };
    await insert("unknown", "tribemate", "blocked", "payment_blocked", null);
    await insert("removed", "tribemate", "removed", "subscription_inactive", null);
    await insert("guardian", "guardian", "blocked", "payment_blocked", "active");
    await insert("conduct", "tribemate", "blocked", "conduct_blocked", null);
  });
  const base = { userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), role: "leader" as const, membershipStatus: "active" as const, resourceId: tribeId };
  const readContext: AuthorizedAdmissionContext = { ...base, action: "read_policy" };
  const writeContext: AuthorizedAdmissionContext = { ...base, action: "configure_policy", sensitiveOperation: "resolve_commercial_membership_review" };
  const execute = <Result>(_context: AuthorizedAdmissionContext, work: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, work);
  const repository = new PostgresCommercialMembershipReviewRepository(execute, async () => fixture.config);
  const row = async (key: keyof typeof members) => database.withContext(fixture.own, async (transaction) => (await transaction.execute<MemberRow>(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where id=${memberIds[key]}`)).rows[0]);
  /** Seeds one more membership in the same tribe, for the crossed commercial pairs the base fixture does not cover. */
  const addMember = async (role: string, status: string, reason: string, recovery: string | null) => database.withContext(fixture.own, async (transaction) => {
    const userId = randomUUID();
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic crossed member',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    return (await transaction.execute<{ id: string }>(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason,commercial_recovery_status) values (${tribeId},${userId},${role},${status},${reason},${recovery}) returning id`)).rows[0].id;
  });
  const memberRow = async (memberId: string) => database.withContext(fixture.own, async (transaction) => (await transaction.execute<MemberRow>(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where id=${memberId}`)).rows[0]);
  /** Real activation preflight inventory over the same leader scope. */
  const preflight = () => database.withContext(fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, readContext, { isPrepared: async () => true }, async () => false).read(readContext));
  return { fixture, tribeId, memberIds, readContext, writeContext, repository, row, addMember, memberRow, preflight };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("commercial membership review SQL owner", () => {
  it("should list cases, record prospective decisions with replay, retire a guardian and a tribemate and unblock the activation inventory", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareReview(database);
      const list = await data.repository.read(data.readContext);
      expect(list).toMatchObject({ pendingCount: 3, resolvedCount: 0 });
      expect(list.cases.map((item) => item.memberId).sort()).toEqual([data.memberIds.unknown, data.memberIds.removed, data.memberIds.guardian].sort());
      expect(list.cases.find((item) => item.memberId === data.memberIds.guardian)).toMatchObject({ role: "guardian", recoveryStatus: "active", displayName: "Synthetic member" });
      const unknown = list.cases.find((item) => item.memberId === data.memberIds.unknown)!;
      const operationId = randomUUID();
      const command = { operationId, confirmed: true as const, memberId: unknown.memberId, decision: "recover_muted" as const, expected: commercialMembershipExpectedState(unknown), reason: "Decisión del piloto" };
      const first = await data.repository.resolve(data.writeContext, command);
      expect(first).toMatchObject({ state: "completed", replayed: false, result: { status: "resolved", resultingRecoveryStatus: "muted", resultingStatus: "blocked" } });
      expect(await data.row("unknown")).toEqual({ role: "tribemate", status: "blocked", status_reason: "payment_blocked", commercial_recovery_status: "muted" });
      const replay = await data.repository.resolve(data.writeContext, command);
      expect(replay).toMatchObject({ state: "completed", replayed: true });
      expect(replay.state === "completed" && first.state === "completed" ? replay.result : null).toEqual(first.state === "completed" ? first.result : null);
      await expect(data.repository.resolve(data.writeContext, { ...command, decision: "recover_active" })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const again = await data.repository.resolve(data.writeContext, { ...command, operationId: randomUUID() });
      expect(again).toMatchObject({ state: "completed", result: { status: "rejected", reason: "membership_changed" } });
      const guardian = list.cases.find((item) => item.memberId === data.memberIds.guardian)!;
      expect(await data.repository.resolve(data.writeContext, { operationId: randomUUID(), confirmed: true, memberId: guardian.memberId, decision: "retire", expected: commercialMembershipExpectedState(guardian), reason: null }))
        .toMatchObject({ state: "completed", result: { status: "resolved", decision: "retire", resultingStatus: "removed", resultingRole: "tribemate" } });
      expect(await data.row("guardian")).toEqual({ role: "tribemate", status: "removed", status_reason: "none", commercial_recovery_status: "active" });
      const removed = list.cases.find((item) => item.memberId === data.memberIds.removed)!;
      // A tribemate can be retired too: an administrative removal that no payment lifts.
      expect(await data.repository.resolve(data.writeContext, { operationId: randomUUID(), confirmed: true, memberId: removed.memberId, decision: "retire", expected: commercialMembershipExpectedState(removed), reason: null }))
        .toMatchObject({ state: "completed", result: { status: "resolved", decision: "retire", resultingStatus: "removed", resultingRole: "tribemate" } });
      expect(await data.memberRow(removed.memberId)).toEqual({ role: "tribemate", status: "removed", status_reason: "none", commercial_recovery_status: null });
      expect(await data.repository.read(data.readContext)).toEqual({ cases: [], pendingCount: 0, resolvedCount: 3 });
      const inventory = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute<{ unknown: number; privileged: number }>(sql`select count(*) filter (where commercial_recovery_status is null)::int as unknown,count(*) filter (where role<>'tribemate')::int as privileged from public.tribe_members where tribe_id=${data.tribeId} and ((status='blocked' and status_reason='payment_blocked') or (status='removed' and status_reason='subscription_inactive'))`)).rows[0]);
      expect(inventory).toEqual({ unknown: 0, privileged: 0 });
      const audit = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute<{ decision: string; basis: string; actor_user_id: string; reason: string | null }>(sql`select decision,basis,actor_user_id,reason from public.tribe_member_commercial_resolutions where tribe_id=${data.tribeId} order by decided_at`)).rows);
      expect(audit).toEqual([
        { decision: "recover_muted", basis: "prospective_leader_decision", actor_user_id: data.fixture.userId, reason: "Decisión del piloto" },
        { decision: "retire", basis: "prospective_leader_decision", actor_user_id: data.fixture.userId, reason: null },
        { decision: "retire", basis: "prospective_leader_decision", actor_user_id: data.fixture.userId, reason: null },
      ]);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should list and resolve crossed commercial pairs exactly as the activation preflight counts them", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareReview(database);
      const crossedTribemate = await data.addMember("tribemate", "removed", "payment_blocked", null);
      const crossedGuardian = await data.addMember("guardian", "blocked", "subscription_inactive", null);
      const crossedKnown = await data.addMember("tribemate", "blocked", "subscription_inactive", "active");
      expect(await data.preflight()).toMatchObject({ unknownCommercialMemberCount: 4, privilegedCommercialMemberCount: 2 });
      const list = await data.repository.read(data.readContext);
      expect(list.pendingCount).toBe(5);
      const listed = list.cases.map((item) => item.memberId);
      expect([...listed].sort()).toEqual([data.memberIds.unknown, data.memberIds.removed, data.memberIds.guardian, crossedTribemate, crossedGuardian].sort());
      expect(listed).not.toContain(data.memberIds.conduct);
      expect(listed).not.toContain(crossedKnown);
      const caseOf = (memberId: string) => list.cases.find((item) => item.memberId === memberId)!;
      expect(caseOf(crossedTribemate)).toMatchObject({ role: "tribemate", status: "removed", statusReason: "payment_blocked", recoveryStatus: null });
      expect(caseOf(crossedGuardian)).toMatchObject({ role: "guardian", status: "blocked", statusReason: "subscription_inactive", recoveryStatus: null });
      const decide = (memberId: string, decision: "recover_active" | "recover_muted" | "retire", expected = commercialMembershipExpectedState(caseOf(memberId))) =>
        data.repository.resolve(data.writeContext, { operationId: randomUUID(), confirmed: true, memberId, decision, expected, reason: null });
      expect(await decide(crossedTribemate, "recover_muted", { ...commercialMembershipExpectedState(caseOf(crossedTribemate)), status: "blocked" })).toMatchObject({ state: "completed", result: { status: "rejected", reason: "membership_changed" } });
      expect(await decide(crossedKnown, "recover_active", { role: "tribemate", status: "blocked", statusReason: "subscription_inactive", recoveryStatus: "active" })).toMatchObject({ state: "completed", result: { status: "rejected", reason: "membership_already_resolved" } });
      expect(await decide(data.memberIds.conduct, "recover_active", { role: "tribemate", status: "blocked", statusReason: "payment_blocked", recoveryStatus: null })).toMatchObject({ state: "completed", result: { status: "rejected", reason: "membership_not_commercial" } });
      expect(await decide(crossedTribemate, "recover_muted")).toMatchObject({ state: "completed", result: { status: "resolved", resultingStatus: "removed", resultingRecoveryStatus: "muted" } });
      expect(await data.memberRow(crossedTribemate)).toEqual({ role: "tribemate", status: "removed", status_reason: "payment_blocked", commercial_recovery_status: "muted" });
      expect(await decide(crossedGuardian, "retire")).toMatchObject({ state: "completed", result: { status: "resolved", decision: "retire", resultingRole: "tribemate", resultingStatus: "removed" } });
      expect(await data.memberRow(crossedGuardian)).toEqual({ role: "tribemate", status: "removed", status_reason: "none", commercial_recovery_status: null });
      for (const memberId of [data.memberIds.unknown, data.memberIds.removed, data.memberIds.guardian]) expect(await decide(memberId, "recover_active")).toMatchObject({ state: "completed", result: { status: "resolved" } });
      expect(await data.row("guardian")).toEqual({ role: "tribemate", status: "blocked", status_reason: "payment_blocked", commercial_recovery_status: "active" });
      expect(await data.repository.read(data.readContext)).toEqual({ cases: [], pendingCount: 0, resolvedCount: 5 });
      expect(await data.preflight()).toMatchObject({ unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 });
      const audit = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute<{ member_id: string; previous_role: string; previous_status: string; previous_status_reason: string }>(sql`select member_id,previous_role,previous_status,previous_status_reason from public.tribe_member_commercial_resolutions where tribe_id=${data.tribeId} and member_id in (${crossedTribemate},${crossedGuardian}) order by decided_at`)).rows);
      expect(audit).toEqual([
        { member_id: crossedTribemate, previous_role: "tribemate", previous_status: "removed", previous_status_reason: "payment_blocked" },
        { member_id: crossedGuardian, previous_role: "guardian", previous_status: "blocked", previous_status_reason: "subscription_inactive" },
      ]);
      await database.grantTablesToNonBypass(["tribe_member_commercial_resolutions", "tribe_members"]);
      const countAudit = (context: { userId: string; email: string }) => database.withContext(context, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_member_commercial_resolutions where tribe_id=${data.tribeId}`)).rows[0].count, "non_bypass");
      expect(await countAudit(data.fixture.own)).toBe(5);
      expect(await countAudit({ userId: randomUUID(), email: "stranger@example.test" })).toBe(0);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should keep the snapshot guard, the append-only audit and RLS for a non-bypass role, and let only one concurrent decision win", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareReview(database);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set commercial_recovery_status='active' where id=${data.memberIds.removed}`));
      expect((await data.row("removed")).commercial_recovery_status).toBeNull();
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where id=${data.memberIds.conduct}`));
      expect(await data.row("conduct")).toEqual({ role: "tribemate", status: "removed", status_reason: "subscription_inactive", commercial_recovery_status: null });
      const list = await data.repository.read(data.readContext);
      const unknown = list.cases.find((item) => item.memberId === data.memberIds.unknown)!;
      const outcomes = await Promise.allSettled([
        data.repository.resolve(data.writeContext, { operationId: randomUUID(), confirmed: true, memberId: unknown.memberId, decision: "recover_active", expected: commercialMembershipExpectedState(unknown), reason: null }),
        data.repository.resolve(data.writeContext, { operationId: randomUUID(), confirmed: true, memberId: unknown.memberId, decision: "recover_muted", expected: commercialMembershipExpectedState(unknown), reason: null }),
      ]);
      const results = outcomes.map((outcome) => outcome.status === "fulfilled" && outcome.value.state === "completed" ? outcome.value.result.status : "unconfirmed");
      expect(results.filter((status) => status === "resolved")).toHaveLength(1);
      expect(results.filter((status) => status === "rejected")).toHaveLength(1);
      await expect(database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_member_commercial_resolutions set reason='x' where tribe_id=${data.tribeId}`))).rejects.toThrow();
      await database.grantTablesToNonBypass(["tribe_member_commercial_resolutions", "tribe_members"]);
      const visible = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_member_commercial_resolutions where tribe_id=${data.tribeId}`)).rows[0].count, "non_bypass");
      expect(visible).toBe(1);
      const stranger = { userId: randomUUID(), email: "stranger@example.test" };
      const hidden = await database.withContext(stranger, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_member_commercial_resolutions where tribe_id=${data.tribeId}`)).rows[0].count, "non_bypass");
      expect(hidden).toBe(0);
      await expect(database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_member_commercial_resolutions(tribe_id,member_id,member_user_id,actor_user_id,operation_id,decision,previous_role,previous_status,previous_status_reason,resulting_role,resulting_status,resulting_status_reason,resulting_recovery_status) values (${data.tribeId},${data.memberIds.removed},${data.fixture.userId},${data.fixture.userId},${randomUUID()},'recover_active','tribemate','removed','subscription_inactive','tribemate','removed','subscription_inactive','active')`), "non_bypass")).rejects.toThrow();
      await expect(data.repository.read({ ...data.readContext, sessionId: randomUUID() })).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
