/** @vitest-environment node */
/** Verifies request settings and transaction isolation against the real owned PostgreSQL target. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { createPostgresDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native request database context", () => {
  it("should expose every setting before application SQL and reset all of them after commit or rollback", async () => {
    await withAcademyAdmissionDatabase(async (database) => database.withServerEnvironment(async (environment) => {
      const pool = createPostgresPool({ connectionString: environment.DATABASE_URL, operation: "native_request_context_validation" });
      pool.options.max = 1;
      const client = createPostgresDatabaseClient(pool), userId = randomUUID(), nextUserId = randomUUID();
      const contextQuery = sql`select current_setting('app.current_user_id',true) as user_id,current_setting('app.current_user_email',true) as email,current_setting('app.mercado_pago_webhook_verified',true) as webhook`;
      const readOutside = async () => (await pool.query<{ user_id: string; email: string; webhook: string }>("select coalesce(current_setting('app.current_user_id',true),'') as user_id,coalesce(current_setting('app.current_user_email',true),'') as email,coalesce(current_setting('app.mercado_pago_webhook_verified',true),'') as webhook")).rows[0];
      try {
        expect(await client.withRequestContext({ userId, email: "context@example.invalid", mercadoPagoWebhookVerified: true }, async (transaction) => (await transaction.execute(contextQuery)).rows[0])).toEqual({ user_id: userId, email: "context@example.invalid", webhook: "true" });
        expect(await readOutside()).toEqual({ user_id: "", email: "", webhook: "" });
        const failure = new Error("Synthetic request-context rollback");
        await expect(client.withRequestContext({ userId: nextUserId, email: null }, async (transaction) => {
          expect((await transaction.execute(contextQuery)).rows[0]).toEqual({ user_id: nextUserId, email: "", webhook: "" });
          throw failure;
        })).rejects.toBe(failure);
        expect(await readOutside()).toEqual({ user_id: "", email: "", webhook: "" });
        expect(await client.withRequestContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(contextQuery)).rows[0])).toEqual({ user_id: "", email: "", webhook: "" });
        expect(await database.withContext({ userId, email: "context@example.invalid", mercadoPagoWebhookVerified: false }, async (transaction) => (await transaction.execute(contextQuery)).rows[0], "non_bypass")).toEqual({ user_id: userId, email: "context@example.invalid", webhook: "" });
        expect(pool.waitingCount).toBe(0); expect(pool.totalCount).toBe(pool.idleCount);
      } finally { await pool.end(); }
    }));
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
