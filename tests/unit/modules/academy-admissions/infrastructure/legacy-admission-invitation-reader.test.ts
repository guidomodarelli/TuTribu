/** @vitest-environment node */
/** Exercises current historical attribution with native sessions and restricted PostgreSQL roles. @module legacy-admission-invitation-reader-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { PostgresLegacyAdmissionInvitationReader } from "@/src/modules/tribes/infrastructure/repositories/postgres-legacy-admission-invitation-reader";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { LEGACY_ADMISSION_PERMISSION_SQLSTATE, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS, LEGACY_ADMISSION_TOKEN_BYTE_LENGTH } from "@/tests/support/constants/legacy-admission-entry";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native historical arrival reader", () => {
  it("should project only an active historical arrival for its actual account and tribe without consuming it", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261011143000_read_locked_legacy_admission_arrival.sql");
      const recipient = await applicant(false), invitationId = randomUUID(), token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at) values (${invitationId},${fixture.tribeId},${createHash("sha256").update(token).digest("hex")},${fixture.userId},${TRIBE_INVITATION_STATUS.active},clock_timestamp())`));
      await database.grantTablesToNonBypass(["tribe_invitations"]);
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect();
          await client.query("begin");
          await client.query("select set_config('role',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_invitation_hash',$3,true)", [database.nonBypassRole.name, recipient.userId, createHash("sha256").update(token).digest("hex")]);
          const plain = await client.query("select id from public.tribe_invitations where id=$1", [invitationId]);
          expect(plain.rows).toEqual([{ id: invitationId }]);
          await client.query("rollback");
        } finally { await client.end(); }
      });
      await database.withContext({ userId: recipient.userId, email: null }, async (transaction) => {
        const reader = new PostgresLegacyAdmissionInvitationReader(transaction);
        const query = { userId: recipient.userId, sessionId: recipient.sessionId, tribeId: fixture.tribeId, token };
        expect(await reader.findActiveByToken(query)).toEqual({ id: invitationId, tribeId: fixture.tribeId });
        expect(await reader.findActiveByToken({ ...query, tribeId: randomUUID() })).toBeNull();
        expect(await reader.findActiveByToken({ ...query, userId: randomUUID() })).toBeNull();
        expect(await reader.findActiveByToken({ ...query, sessionId: randomUUID() })).toBeNull();
        await transaction.execute(sql`savepoint restricted_invitation_edit`);
        let changedRows: unknown[] = [], deniedCode: string | null = null;
        try {
          changedRows = (await transaction.execute(sql`update public.tribe_invitations set status=${TRIBE_INVITATION_STATUS.revoked},revoked_at=clock_timestamp() where id=${invitationId} returning id`)).rows;
        } catch (error) {
          await transaction.execute(sql`rollback to savepoint restricted_invitation_edit`);
          const databaseError = error instanceof Error && "cause" in error ? error.cause : error;
          deniedCode = databaseError && typeof databaseError === "object" && "code" in databaseError ? String(databaseError.code) : "unknown";
        }
        await transaction.execute(sql`release savepoint restricted_invitation_edit`);
        expect(changedRows).toEqual([]);
        if (deniedCode !== null) expect(deniedCode).toBe(LEGACY_ADMISSION_PERMISSION_SQLSTATE);
      }, "non_bypass");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_invitations set status=${TRIBE_INVITATION_STATUS.revoked},revoked_at=clock_timestamp() where id=${invitationId}`));
      await database.withContext({ userId: recipient.userId, email: null }, async (transaction) => {
        expect(await new PostgresLegacyAdmissionInvitationReader(transaction).findActiveByToken({ userId: recipient.userId, sessionId: recipient.sessionId, tribeId: fixture.tribeId, token })).toBeNull();
        expect((await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([]);
      });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
