// @vitest-environment node
/** Exercises the free academy entry of inactive commercial memberships against an explicitly isolated Postgres branch. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { runWithGuardedTransaction, type RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresProductAccessRepository } from "@/src/modules/product-access/infrastructure/repositories/postgres-product-access-repository";
import { PostgresTribeAcademyAdmissionRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository";

const validationDatabaseUrl = process.env.ACADEMY_VALIDATION_DATABASE_URL;
const validationDatabaseHost = process.env.ACADEMY_VALIDATION_DATABASE_HOST;

describe.skipIf(!validationDatabaseUrl)("academy free join of an inactive commercial membership", () => {
  let pool: ReturnType<typeof createPostgresPool>;
  let tribeId: string;
  let memberId: string;
  let leaderId: string;
  let tribeSlug: string;

  beforeAll(() => {
    if (!validationDatabaseHost || new URL(validationDatabaseUrl!).hostname !== validationDatabaseHost ||
      process.env.ACADEMY_VALIDATION_IS_EPHEMERAL !== "true") {
      throw new Error("Academy integration tests require an explicitly provisioned ephemeral database host.");
    }
    pool = createPostgresPool({ connectionString: validationDatabaseUrl!, operation: "academy-free-join-validation" });
  });

  beforeEach(async () => {
    tribeId = randomUUID();
    memberId = `join-member-${randomUUID()}`;
    leaderId = `join-leader-${randomUUID()}`;
    tribeSlug = `join-${randomUUID()}`;
    await pool.query('insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now()),($4,$5,$6,true,now(),now())',
      [memberId, "Integrante ficticio", `${memberId}@example.com`, leaderId, "Líder ficticio", `${leaderId}@example.com`]);
    await pool.query("insert into public.tribes(id,name,slug,created_by) values($1,$2,$3,$4)", [tribeId, "Tribu ficticia", tribeSlug, leaderId]);
    await pool.query("insert into public.tribe_members(tribe_id,user_id,role,status) values($1,$2,'leader','active')", [tribeId, leaderId]);
    await pool.query("insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled,sales_enabled) values($1,'academy',true,false)", [tribeId]);
  });

  afterEach(async () => {
    await pool.query("delete from public.tribes where id=$1", [tribeId]);
    await pool.query('delete from public."user" where id=any($1)', [[memberId, leaderId]]);
  });

  afterAll(async () => {
    // beforeAll may fail before assigning the pool.
    await (pool as typeof pool | undefined)?.end();
  });

  /** Runs a repository with a member-scoped transaction, as the runtime role does. */
  function memberExecutor() {
    return <Result>(work: (database: RequestDatabase) => Promise<Result>) =>
      runWithGuardedTransaction(pool, work, async (database) => {
        await database.execute(sql`select set_config('app.current_user_id', ${memberId}, true)`);
      });
  }

  /** Seeds a readable membership and then leaves it in a commercial state, as a subscription does. */
  async function seedCommercialMembership(input: { role: string; readableStatus: string; status: string; statusReason: string }) {
    await pool.query("insert into public.tribe_members(tribe_id,user_id,role,status) values($1,$2,$3,$4)", [tribeId, memberId, input.role, input.readableStatus]);
    await pool.query("update public.tribe_members set status=$3,status_reason=$4 where tribe_id=$1 and user_id=$2", [tribeId, memberId, input.status, input.statusReason]);
  }

  async function readMembership() {
    const result = await pool.query("select role,status,status_reason from public.tribe_members where tribe_id=$1 and user_id=$2", [tribeId, memberId]);
    return result.rows[0];
  }

  it("should offer and apply the free entry to a muted guardian blocked by payment, as a muted tribemate", async () => {
    await seedCommercialMembership({ readableStatus: "muted", role: "guardian", status: "blocked", statusReason: "payment_blocked" });

    const snapshot = await new PostgresProductAccessRepository(memberExecutor()).readOwnAccessSnapshot({ tribeSlug });
    expect(snapshot).toMatchObject({
      admissionControlActive: false,
      membership: { role: "guardian", status: "blocked" },
      membershipDetail: { commercialRecoveryStatus: "muted", statusReason: "payment_blocked" },
    });

    expect(await new PostgresTribeAcademyAdmissionRepository(memberExecutor()).join({ tribeSlug })).toEqual({ status: "joined" });
    expect(await readMembership()).toEqual({ role: "tribemate", status: "muted", status_reason: "none" });
  });

  it("should recover a tribemate removed when the subscription ended as an active tribemate", async () => {
    await seedCommercialMembership({ readableStatus: "active", role: "tribemate", status: "removed", statusReason: "subscription_inactive" });

    expect(await new PostgresTribeAcademyAdmissionRepository(memberExecutor()).join({ tribeSlug })).toEqual({ status: "joined" });
    expect(await readMembership()).toEqual({ role: "tribemate", status: "active", status_reason: "none" });
  });

  it("should keep a conduct block closed", async () => {
    await seedCommercialMembership({ readableStatus: "active", role: "tribemate", status: "blocked", statusReason: "conduct_blocked" });

    expect(await new PostgresTribeAcademyAdmissionRepository(memberExecutor()).join({ tribeSlug })).toEqual({ status: "blocked" });
    expect(await readMembership()).toEqual({ role: "tribemate", status: "blocked", status_reason: "conduct_blocked" });
  });
});
