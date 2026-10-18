/** @vitest-environment node */
/** Exercises actual current sessions, canonical memberships and scoped resources on disposable PostgreSQL. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { PostgresAdmissionAuthorizationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-authorization-reader";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_AUTHORIZATION_TEST } from "@/tests/support/constants/admission-authorization";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";

/** Seeds real synthetic sessions and a preadmission request without granting membership to its applicant. */
async function prepareAuthorization(database: AcademyAdmissionTestDatabase) {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql"]) await database.applyMigration(migration);
  for (const migration of ["20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005093000_guard_academy_membership_sources.sql", "20261007005000_read_admission_reviews.sql"]) await database.applyMigration(migration);
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

/** Grants only the original invoker account-read/row-lock capability on this disposable branch. */
async function grantAccountFenceAccess(database: AcademyAdmissionTestDatabase): Promise<void> {
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await transaction.execute(sql`grant select(id),update(id) on public."user" to ${sql.identifier(database.nonBypassRole.name)}`);
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native actor guard before scope locks", () => {
  it("should reject a missing or mismatched SQL actor without touching a locked tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await grantAccountFenceAccess(database);
      await database.withContext({ userId: fixture.leaderId, email: null }, async (holder) => {
        await holder.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        for (const userId of [fixture.applicantId, null]) await database.withContext({ userId, email: null }, async (transaction) => {
          await transaction.execute(sql`select set_config(${ADMISSION_AUTHORIZATION_TEST.statementTimeoutSetting},${String(ADMISSION_AUTHORIZATION_TEST.mismatchStatementTimeoutMs)},true)`);
          const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
          expect(await reader.getCurrentActor(fixture.tribeId, fixture.leaderId)).toBeNull();
          expect(await reader.getCurrentActorWithLockedAccount(fixture.tribeId, fixture.leaderId)).toBeNull();
        }, "non_bypass");
      });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("account-locked admission authority", () => {
  it("should preserve account privileges, retain the SHARE lock and reject a session that expires during an account wait", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      const originalDenied = await database.withContext({ userId: fixture.applicantId, email: null }, (transaction) => transaction.execute(sql`select id from public."user" where id=${fixture.applicantId} for share`), "non_bypass").then(() => [], (error: unknown) => readPostgresTestDiagnostics(error).sqlStates);
      const projectionDenied = await database.withContext({ userId: fixture.applicantId, email: null }, (transaction) => new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest).getCurrentActorWithLockedAccount(fixture.tribeId, fixture.applicantId), "non_bypass").then(() => [], (error: unknown) => readPostgresTestDiagnostics(error).sqlStates);
      expect(originalDenied).toEqual([ADMISSION_AUTHORIZATION_TEST.insufficientPrivilegeSqlState]);
      expect(projectionDenied).toEqual(originalDenied);
      await grantAccountFenceAccess(database);
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        expect(await reader.getCurrentActorWithLockedAccount(fixture.tribeId, fixture.applicantId)).toEqual({ userId: fixture.applicantId, tribeId: fixture.tribeId, role: null, status: null });
      }, "non_bypass");
      const changedName = randomUUID();
      const changed = await withAdmissionTransitionContention(database, { userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        expect(await reader.getCurrentActorWithLockedAccount(fixture.tribeId, fixture.applicantId)).toEqual({ userId: fixture.applicantId, tribeId: fixture.tribeId, role: null, status: null });
      }, () => database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        return (await transaction.execute<{ name: string }>(sql`update public."user" set name=${changedName} where id=${fixture.applicantId} returning name`)).rows[0].name;
      }));
      expect(changed).toEqual({ status: "fulfilled", value: changedName });

      await database.withContext({ userId: fixture.applicantId, email: null }, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${ADMISSION_AUTHORIZATION_TEST.sessionExpiryDelaySeconds}*interval '1 second' where id=${fixture.sessions.applicant}`));
      const expired = await withAdmissionTransitionContention(database, { userId: fixture.applicantId, email: null }, async (transaction) => {
        await transaction.execute(sql`select id from public."user" where id=${fixture.applicantId} for update`);
      }, () => database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        return reader.getCurrentActorWithLockedAccount(fixture.tribeId, fixture.applicantId);
      }, "non_bypass"), () => database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const session = (await transaction.execute<{ live: boolean }>(sql`select "expiresAt">clock_timestamp() as live from public.session where id=${fixture.sessions.applicant}`)).rows[0];
        expect(session.live).toBe(true);
        await transaction.execute(sql`select pg_sleep(greatest(extract(epoch from "expiresAt"-clock_timestamp()),0)+${ADMISSION_AUTHORIZATION_TEST.sessionExpiryGraceSeconds}) from public.session where id=${fixture.sessions.applicant}`);
      }));
      expect(expired).toEqual({ status: "fulfilled", value: null });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);

  it("should observe a membership committed while the current account lock waits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await grantAccountFenceAccess(database);
      const result = await withAdmissionTransitionContention(database, { userId: fixture.applicantId, email: null }, async (transaction) => {
        // Non-key UPDATE blocks SHARE while remaining compatible with the membership FK's KEY SHARE.
        await transaction.execute(sql`update public."user" set name=name where id=${fixture.applicantId}`);
      }, () => database.withContext({ userId: fixture.applicantId, email: null }, (transaction) => new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest).getCurrentActorWithLockedAccount(fixture.tribeId, fixture.applicantId), "non_bypass"), () => database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.applicantId},${TRIBE_MEMBER_ROLE.guardian},${TRIBE_MEMBERSHIP_STATUS.active})`);
      }));
      expect(result).toEqual({ status: "fulfilled", value: { userId: fixture.applicantId, tribeId: fixture.tribeId, role: TRIBE_MEMBER_ROLE.guardian, status: TRIBE_MEMBERSHIP_STATUS.active } });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission current authorization storage", () => {
  it("should resolve canonical leadership instead of the historical creator and retain a nonmember applicant", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, "read_inbox");
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.leaderId)).toEqual({ userId: fixture.leaderId, tribeId: fixture.tribeId, role: "leader", status: "active" });
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toBeNull();
        const commandReader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, ADMISSION_ACTION.manageAllowlist);
        expect(await commandReader.getCurrentActor(fixture.tribeId, fixture.leaderId)).toEqual({ userId: fixture.leaderId, tribeId: fixture.tribeId, role: TRIBE_MEMBER_ROLE.leader, status: TRIBE_MEMBERSHIP_STATUS.active });
      });
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, "read_own_request");
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toEqual({ userId: fixture.applicantId, tribeId: fixture.tribeId, role: null, status: null });
        expect(await reader.getResource(fixture.tribeId, { kind: "admission_request", id: fixture.requestId })).toEqual({ id: fixture.requestId, tribeId: fixture.tribeId, applicantUserId: fixture.applicantId });
      });
      expect(database.nonBypassRole).toMatchObject({ bypassesRls: false, isSuperuser: false });
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toEqual({ userId: fixture.applicantId, tribeId: fixture.tribeId, role: null, status: null });
        expect(await reader.getCurrentActor(randomUUID(), fixture.applicantId)).toBeNull();
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.leaderId)).toBeNull();
        const foreignSession = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.leader, ADMISSION_ACTION.readOwnRequest);
        expect(await foreignSession.getCurrentActor(fixture.tribeId, fixture.applicantId)).toBeNull();
        const missingSession = new PostgresAdmissionAuthorizationReader(transaction, randomUUID(), ADMISSION_ACTION.readOwnRequest);
        expect(await missingSession.getCurrentActor(fixture.tribeId, fixture.applicantId)).toBeNull();
      }, "non_bypass");
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        expect(await reader.getCurrentActor(fixture.tribeId, fixture.applicantId)).toBeNull();
      }, "non_bypass");
    });
  }, 120_000);

  it("should observe a membership inserted after the actor query begins waiting on the tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      const result = await withAdmissionTransitionContention(database, { userId: fixture.leaderId, email: null }, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.applicantId},${TRIBE_MEMBER_ROLE.guardian},${TRIBE_MEMBERSHIP_STATUS.active})`);
      }, () => database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.applicant, ADMISSION_ACTION.readOwnRequest);
        return reader.getCurrentActor(fixture.tribeId, fixture.applicantId);
      }, "non_bypass"));
      expect(result).toEqual({ status: "fulfilled", value: { userId: fixture.applicantId, tribeId: fixture.tribeId, role: TRIBE_MEMBER_ROLE.guardian, status: TRIBE_MEMBERSHIP_STATUS.active } });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);

  it("should return the current role and status after waiting on a changed membership", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      const result = await withAdmissionTransitionContention(database, { userId: fixture.leaderId, email: null }, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role=${TRIBE_MEMBER_ROLE.tribemate},status=${TRIBE_MEMBERSHIP_STATUS.blocked} where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`);
      }, () => database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, ADMISSION_ACTION.readConnectionAlert);
        return reader.getCurrentActor(fixture.tribeId, fixture.guardianId);
      }, "non_bypass"));
      expect(result).toEqual({ status: "fulfilled", value: { userId: fixture.guardianId, tribeId: fixture.tribeId, role: TRIBE_MEMBER_ROLE.tribemate, status: TRIBE_MEMBERSHIP_STATUS.blocked } });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);

  it("should reject a session that expires while waiting for the membership lock", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAuthorization(database);
      await database.withContext({ userId: fixture.guardianId, email: null }, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${ADMISSION_AUTHORIZATION_TEST.sessionExpiryDelaySeconds}*interval '1 second' where id=${fixture.sessions.guardian}`));
      const result = await withAdmissionTransitionContention(database, { userId: fixture.leaderId, email: null }, async (transaction) => {
        await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId} for update`);
      }, () => database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => {
        const reader = new PostgresAdmissionAuthorizationReader(transaction, fixture.sessions.guardian, ADMISSION_ACTION.readConnectionAlert);
        return reader.getCurrentActor(fixture.tribeId, fixture.guardianId);
      }, "non_bypass"), () => database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => {
        const session = (await transaction.execute<{ live: boolean }>(sql`select "expiresAt">clock_timestamp() as live from public.session where id=${fixture.sessions.guardian}`)).rows[0];
        expect(session.live).toBe(true);
        await transaction.execute(sql`select pg_sleep(greatest(extract(epoch from "expiresAt"-clock_timestamp()),0)+${ADMISSION_AUTHORIZATION_TEST.sessionExpiryGraceSeconds}) from public.session where id=${fixture.sessions.guardian}`);
      }));
      expect(result).toEqual({ status: "fulfilled", value: null });
    }, { concurrentTransactions: ADMISSION_AUTHORIZATION_TEST.concurrentTransactions });
  }, ADMISSION_AUTHORIZATION_TEST.timeoutMs);

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
