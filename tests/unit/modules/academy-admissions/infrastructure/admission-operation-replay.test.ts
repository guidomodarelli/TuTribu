/** @vitest-environment node */
/** Exercises real ledger/resource transactions, protected fingerprints and lost-response recovery. */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { createMessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AdmissionBatchItem} from "@/src/modules/academy-admissions/domain/entities/admission-operation";

const resultSchema = z.strictObject({ entryId: z.uuid(), version: z.int().positive(), displayName: z.string() });

/** Seeds a real mutable resource and injects only current permission/key sources owned by the app. */
async function prepareOperation(database: AcademyAdmissionTestDatabase) {
  for (const artifact of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005101000_guard_admission_operation_identity.sql"]) await database.applyMigration(artifact);
  const actorUserId = randomUUID(), tribeId = randomUUID(), entryId = randomUUID();
  const own = { userId: actorUserId, email: null };
  await database.withContext(own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${actorUserId},'Synthetic operation leader',${`${actorUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic operation tribe',${`operation-${tribeId}`},${actorUserId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${actorUserId},'leader','active')`);
    await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,created_by_user_id) values (${entryId},${tribeId},'email',${`${entryId}@example.test`},${randomBytes(32)},${randomUUID()},'Original',${actorUserId})`);
  });
  const purposes = ["credential", "otp_envelope", "verification_mac", "invitation_token", "contact_fingerprint", "operation_payload"] as const;
  const rings = {} as Parameters<typeof createMessagingSecurityConfig>[0]["keyrings"];
  for (const purpose of purposes) { const keyId = randomUUID(); rings[purpose] = { activeKeyId: keyId, keys: [{ id: keyId, material: randomBytes(32) }] }; }
  const config = await createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings: rings });
  const authorize = async (transaction: RequestDatabase) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=${actorUserId} and role='leader' and status='active' for share`)).rows[0]);
  const repository = new PostgresAdmissionOperationRepository((run) => database.withContext(own, run), authorize, async () => config);
  const command = { actorUserId, tribeId, operationType: "update_allowlist_entry", idempotencyKey: randomUUID(), intent: { entryId, expectedVersion: 1, displayName: "Primero" } };
  let effects = 0;
  const work = async (transaction: Parameters<typeof authorize>[0]) => {
    effects += 1;
    const row = (await transaction.execute<{ id: string; version: number; display_name: string }>(sql`update public.academy_allowlist_entries set display_name=${command.intent.displayName},version=version+1 where id=${entryId} and tribe_id=${tribeId} and version=${command.intent.expectedVersion} returning id,version,display_name`)).rows[0];
    if (!row) throw new Error("Synthetic resource CAS failed");
    return { entryId: row.id, version: row.version, displayName: row.display_name };
  };
  return { own, actorUserId, tribeId, entryId, command, config, repository, authorize, work, effectCount: () => effects };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission operation replay", () => {
  it("should commit fifty ordered row outcomes including a current CAS conflict and replay the original batch without another edit",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareOperation(database);
      const ids=[fixture.entryId,...Array.from({length:49},()=>randomUUID())];
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,created_by_user_id) select row_id,${fixture.tribeId},'email',row_id::text||'@example.test',decode('01','hex'),'synthetic-batch','Original',${fixture.actorUserId} from unnest(${sql.param(ids.slice(1))}::uuid[]) row_id`);
        await transaction.execute(sql`update public.academy_allowlist_entries set display_name='Already changed',version=version+1 where id=${fixture.entryId}`);
      });
      const command={...fixture.command,operationType:"update_allowlist_batch",intent:{context:{action:"disable"},items:[...ids].reverse().map((resourceId)=>({resourceId,expectedVersion:1,intent:{status:"disabled"}}))}};
      const schema=z.strictObject({results:z.array(z.strictObject({resourceId:z.uuid(),outcome:z.enum(["updated","conflict"]),version:z.int().positive()})).length(50)});
      const order:string[]=[];
      const work=async(transaction:RequestDatabase,_ledgerId:string,item:AdmissionBatchItem)=>{
        order.push(item.resourceId);
        const current=(await transaction.execute<{version:number}>(sql`select version from public.academy_allowlist_entries where id=${item.resourceId} and tribe_id=${fixture.tribeId} for update`)).rows[0];
        if(current.version!==item.expectedVersion)return{resourceId:item.resourceId,outcome:"conflict",version:current.version};
        const updated=(await transaction.execute<{version:number}>(sql`update public.academy_allowlist_entries set status='disabled',version=version+1 where id=${item.resourceId} and version=${item.expectedVersion} returning version`)).rows[0];
        return{resourceId:item.resourceId,outcome:"updated",version:updated.version};
      };
      const first=await fixture.repository.runBatch(command,schema,work);
      expect(first).toMatchObject({state:"completed",replayed:false});
      if(first.state!=="completed")throw new Error("Synthetic batch did not commit");
      expect(first.result.results.filter((row)=>row.outcome==="updated")).toHaveLength(49);
      expect(first.result.results.filter((row)=>row.outcome==="conflict")).toEqual([{resourceId:fixture.entryId,outcome:"conflict",version:2}]);
      expect(order).toEqual([...ids].sort());
      const replay=await fixture.repository.runBatch({...command,intent:{...command.intent,items:[...command.intent.items].reverse()}},schema,work);
      expect(replay).toEqual({...first,replayed:true});expect(order).toHaveLength(50);
      await expect(fixture.repository.runBatch({...command,intent:{...command.intent,items:command.intent.items.map((item)=>({...item,expectedVersion:2}))}},schema,work)).rejects.toMatchObject({code:"idempotency_conflict"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,count(*)::integer as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId} group by status order by status`)).rows)).toEqual([{status:"disabled",count:49},{status:"enabled",count:1}]);
    });
  },180_000);

  it("should rollback every row after an unexpected batch failure and reject oversized or duplicate selections before claiming",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareOperation(database),secondId=randomUUID();
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id) values (${secondId},${fixture.tribeId},'email',${`${secondId}@example.test`},decode('01','hex'),'synthetic-batch')`));
      const command={...fixture.command,operationType:"update_allowlist_batch",intent:{context:{action:"disable"},items:[fixture.entryId,secondId].map((resourceId)=>({resourceId,expectedVersion:1,intent:{status:"disabled"}}))}};
      const schema=z.strictObject({results:z.array(z.unknown())});let calls=0;
      await expect(fixture.repository.runBatch(command,schema,async(transaction,_ledgerId,item)=>{
        calls+=1;await transaction.execute(sql`update public.academy_allowlist_entries set status='disabled',version=version+1 where id=${item.resourceId}`);
        if(calls===2)throw new Error("Synthetic second-row persistence failure");return{resourceId:item.resourceId};
      })).rejects.toMatchObject({code:"operation_unresolved",cause:{message:"Synthetic second-row persistence failure"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,version,count(*)::integer as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId} group by status,version`)).rows)).toEqual([{status:"enabled",version:1,count:2}]);
      expect(await fixture.repository.readBatch(command,schema)).toMatchObject({state:"started"});
      for(const items of [[],Array.from({length:51},()=>({resourceId:randomUUID(),expectedVersion:1,intent:null})),[command.intent.items[0],{...command.intent.items[0],resourceId:command.intent.items[0].resourceId.toUpperCase()}]]){
        await expect(fixture.repository.runBatch({...command,idempotencyKey:randomUUID(),intent:{...command.intent,items}},schema,async()=>{throw new Error("Invalid selection reached work");})).rejects.toMatchObject({code:"invalid_input"});
      }
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows)).toEqual([{count:1}]);
    });
  },180_000);

  it("should recover the original committed result before checking an obsolete resource version", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      expect(await fixture.repository.read(fixture.command, resultSchema)).toBeNull();
      const first = await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      expect(first).toMatchObject({ state: "completed", replayed: false, result: { version: 2, displayName: "Primero" } });
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.academy_allowlist_entries set display_name='Posterior',version=version+1 where id=${fixture.entryId}`));
      const replay = await fixture.repository.run({ ...fixture.command, intent: { displayName: "Primero", expectedVersion: 1, entryId: fixture.entryId } }, resultSchema, fixture.work);
      expect(replay).toMatchObject({ state: "completed", replayed: true, result: { version: 2, displayName: "Primero" } });
      expect(fixture.effectCount()).toBe(1);
      expect(await fixture.repository.read(fixture.command, resultSchema)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,display_name from public.academy_allowlist_entries where id=${fixture.entryId}`)).rows[0])).toEqual({ version: 3, display_name: "Posterior" });
    });
  }, 120_000);

  it("should reject changed expectedVersion or intent under the same key without another effect", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      await expect(fixture.repository.run({ ...fixture.command, intent: { ...fixture.command.intent, expectedVersion: 2 } }, resultSchema, fixture.work)).rejects.toMatchObject({ code: "idempotency_conflict" });
      await expect(fixture.repository.run({ ...fixture.command, intent: { ...fixture.command.intent, displayName: "Otro" } }, resultSchema, fixture.work)).rejects.toMatchObject({ code: "idempotency_conflict" });
      expect(fixture.effectCount()).toBe(1);
    });
  }, 120_000);

  it("should preserve a durable claim and rollback the effect when its own result is not public", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await expect(fixture.repository.run(fixture.command, resultSchema, async (transaction) => ({ ...await fixture.work(transaction), invitationUrl: "private-once-only-value" }))).rejects.toMatchObject({ code: "public_contract_unusable" });
      const state = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select operation.state,operation.public_result,entry.version from public.academy_admission_operations operation cross join public.academy_allowlist_entries entry where operation.idempotency_key=${fixture.command.idempotencyKey} and entry.id=${fixture.entryId}`)).rows[0]);
      expect(state).toEqual({ state: "started", public_result: null, version: 1 });
    });
  }, 120_000);

  it("should deny replay after current leadership is lost", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.actorUserId}`));
      await expect(fixture.repository.run(fixture.command, resultSchema, fixture.work)).rejects.toMatchObject({ code: "permission_denied" });
      expect(fixture.effectCount()).toBe(1);
    });
  }, 120_000);

  it("should isolate replay by current actor, tribe and operation type", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      expect(await fixture.repository.read({ ...fixture.command, operationType: "rename_personal_invitation" }, resultSchema)).toBeNull();
      await expect(fixture.repository.read({ ...fixture.command, actorUserId: randomUUID() }, resultSchema)).rejects.toMatchObject({ code: "permission_denied" });
      const foreign = { ...fixture.command, tribeId: randomUUID() };
      const scoped = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction, command) => command.tribeId === fixture.tribeId && await fixture.authorize(transaction), async () => fixture.config);
      await expect(scoped.read(foreign, resultSchema)).rejects.toMatchObject({ code: "permission_denied" });
      expect(fixture.effectCount()).toBe(1);
    });
  }, 120_000);

  it("should keep operation identity and a completed public snapshot immutable", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.academy_admission_operations set fingerprint_key_id=${randomUUID()} where idempotency_key=${fixture.command.idempotencyKey}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.academy_admission_operations set public_result='{}' where idempotency_key=${fixture.command.idempotencyKey}`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 120_000);

  it("should allow at most one resource effect for concurrent matching claims", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      const results = await Promise.all([fixture.repository.run(fixture.command, resultSchema, fixture.work), fixture.repository.run(fixture.command, resultSchema, fixture.work)]);
      expect(results.some((result) => result.state === "completed")).toBe(true);
      expect(fixture.effectCount()).toBe(1);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_operations where idempotency_key=${fixture.command.idempotencyKey}`)).rows[0].count)).toBe(1);
    });
  }, 120_000);

  it("should reconcile a committed response loss without repeating the business effect", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      let transactions = 0;
      const repository = new PostgresAdmissionOperationRepository(async (run) => {
        transactions += 1;
        const result = await database.withContext(fixture.own, run);
        if (transactions === 2) throw new Error("Synthetic response lost after COMMIT");
        return result;
      }, fixture.authorize, async () => fixture.config);
      await expect(repository.run(fixture.command, resultSchema, fixture.work)).rejects.toMatchObject({ code: "operation_unresolved", operationId: fixture.command.idempotencyKey });
      const replay = await repository.run(fixture.command, resultSchema, fixture.work);
      expect(replay).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(fixture.effectCount()).toBe(1);
    });
  }, 120_000);

  it("should reconcile a lost claim response before invoking any business mutation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      let transactions = 0;
      const repository = new PostgresAdmissionOperationRepository(async (run) => {
        transactions += 1;
        const result = await database.withContext(fixture.own, run);
        if (transactions === 1) throw new Error("Synthetic claim response lost after COMMIT");
        return result;
      }, fixture.authorize, async () => fixture.config);
      expect(await repository.run(fixture.command, resultSchema, fixture.work)).toEqual({ state: "started", operationId: fixture.command.idempotencyKey });
      expect(fixture.effectCount()).toBe(0);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version from public.academy_allowlist_entries where id=${fixture.entryId}`)).rows[0].version)).toBe(1);
    });
  }, 120_000);

  it("should retain a current unfinished claim until its lease expires and then recover once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      await expect(fixture.repository.run(fixture.command, resultSchema, async () => { throw new Error("Synthetic crash before the mutation"); })).rejects.toMatchObject({ code: "operation_unresolved" });
      expect(await fixture.repository.run(fixture.command, resultSchema, fixture.work)).toEqual({ state: "started", operationId: fixture.command.idempotencyKey });
      expect(fixture.effectCount()).toBe(0);
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where idempotency_key=${fixture.command.idempotencyKey}`));
      expect(await fixture.repository.run(fixture.command, resultSchema, fixture.work)).toMatchObject({ state: "completed", replayed: false, result: { version: 2 } });
      expect(fixture.effectCount()).toBe(1);
    });
  }, 120_000);

  it.each([
    { phase: "claim", expireOnConfigRead: 1, completedBefore: false },
    { phase: "business start", expireOnConfigRead: 2, completedBefore: false },
    { phase: "business completion", expireOnConfigRead: 3, completedBefore: false },
    { phase: "replay", expireOnConfigRead: 1, completedBefore: true },
  ])("should revalidate temporal permission after crypto before $phase", async ({ expireOnConfigRead, completedBefore }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOperation(database);
      if (completedBefore) await fixture.repository.run(fixture.command, resultSchema, fixture.work);
      let permissionUntil = new Date(Date.now() + 3_600_000);
      let configReads = 0;
      const repository = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction) => {
        const roleAllowed = await fixture.authorize(transaction);
        const timeAllowed = (await transaction.execute<{ allowed: boolean }>(sql`select clock_timestamp()<${permissionUntil}::timestamptz as allowed`)).rows[0].allowed;
        return roleAllowed && timeAllowed;
      }, async () => { configReads += 1; if (configReads === expireOnConfigRead) permissionUntil = new Date(0); return fixture.config; });
      if (completedBefore) await expect(repository.read(fixture.command, resultSchema)).rejects.toMatchObject({ code: "permission_denied" });
      else await expect(repository.run(fixture.command, resultSchema, fixture.work)).rejects.toMatchObject({ code: "permission_denied" });
      const resource = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version from public.academy_allowlist_entries where id=${fixture.entryId}`)).rows[0].version);
      expect(resource).toBe(completedBefore ? 2 : 1);
    });
  }, 120_000);
});
