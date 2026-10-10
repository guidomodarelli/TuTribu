/** Commits claims separately, then business effects and minimal public results in one guarded transaction. */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AdmissionBatchItem,AdmissionBatchOperationCommand} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_LEASE_MS } from "@/src/modules/academy-admissions/constants/admission-operation";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createAdmissionOperationFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-operation-fingerprint";
import {readAdmissionOperationVerificationPurpose} from "@/src/modules/academy-admissions/infrastructure/verification/admission-operation-purpose";

type DatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Resolves current actor/resource authority inside the exact transaction holding its required locks. */
type OperationAuthorizer = (database: RequestDatabase, command: AdmissionOperationCommand) => Promise<boolean>;
type OperationRow = { id: string; state: "started" | "completed"; version: number; lease_owner: string | null; lease_until: string | null; fingerprint_key_id: string; intent_fingerprint: Uint8Array; public_result: unknown };
type OperationClaim<Result> = AdmissionOperationResult<Result> | { state: "claimed"; ledgerId: string; owner: string; version: number };

/** Reads the database clock after locks and local crypto rather than before an awaited operation. */
async function clock(database: RequestDatabase): Promise<Date> { return new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now); }

/**
 * Canonicalizes a fixed batch before both execution and read-only recovery.
 * @param command - Owner-normalized context and explicitly selected resources/versions.
 * @returns Stable ordered items and the exact intent protected by the ledger fingerprint.
 * @throws AdmissionOperationError for empty, oversized or duplicate selection.
 */
function normalizeBatch(command:AdmissionBatchOperationCommand):{items:AdmissionBatchItem[];command:AdmissionOperationCommand}{
  if(command.intent.items.length<1||command.intent.items.length>ADMISSION_LIMIT.batchRequestCount)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const items=command.intent.items.map((item)=>({...item,resourceId:item.resourceId.toLowerCase()})).sort((first,second)=>first.resourceId<second.resourceId?-1:first.resourceId>second.resourceId?1:0);
  if(new Set(items.map((item)=>item.resourceId)).size!==items.length)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return{items,command:{...command,intent:{context:command.intent.context,items:items.map((item)=>({resourceId:item.resourceId,expectedVersion:item.expectedVersion,intent:item.intent}))}}};
}

/**
 * Owns a durable operation only; the business owner supplies current locked authorization and mutation.
 * No SDK/RPC, generic job framework or public permission token is introduced.
 */
