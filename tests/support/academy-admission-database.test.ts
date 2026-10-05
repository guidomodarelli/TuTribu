/** @vitest-environment node */

/** Runs the SQL harness only after an explicit local opt-in to disposable Neon branches. */
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { withAcademyAdmissionDatabase } from "./academy-admission-database";
import { createAdmissionProviderTransport, withAdmissionProviderTransport } from "./admission-provider-transport";

describe("academy admission database creation recovery", () => {
  it("should preserve both failures and the resource name when creation and reconciliation responses are lost", async () => {
    // Arrange: effects are simulated at the own HTTP boundary, before any SQL.
    const creationError = new TypeError("Controlled creation response loss");
    const reconciliationError = new TypeError("Controlled reconciliation response loss");
    let branchReads = 0;
    let createdName: string | null = null;
    let createRequests = 0;
    const run = vi.fn(async () => undefined);
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://console.neon.tech",
        pathname: "/api/v2/projects/cold-firefly-92947172",
        method: "GET",
        respond: () => Response.json({ project: { id: "cold-firefly-92947172", name: "TuTribu" } }),
      },
      {
        origin: "https://console.neon.tech",
        pathname: "/api/v2/projects/cold-firefly-92947172/branches",
        method: "GET",
        respond: () => {
          branchReads += 1;
          if (branchReads > 1) throw reconciliationError;
          return Response.json({ branches: [{ id: "br-synthetic-parent", name: "production", default: true }] });
        },
      },
      {
        origin: "https://console.neon.tech",
        pathname: "/api/v2/projects/cold-firefly-92947172/branches",
        method: "POST",
        respond: async (request) => {
          createRequests += 1;
          const body = await request.json() as { branch: { name: string } };
          createdName = body.branch.name;
          throw creationError;
        },
      },
    ]);

    // Act: closed global scope prevents even an accidental native network fallback.
    const failure = withAdmissionProviderTransport(transport, () => withAcademyAdmissionDatabase(run, {
      authorization: randomUUID(),
      databaseSelection: { databaseName: "neondb", roleName: "synthetic_runtime" },
      fetch: transport.fetch,
    }));

    // Assert: a possible created branch remains identifiable without another POST.
    await expect(failure).rejects.toMatchObject({
      code: "neon_branch_creation_unknown",
      branchName: expect.stringMatching(/^codex-academy-admissions-/),
      cause: creationError,
      errors: [creationError, reconciliationError],
    });
    expect(createdName).toMatch(/^codex-academy-admissions-/);
    expect(createRequests).toBe(1);
    expect(branchReads).toBe(2);
    expect(run).not.toHaveBeenCalled();
    expect(transport.deniedRequests).toBe(0);
  });
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("academy admission database harness", () => {
  it("should isolate transactions and roles when work runs in its own disposable branch", async () => {
    // Arrange: creation, connection lookup, and cleanup are owned by the harness.
    const evidence = await withAcademyAdmissionDatabase(async (database) => {
      expect(database.branch.isDefault).toBe(false);
      expect(database.branch.id).not.toBe(database.branch.parentId);
      expect(database.branch.name).toMatch(/^codex-academy-admissions-/);
      expect(database.nonBypassRole.bypassesRls).toBe(false);
      expect(database.nonBypassRole.isSuperuser).toBe(false);
      console.info("Academy admission SQL role metadata", { runtime: database.runtimeRole, nonBypass: database.nonBypassRole });

      // Act: query metadata through the same guarded transaction used by writers.
      const runtime = await database.withContext({ userId: "synthetic-applicant-a", email: null }, async (transaction) => {
        const result = await transaction.execute(sql`
          select current_user as role_name,
            current_setting('app.current_user_id', true) as account_id,
            current_setting('idle_in_transaction_session_timeout') as idle_timeout
        `);
        return result.rows[0] as { role_name: string; account_id: string; idle_timeout: string };
      });
      const nonBypass = await database.withContext({ userId: "synthetic-applicant-b", email: null }, async (transaction) => {
        const result = await transaction.execute(sql`
          select current_user as role_name,
            current_setting('app.current_user_id', true) as account_id
        `);
        return result.rows[0] as { role_name: string; account_id: string };
      }, "non_bypass");

      // Assert: SET LOCAL and role selection cannot bleed into the next request.
      expect(runtime.role_name).toBe(database.runtimeRole.name);
      expect(runtime.account_id).toBe("synthetic-applicant-a");
      expect(runtime.idle_timeout).toBe("30s");
      expect(nonBypass.role_name).toBe(database.nonBypassRole.name);
      expect(nonBypass.account_id).toBe("synthetic-applicant-b");
      const nextRequest = await database.withContext({ userId: null, email: null }, async (transaction) => {
        const result = await transaction.execute(sql`select current_user as role_name, current_setting('app.current_user_id', true) as account_id`);
        return result.rows[0] as { role_name: string; account_id: string };
      });
      expect(nextRequest).toEqual({ role_name: database.runtimeRole.name, account_id: "" });
      const rollbackFailure = new Error("Controlled transaction rollback");
      await expect(database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`create table public.admission_validation_rollback_probe (id integer)`);
        throw rollbackFailure;
      })).rejects.toBe(rollbackFailure);
      const rollbackEffect = await database.withContext({ userId: null, email: null }, async (transaction) => {
        const result = await transaction.execute(sql`select to_regclass('public.admission_validation_rollback_probe') as relation`);
        return result.rows[0] as { relation: string | null };
      });
      expect(rollbackEffect.relation).toBeNull();
      return { runtimeBypassesRls: database.runtimeRole.bypassesRls };
    });

    // The helper returns only after the pool is closed and its branch is deleted.
    expect(typeof evidence.runtimeBypassesRls).toBe("boolean");
  }, 120_000);

  it("should reject the workflow and finish cleanup when a callback throws a falsy value", async () => {
    // Arrange and act: unknown thrown values still represent failed work.
    const result = withAcademyAdmissionDatabase(async () => { throw null; });

    // Assert: success is never inferred from the truthiness of an error.
    await expect(result).rejects.toBeNull();
  }, 120_000);
});
