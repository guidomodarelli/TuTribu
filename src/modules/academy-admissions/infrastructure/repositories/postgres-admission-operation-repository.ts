/** Commits claims separately, then business effects and minimal public results in one guarded transaction. */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_LEASE_MS } from "@/src/modules/academy-admissions/constants/admission-operation";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createAdmissionOperationFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-operation-fingerprint";

type DatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
type OperationRow = { id: string; state: "started" | "completed"; version: number; lease_owner: string | null; lease_until: string | null; fingerprint_key_id: string; intent_fingerprint: Uint8Array; public_result: unknown };
type OperationClaim<Result> = AdmissionOperationResult<Result> | { state: "claimed"; ledgerId: string; owner: string; version: number };

/** Reads the database clock after locks and local crypto rather than before an awaited operation. */
async function clock(database: RequestDatabase): Promise<Date> { return new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now); }

/**
 * Owns a durable operation only; the business owner supplies current locked authorization and mutation.
 * No SDK/RPC, generic job framework or public permission token is introduced.
 */
export class PostgresAdmissionOperationRepository {
  /**
   * @param executeWithDatabase - Existing guarded current-user executor.
   * @param authorize - Mandatory transaction-bound current permission/resource check, including necessary locks.
   * @param readSecurityConfig - Explicit local hosting-secret snapshot; no outbound work inside a transaction.
   */
  constructor(private readonly executeWithDatabase: DatabaseExecutor, private readonly authorize: (database: RequestDatabase, command: AdmissionOperationCommand) => Promise<boolean>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** Re-resolves the actor and owner-specific current authority before any replay or fingerprint comparison. */
  private async assertAuthorized(database: RequestDatabase, command: AdmissionOperationCommand): Promise<void> {
    const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (actor !== command.actorUserId || !await this.authorize(database, command)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
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
      await this.assertAuthorized(database, command);
      const fingerprint = createAdmissionOperationFingerprint(await this.readSecurityConfig());
      let row = await this.readLocked(database, command);
      const owner = randomUUID();
      if (!row) {
        const signed = await fingerprint.sign(command);
        const inserted = (await database.execute<OperationRow>(sql`insert into public.academy_admission_operations(actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,lease_owner,lease_until) values (${command.actorUserId},${command.tribeId},${command.operationType},${command.idempotencyKey},${Buffer.from(signed.digest)},${signed.keyId},${owner},clock_timestamp()+${ADMISSION_OPERATION_LEASE_MS}*interval '1 millisecond') on conflict(actor_user_id,tribe_id,operation_type,idempotency_key) do nothing returning id,state,version,lease_owner,lease_until,fingerprint_key_id,intent_fingerprint,public_result`)).rows[0];
        if (inserted) {
          await this.assertAuthorized(database, command);
          return { state: "claimed", ledgerId: inserted.id, owner, version: inserted.version };
        }
        row = await this.readLocked(database, command);
      }
      if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey });
      const matches = await fingerprint.verify(command, row.fingerprint_key_id, row.intent_fingerprint);
      await this.assertAuthorized(database, command);
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