export class PostgresAdmissionOperationRepository {
  /** @param command - Original scoped operation. @param schema - Own final snapshot. @param maximumSteps - Bounded continuation allowance. @param mutate - One DB-only block on the current claim. @returns Original result or genuine registered progress, preserving prior block commits. */
  async runChunks<Result>(command: AdmissionOperationCommand, schema: z.ZodType<Result>, maximumSteps: number, mutate: (database: RequestDatabase, ledgerId: string) => Promise<{ completed: false } | { completed: true; result: unknown }>): Promise<AdmissionOperationResult<Result>> {
    if (!Number.isInteger(maximumSteps) || maximumSteps <= 0) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    let claim: OperationClaim<Result>;
    try { claim = await this.claim(command, schema); }
    catch (error) {
      if (error instanceof AdmissionOperationError) throw error;
      try { const registered = await this.read(command, schema); if (registered) return registered; }
      catch (recoveryError) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure, { cause: new AggregateError([error, recoveryError], "Admission chunk claim recovery failed", { cause: error }) }); }
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure, { cause: error });
    }
    for (let step = 0; step < maximumSteps && claim.state === "claimed"; step += 1) {
      const currentClaim = claim;
      try {
        claim = await this.executeWithDatabase(async (database): Promise<OperationClaim<Result>> => {
          await this.assertAuthorized(database, command);
          const row = await this.readLocked(database, command);
          if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
          const fingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
          if (!await fingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
          await this.assertAuthorized(database, command);
          if (row.state === OPERATION_STATE.completed) return this.project(command, row, schema);
          const now = await clock(database);
          if (row.lease_owner !== currentClaim.owner || row.version !== currentClaim.version || !row.lease_until || new Date(row.lease_until) <= now) return { state: OPERATION_STATE.started, operationId: command.idempotencyKey };
          const chunk = await mutate(database, row.id);
          const currentFingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
          if (!await currentFingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
          await this.assertAuthorized(database, command);
          const completedAt = await clock(database);
          if (new Date(row.lease_until) <= completedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
          if (chunk.completed) {
            const projected = schema.safeParse(chunk.result);
            if (!projected.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
            const done = (await database.execute(sql`update public.academy_admission_operations set state=${OPERATION_STATE.completed},public_result=${JSON.stringify(projected.data)}::jsonb,completed_at=${completedAt},lease_owner=null,lease_until=null,version=version+1 where id=${row.id} and state=${OPERATION_STATE.started} and lease_owner=${currentClaim.owner} and version=${currentClaim.version} and lease_until>clock_timestamp() returning id`)).rows[0];
            if (!done) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
            return { state: OPERATION_STATE.completed, operationId: command.idempotencyKey, replayed: false, result: projected.data };
          }
          const renewed = (await database.execute<{ version: number }>(sql`update public.academy_admission_operations set lease_until=clock_timestamp()+${ADMISSION_OPERATION_LEASE_MS}*interval '1 millisecond',version=version+1 where id=${row.id} and state=${OPERATION_STATE.started} and lease_owner=${currentClaim.owner} and version=${currentClaim.version} and lease_until>clock_timestamp() returning version`)).rows[0];
          if (!renewed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
          return { state: "claimed", ledgerId: row.id, owner: currentClaim.owner, version: renewed.version };
        });
      } catch (error) {
        if (error instanceof AdmissionOperationError && (error.code === ADMISSION_ERROR_CODE.permissionDenied || error.code === ADMISSION_ERROR_CODE.authenticationRequired || error.code === ADMISSION_ERROR_CODE.reauthenticationRequired)) throw error;
        // A block may have COMMITted before its response was lost. Never redispatch
        // it here: the row owner and exact original must be consulted first.
        try { const original = await this.read(command, schema); if (original?.state === OPERATION_STATE.completed) return original; }
        catch (recoveryError) { if (recoveryError instanceof AdmissionOperationError && (recoveryError.code === ADMISSION_ERROR_CODE.permissionDenied || recoveryError.code === ADMISSION_ERROR_CODE.authenticationRequired)) throw recoveryError; throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey, cause: new AggregateError([error, recoveryError], "Admission block original recovery failed", { cause: error }) }); }
        throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey, cause: error });
      }
    }
    return claim.state === "claimed" ? { state: OPERATION_STATE.started, operationId: command.idempotencyKey } : claim;
  }
  /**
   * @param executeWithDatabase - Existing guarded current-user executor.
   * @param authorize - Mandatory transaction-bound current permission/resource check, including necessary locks.
   * @param readSecurityConfig - Explicit local hosting-secret snapshot; no outbound work inside a transaction.
   * @param authorizeRegistration - Optional current authority guard for registry-only claims; business effects always use authorize.
   */
  constructor(private readonly executeWithDatabase: DatabaseExecutor, private readonly authorize: OperationAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly authorizeRegistration?: OperationAuthorizer) {}

  /**
   * Re-resolves current actor and owner authority before replay or fingerprint comparison.
   * @param database - Exact guarded registry or business transaction.
   * @param command - Fixed actor/tenant/original intent.
   * @param authorize - Current owner guard; defaults to the business authority.
   * @returns After confirming the database actor and current resource permission.
   * @throws AdmissionOperationError when either current authority check denies access.
   */
  private async assertAuthorized(database: RequestDatabase, command: AdmissionOperationCommand, authorize: OperationAuthorizer = this.authorize): Promise<void> {
    const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (actor !== command.actorUserId || !await authorize(database, command)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /** Locks only the exact actor/tenant/type/client-key namespace, never another actor's operation. */
  private async readLocked(database: RequestDatabase, command: AdmissionOperationCommand): Promise<OperationRow | undefined> {
    return (await database.execute<OperationRow>(sql`select id,state,version,lease_owner,lease_until,fingerprint_key_id,intent_fingerprint,public_result from public.academy_admission_operations where actor_user_id=${command.actorUserId} and tribe_id=${command.tribeId} and operation_type=${command.operationType} and idempotency_key=${command.idempotencyKey} for update`)).rows[0];
  }

  /** Validates only the stored own public DTO before emitting it, not the surrounding PostgreSQL row. */
  private project<Result>(command: AdmissionOperationCommand, row: OperationRow, schema: z.ZodType<Result>): AdmissionOperationResult<Result> {
    if (row.state !== OPERATION_STATE.completed) return { state: OPERATION_STATE.started, operationId: command.idempotencyKey };
    const parsed = schema.safeParse(row.public_result);
    if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { operationId: command.idempotencyKey });
    return { state: OPERATION_STATE.completed, operationId: command.idempotencyKey, replayed: true, result: parsed.data };
  }

  /** Creates a durable claim or returns a confirmed replay/live claim before touching a resource CAS. */
  private async claim<Result>(command: AdmissionOperationCommand, schema: z.ZodType<Result>): Promise<OperationClaim<Result>> {
    return this.executeWithDatabase(async (database) => {
      await this.assertAuthorized(database, command, this.authorizeRegistration);
      const fingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
      let row = await this.readLocked(database, command);
      const owner = randomUUID();
      if (!row) {
        const signed = await fingerprint.sign(command);
        const verificationPurpose=readAdmissionOperationVerificationPurpose(command);
        const purposeColumn=verificationPurpose===null?sql``:sql`,verification_purpose`,purposeValue=verificationPurpose===null?sql``:sql`,${verificationPurpose}`;
        const inserted = (await database.execute<OperationRow>(sql`insert into public.academy_admission_operations(actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,lease_owner,lease_until${purposeColumn}) values (${command.actorUserId},${command.tribeId},${command.operationType},${command.idempotencyKey},${Buffer.from(signed.digest)},${signed.keyId},${owner},clock_timestamp()+${ADMISSION_OPERATION_LEASE_MS}*interval '1 millisecond'${purposeValue}) on conflict(actor_user_id,tribe_id,operation_type,idempotency_key) do nothing returning id,state,version,lease_owner,lease_until,fingerprint_key_id,intent_fingerprint,public_result`)).rows[0];
        if (inserted) {
          await this.assertAuthorized(database, command, this.authorizeRegistration);
          return { state: "claimed", ledgerId: inserted.id, owner, version: inserted.version };
        }
        row = await this.readLocked(database, command);
      }
      if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
      const matches = await fingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint);
      await this.assertAuthorized(database, command, this.authorizeRegistration);
      if (!matches) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict, { operationId: command.idempotencyKey });
      if (row.state === OPERATION_STATE.completed) return this.project(command, row, schema);
      const now = await clock(database);
      if (row.lease_until && new Date(row.lease_until) > now) return { state: OPERATION_STATE.started, operationId: command.idempotencyKey };
      const reclaimed = (await database.execute<{ version: number }>(sql`update public.academy_admission_operations set lease_owner=${owner},lease_until=${now}::timestamptz+${ADMISSION_OPERATION_LEASE_MS}*interval '1 millisecond',version=version+1 where id=${row.id} and state=${OPERATION_STATE.started} and version=${row.version} returning version`)).rows[0];
      if (!reclaimed) return { state: OPERATION_STATE.started, operationId: command.idempotencyKey };
      return { state: "claimed", ledgerId: row.id, owner, version: reclaimed.version };
    });
  }

  /**
   * Reconciles the same authorized normalized intent without creating/reclaiming a lease or repeating work.
   * @param command - Server-derived namespace and original normalized intent.
   * @param schema - Own minimal replay contract.
   * @returns Registered progress or its historical result, or null before a claim exists.
   */
  async read<Result>(command: AdmissionOperationCommand, schema: z.ZodType<Result>): Promise<AdmissionOperationResult<Result> | null> {
    return this.executeWithDatabase(async (database) => {
      await this.assertAuthorized(database, command);
      const row = await this.readLocked(database, command);
      if (!row) return null;
      const fingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
      const matches = await fingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint);
      await this.assertAuthorized(database, command);
      if (!matches) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict, { operationId: command.idempotencyKey });
      return this.project(command, row, schema);
    });
  }

  /**
   * Processes explicit bounded items in stable resource order inside one registered business transaction.
   * @param command - Boundary-normalized items/context; every expected version remains part of the intent.
   * @param schema - Own minimal batch result contract containing the per-row results.
   * @param mutateItem - Owner's DB-only writer; it locks that item and returns expected business conflicts as outcomes.
   * @returns Registered progress or confirmed row outcomes; an unexpected throw rolls back every item.
   * @remarks The owner supplies its permission/CAS rules. This method adds no jobs, retries or provider operations.
   */
  async runBatch<Result>(command:AdmissionBatchOperationCommand,schema:z.ZodType<Result>,mutateItem:(database:RequestDatabase,ledgerId:string,item:AdmissionBatchItem)=>Promise<unknown>):Promise<AdmissionOperationResult<Result>>{
    const normalized=normalizeBatch(command);
    return this.run(normalized.command,schema,async(database,ledgerId)=>{
      const results:unknown[]=[];
      for(const item of normalized.items)results.push(await mutateItem(database,ledgerId,item));
      return {results};
    });
  }

  /**
   * Recovers a registered batch using the same stable intent without claiming or repeating row work.
   * @param command - Original boundary-normalized batch context, items and versions.
   * @param schema - Own minimal batch result contract.
   * @returns Historical confirmed result or registered progress, including null before any claim.
   */
  async readBatch<Result>(command:AdmissionBatchOperationCommand,schema:z.ZodType<Result>):Promise<AdmissionOperationResult<Result>|null>{
    return this.read(normalizeBatch(command).command,schema);
  }

  /**
   * Recovers before CAS and atomically publishes the mutation's committed minimal result.
   * @param command - Server actor and normalized own intent, including expected resource versions.
   * @param schema - Explicit own replay DTO contract; creation URLs/secrets are not part of this contract.
   * @param mutate - DB-only owner callback using this exact transaction; receives the internal ledger id for audit links.
   * @returns A historical committed snapshot or an actually registered unfinished operation.
   * @throws AdmissionOperationError for current denial, intent conflict, unusable own result or indeterminate completion.
   */
  async run<Result>(command: AdmissionOperationCommand, schema: z.ZodType<Result>, mutate: (database: RequestDatabase, ledgerId: string) => Promise<unknown>): Promise<AdmissionOperationResult<Result>> {
    let claim: OperationClaim<Result>;
    try {
      claim = await this.claim(command, schema);
    } catch (error) {
      if (error instanceof AdmissionOperationError) throw error;
      // A claim COMMIT may have succeeded. Reconcile read-only before any work,
      // and expose progress only when the authorized registry proves it exists.
      let registered: AdmissionOperationResult<Result> | null;
      try { registered = await this.read(command, schema); }
      catch (reconciliationError) {
        throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure, { cause: new AggregateError([error, reconciliationError], "Admission claim reconciliation failed", { cause: error }) });
      }
      if (registered) return registered;
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure, { cause: error });
    }
    if (claim.state !== "claimed") return claim;
    try {
      return await this.executeWithDatabase(async (database) => {
        await this.assertAuthorized(database, command);
        const row = await this.readLocked(database, command);
        if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
        const fingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
        const matches = await fingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint);
        await this.assertAuthorized(database, command);
        if (!matches) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict, { operationId: command.idempotencyKey });
        if (row.state === OPERATION_STATE.completed) return this.project(command, row, schema);
        const now = await clock(database);
        if (row.lease_owner !== claim.owner || row.version !== claim.version || !row.lease_until || new Date(row.lease_until) <= now) return { state: OPERATION_STATE.started, operationId: command.idempotencyKey };
        const value = await mutate(database, row.id);
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { operationId: command.idempotencyKey });
        const currentFingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
        if (!await currentFingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete, { operationId: command.idempotencyKey });
        await this.assertAuthorized(database, command);
        const completedAt = await clock(database);
        if (new Date(row.lease_until) <= completedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
        const completed = (await database.execute(sql`update public.academy_admission_operations set state=${OPERATION_STATE.completed},public_result=${JSON.stringify(parsed.data)}::jsonb,completed_at=${completedAt},lease_owner=null,lease_until=null,version=version+1 where id=${row.id} and state=${OPERATION_STATE.started} and lease_owner=${claim.owner} and version=${claim.version} and lease_until>clock_timestamp() returning id`)).rows[0];
        if (!completed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
        return { state: OPERATION_STATE.completed, operationId: command.idempotencyKey, replayed: false, result: parsed.data };
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError) throw error;
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error, operationId: command.idempotencyKey });
    }
  }
}
