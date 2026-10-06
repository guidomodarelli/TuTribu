/** @vitest-environment node */
/** Exercises actual current sessions, canonical memberships and scoped resources on disposable PostgreSQL. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { PostgresAdmissionAuthorizationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-authorization-reader";

/** Seeds real synthetic sessions and a preadmission request without granting membership to its applicant. */
async function prepareAuthorization(database: AcademyAdmissionTestDatabase) {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql"]) await database.applyMigration(migration);
  const leaderId = randomUUID(), applicantId = randomUUID(), guardianId = randomUUID(), tribeId = randomUUID(), foreignTribeId = randomUUID(), requestId = randomUUID();
  const sessions = { leader: randomUUID(), applicant: randomUUID(), guardian: randomUUID() };
  await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
    for (const [userId, sessionId] of [[leaderId, sessions.leader], [applicantId, sessions.applicant], [guardianId, sessions.guardian]]) {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic authorization account',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    }
    for (const id of [tribeId, foreignTribeId]) await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${id},'Synthetic authorization tribe',${`authorize-${id}`},${applicantId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${tribeId})`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${requestId},${tribeId},${applicantId},'common','email',${`${applicantId}@example.test`},'declared',clock_timestamp(),clock_timestamp()+interval '7 days')`);
  });
  return { leaderId, applicantId, guardianId, tribeId, foreignTribeId, requestId, sessions };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission current authorization storage", () => {
  it("should resolve canonical leadership instead of the historical creator and retain a nonmember applicant", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, "read_inbox");
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.leaderId)).toEqual({ userId: fixture.leaderId, tribeId: fixture.tribeId, role: "leader", status: "active" });
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toBeNull();
      });
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, "read_own_request");
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toEqual({ userId: fixture.applicantId, tribeId: fixture.tribeId, role: null, status: null });
        expect(await reader.getResource(fixture.tribeId, { kind: "admission_request", id: fixture.requestId })).toEqual({ id: fixture.requestId, tribeId: fixture.tribeId, applicantUserId: fixture.applicantId });
      });
    });
  }, 120_000);

  it("should restrict current reviewer resources to the exact tribe and close after session revocation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, "decide_request");
        expect(await reader.getResource(fixture.tribeId, { kind: "admission_request", id: fixture.requestId })).toMatchObject({ id: fixture.requestId, applicantUserId: fixture.applicantId });
        expect(await reader.getResource(fixture.foreignTribeId, { kind: "admission_request", id: fixture.requestId })).toBeNull();
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.sessions.guardian}`);
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.guardianId)).toBeNull();
        expect(await reader.getResource(fixture.tribeId, { kind: "admission_request", id: fixture.requestId })).toBeNull();
      });
    });
  }, 120_000);

  it("should not disclose another account request or allow a guardian to inspect a leader resource", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => {
        const ownReader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, "read_own_request");
        expect(await ownReader.getResource(fixture.tribeId, { kind: "admission_request", id: fixture.requestId })).toBeNull();
        const leaderReader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, "manage_allowlist");
        expect(await leaderReader.getResource(fixture.tribeId, { kind: "allowlist_entry", id: randomUUID() })).toBeNull();
      });
    });
  }, 120_000);

  it("should retain retired connection metadata for current authorized readers while closing sensitive use", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database), connectionId = randomUUID();
      await database.applyMigration("20261005091500_guard_admission_evidence_transitions.sql");
      await database.applyMigration("20261005092000_create_tenant_messaging.sql");
      await database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,retired_at) values (${connectionId},${fixture.tribeId},${fixture.leaderId},'disconnected','synthetic','synthetic',false,clock_timestamp())`);
        const metadata = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, "read_connection_metadata");
        expect(await metadata.getResource(fixture.tribeId, { kind: "connection", id: connectionId })).toEqual({ id: connectionId, tribeId: fixture.tribeId });
        const sensitive = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, "manage_connection");
        expect(await sensitive.getResource(fixture.tribeId, { kind: "connection", id: connectionId })).toBeNull();
      });
      await database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => {
        const alerts = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, "read_connection_alert");
        expect(await alerts.getResource(fixture.tribeId, { kind: "connection", id: connectionId })).toEqual({ id: connectionId, tribeId: fixture.tribeId });
        expect(await alerts.getResource(fixture.foreignTribeId, { kind: "connection", id: connectionId })).toBeNull();
      });
    });
  }, 120_000);
});
