/** @vitest-environment node */
/** Exercises disposable restore ownership and a real copied PostgreSQL checkpoint without provider messages. @module academy-admission-restore-copy-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionRestoreCopy, type AdmissionRestoreAdminRequest } from "./academy-admission-restore-copy";
import { withAcademyAdmissionDatabase } from "./academy-admission-database";
import { ADMISSION_RESTORE_TEST_TIMEOUT_MS } from "./constants/academy-admission-restore-copy";

/** @returns Synthetic metadata only; it cannot authorize real resources without the parent's live private request capability. */
function sourceFixture() {
  return { projectId: "synthetic-project", source: { id: "br-synthetic-source", name: "synthetic-checkpoint", parent_id: "br-synthetic-original", default: false }, databaseName: "synthetic_database", roleName: "synthetic_runtime", nonBypassRoleName: "synthetic_non_bypass" };
}

describe("owned admission restore-copy guards", () => {
  it("should reject a default source before any administrative or SQL operation", async () => {
    // Arrange: only this own request boundary is doubled; no SDK or database library is mocked.
    const request = vi.fn(async () => { throw new Error("Unexpected administrative operation"); });
    const run = vi.fn(async () => undefined);
    // Act and assert: even metadata lookup must stay closed for an original/default source.
    await expect(withAcademyAdmissionRestoreCopy({ ...sourceFixture(), source: { ...sourceFixture().source, default: true }, requestAdmin: request }, run)).rejects.toMatchObject({ code: "restore_copy_setup_failed", cause: { code: "restore_ownership_unproven" } });
    expect(request).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it("should stop before cloning when the previously owned source has become default", async () => {
    // Arrange: the current read supersedes the initial fixture facts.
    const fixture = sourceFixture(), paths: string[] = [];
    const request: AdmissionRestoreAdminRequest = async <Data>(path: string) => { paths.push(path); return { branch: { ...fixture.source, default: true } } as Data; };
    const run = vi.fn(async () => undefined);
    // Act and assert: there is exactly one read and no create/delete or SQL connection.
    await expect(withAcademyAdmissionRestoreCopy({ ...fixture, requestAdmin: request }, run)).rejects.toMatchObject({ code: "restore_copy_setup_failed", cause: { code: "restore_ownership_unproven" } });
    expect(paths).toEqual(["/projects/synthetic-project/branches/br-synthetic-source"]); expect(run).not.toHaveBeenCalled();
  });

  it("should retain both failures and the exact generated identity when creation and reconciliation are uncertain", async () => {
    // Arrange: a lost mutation cannot be retried or guessed from a branch prefix.
    const fixture = sourceFixture(), createError = new TypeError("Synthetic creation response loss"), readError = new TypeError("Synthetic reconciliation response loss");
    let creates = 0, generatedName: string | undefined;
    const request: AdmissionRestoreAdminRequest = async <Data>(path: string, init?: RequestInit) => {
      if (path.endsWith("/branches/br-synthetic-source")) return { branch: fixture.source } as Data;
      if (init?.method === "POST") { creates += 1; generatedName = (JSON.parse(String(init.body)) as { branch: { name: string } }).branch.name; throw createError; }
      throw readError;
    };
    // Act and assert: both actual causes and the exact nonce survive; there is one POST.
    await expect(withAcademyAdmissionRestoreCopy({ ...fixture, requestAdmin: request }, async () => undefined)).rejects.toMatchObject({
      code: "restore_copy_setup_failed", branchName: expect.stringMatching(/^codex-admission-restore-/), parentId: fixture.source.id,
      cause: { code: "restore_copy_creation_unknown", cause: { errors: [createError, readError], cause: createError } },
    });
    expect(creates).toBe(1); expect(generatedName).toMatch(/^codex-admission-restore-/);
  });
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission checkpoint copy", () => {
  it("should revive the isolated parent state and copied non-bypass role when the owned leaf is restored", async () => {
    await withAcademyAdmissionDatabase(async (parent) => {
      // Arrange: this row exists only on the uniquely owned parent; no original branch is written.
      const userId = randomUUID(), actor = { userId, email: null };
      await parent.withContext(actor, (database) => database.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic checkpoint',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`));
      await parent.withRestorableCopy(async (copy) => {
        expect(copy.branch.parentId).toBe(parent.branch.id); expect(copy.branch.id).not.toBe(parent.branch.id); expect(copy.branch.isDefault).toBe(false);
        await copy.withContext(actor, (database) => database.execute(sql`update public."user" set name='Synthetic retired copy' where id=${userId}`));
        const parentState = await parent.withContext(actor, (database) => database.execute<{ name: string }>(sql`select name from public."user" where id=${userId}`));
        expect(parentState.rows).toEqual([{ name: "Synthetic checkpoint" }]);
        // Act: this is an actual Neon reset from the own parent head, after the child pool closes.
        await copy.restoreFromParent();
        // Assert: the old row returned and the actual copied role still has no RLS bypass.
        const restoredState = await copy.withContext(actor, (database) => database.execute<{ name: string }>(sql`select name from public."user" where id=${userId}`));
        expect(restoredState.rows).toEqual([{ name: "Synthetic checkpoint" }]);
        const metadata = await copy.withContext(actor, (database) => database.execute(sql`select current_user as role_name,current_setting('app.current_user_id',true) as actor_id`), "non_bypass");
        expect(metadata.rows).toEqual([{ role_name: parent.nonBypassRole.name, actor_id: userId }]);
      });
    });
  }, ADMISSION_RESTORE_TEST_TIMEOUT_MS);
});
