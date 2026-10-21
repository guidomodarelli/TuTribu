/** @vitest-environment node */
/** Pins on real PostgreSQL the current account projection on a pooled request client and inside a guarded transaction, so its execution can change without changing its result. @module authenticated-account-projection-parity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { createPooledAccountProvider } from "@/src/modules/auth/infrastructure/composition/pooled-account-provider";
import { PostgresAuthenticatedAccountProvider, type CurrentGlobalSessionIdentity } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { createPostgresDatabaseClient, type RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { AUTHENTICATED_ACCOUNT_PROJECTION_PARITY_VALIDATION as VALIDATION } from "@/tests/support/constants/authenticated-account-projection-parity";

/** @param account - Projected account. @returns Its comparable shape, with dates as ISO strings and the evidence reduced to its identifying fields. */
function comparable(account: AuthenticatedAccount | null) {
  if (!account) return null;
  const evidence = account.identityEvidence;
  return { userId: account.userId, normalizedEmail: account.normalizedEmail, session: { id: account.session.id, expiresAt: account.session.expiresAt.toISOString() }, googleAccount: account.googleAccount,
    identityEvidence: evidence ? { id: evidence.id, accountId: evidence.accountId, classification: evidence.classification, version: evidence.version, invalidatedAt: evidence.invalidatedAt } : null };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native authenticated account projection parity", () => {
  it("should project the same account on a pooled request client and inside the actor's guarded transaction", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const userId = leader.fixture.userId, otherUserId = randomUUID(), evidenceId = randomUUID(), secondAccountId = randomUUID();
      const facts = (await database.withContext(leader.fixture.own, (transaction) => transaction.execute<{ subject: string; expires_at: string; email: string }>(sql`select account."accountId" as subject,session."expiresAt" as expires_at,lower(btrim("user".email)) as email from public.account,public.session,public."user" where account.id=${leader.accountId} and session.id=${leader.sessionId} and "user".id=${userId}`))).rows[0];
      await database.withContext(leader.fixture.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic other account',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`));
      const own: CurrentGlobalSessionIdentity = { userId, sessionId: leader.sessionId };
      const change = (statement: ReturnType<typeof sql>) => database.withContext(leader.fixture.own, (transaction) => transaction.execute(statement));

      await database.withServerEnvironment(async (environment) => {
        const pool = createPostgresPool({ connectionString: environment.DATABASE_URL, operation: VALIDATION.poolOperation, maximumConnections: 1 });
        try {
          const client = createPostgresDatabaseClient(pool);
          /** @param identity - Server session identity. @returns The projection on the pooled request path and inside the actor's transaction. */
          const project = async (identity: CurrentGlobalSessionIdentity) => {
            const pooled = await createPooledAccountProvider(async () => identity, async () => client).getAuthenticatedAccount();
            const guarded = await database.withContext(leader.fixture.own, (transaction: RequestDatabase) => new PostgresAuthenticatedAccountProvider(async () => identity, (_identity, run) => run(transaction)).getAuthenticatedAccount());
            return { pooled: comparable(pooled), guarded: comparable(guarded) };
          };
          const same = <Value>(value: Value) => ({ pooled: value, guarded: value });
          const account = (googleAccount: { id: string; subject: string } | null, identityEvidence: object | null = null) => ({ userId, normalizedEmail: facts.email, session: { id: leader.sessionId, expiresAt: new Date(facts.expires_at).toISOString() }, googleAccount, identityEvidence });
          const google = { id: leader.accountId, subject: facts.subject };
          const outcomes: Record<string, unknown> = {};

          outcomes.bound_session = await project(own);
          await change(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${evidenceId},${userId},${leader.accountId},'google',${facts.subject},${facts.email},false,'insufficient','https://accounts.google.com','synthetic-audience',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp())`);
          outcomes.with_evidence = await project(own);
          await change(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${leader.sessionId}`);
          outcomes.invalidated_binding = await project(own);
          await change(sql`delete from public.global_session_identity_bindings where session_id=${leader.sessionId}`);
          outcomes.single_google_account = await project(own);
          await change(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${secondAccountId},${userId},'google',${randomUUID()},clock_timestamp(),clock_timestamp())`);
          outcomes.two_google_accounts = await project(own);
          await change(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 minute' where id=${leader.sessionId}`);
          outcomes.expired_session = await project(own);
          await change(sql`update public.session set "expiresAt"=${facts.expires_at}::timestamptz where id=${leader.sessionId}`);
          outcomes.foreign_session = await project({ userId, sessionId: randomUUID() });
          outcomes.another_account = await project({ userId: otherUserId, sessionId: leader.sessionId });
          // Inside a transaction the projection stays bound to its actor: another actor's, or no actor's, transaction projects nothing.
          outcomes.crossed_transaction_actor = comparable(await database.withContext({ userId: otherUserId, email: null }, (transaction) => new PostgresAuthenticatedAccountProvider(async () => own, (_identity, run) => run(transaction)).getAuthenticatedAccount()));
          outcomes.public_transaction = comparable(await database.withContext({ userId: null, email: null }, (transaction) => new PostgresAuthenticatedAccountProvider(async () => own, (_identity, run) => run(transaction)).getAuthenticatedAccount()));
          // The pooled projection leaves no request identity on its connection.
          await createPooledAccountProvider(async () => own, async () => client).getAuthenticatedAccount();
          outcomes.connection_actor_after = (await pool.query<{ actor: string | null }>("select nullif(current_setting('app.current_user_id', true), '') as actor")).rows[0].actor;

          expect(outcomes).toEqual({
            bound_session: same(account(google)),
            with_evidence: same(account(google, { id: evidenceId, accountId: leader.accountId, classification: "insufficient", version: 1, invalidatedAt: null })),
            invalidated_binding: same(account(null)),
            single_google_account: same(account(google, { id: evidenceId, accountId: leader.accountId, classification: "insufficient", version: 1, invalidatedAt: null })),
            two_google_accounts: same(account(null)),
            expired_session: same(null),
            foreign_session: same(null),
            another_account: same(null),
            crossed_transaction_actor: null,
            public_transaction: null,
            connection_actor_after: null,
          });
        } finally { await pool.end(); }
      });
    });
  }, VALIDATION.timeoutMs);
});
