/** Commits tribe lifecycle, admission retirement and original recovery under the same scope fence. @module postgres-tribe-lifecycle-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { createAdmissionOperationFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-operation-fingerprint";
import { CloseAcademyAdmissionScopeUseCase } from "@/src/modules/academy-admissions/application/use-cases/close-academy-admission-scope-use-case";
import type { AdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-scope-closure-writer";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { ADMISSION_SCOPE_RETIREMENT_REASON } from "@/src/modules/academy-admissions/constants/admission-scope-lifecycle";
import { TRIBE_MEMBER_ROLE } from "../../constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "../../constants/tribe-page-access";
import { TRIBE_LIFECYCLE_ACTION, TRIBE_LIFECYCLE_ACTIONS, TRIBE_LIFECYCLE_AUDIT_CONTEXT, TRIBE_LIFECYCLE_ERROR, TRIBE_LIFECYCLE_OPERATION } from "../../constants/tribe-lifecycle";
import { TribeLifecycleError } from "../../domain/errors/tribe-lifecycle-error";
import { classifyMessagingPlatformSecurityFailure } from "@/src/modules/messaging/infrastructure/config/messaging-platform-security-failure";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { TribeLifecycleContext, TribeLifecycleInput, TribeLifecycleWriter, TribeLifecycleResult } from "../../domain/repositories/tribe-lifecycle-repository";
import { tribeLifecycleResultSchema } from "../../constants/tribe-lifecycle-result";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";

/** Every phase binds the actual native identity; archived scope never changes the actor. */
export type TribeLifecycleDatabaseExecutor = <Result>(context: TribeLifecycleContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** The admission owner remains in the existing transaction and performs no outbound RPC. */
export type AdmissionScopeClosureFactory = (database: RequestDatabase) => AdmissionScopeClosureWriter;
/** Only original MAC and safe result fields are consumed from owned persistence. */
type OriginalRow = { actor_user_id: string|null; action: string; fingerprint_key_id: string; intent_fingerprint: Uint8Array; public_result: unknown };

/** A single transaction has no durable partial lifecycle job; known originals survive scope deletion. */
export class PostgresTribeLifecycleRepository implements TribeLifecycleWriter {
  /** @param execute - Request-bound guarded owner executor. @param security - Current retained operation MAC keys. @param admission - Scope closure on the original transaction. */
  constructor(private readonly execute: TribeLifecycleDatabaseExecutor, private readonly security: () => Promise<MessagingSecurityConfig>, private readonly admission: AdmissionScopeClosureFactory) {}

  /**
   * @param unavailable - Closed outcome when the platform cannot protect the original: definitive for a new change, unresolved for a recovery.
   * @param operationId - Original identity, named by an unresolved recovery.
   * @returns The signer of the original intent, read before any transaction.
   * @throws TribeLifecycleError with the hosting security failure as cause when the platform cannot protect it.
   */
  private async fingerprint(unavailable: typeof TRIBE_LIFECYCLE_ERROR.platformSecurityUnavailable | typeof TRIBE_LIFECYCLE_ERROR.operationUnresolved, operationId: string) {
    try {
      const config = await this.security();
      // A recovery lock would otherwise surface later, inside the transaction, as an incomplete connection.
      if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
      return createAdmissionOperationFingerprint(config);
    } catch (error) {
      if (!classifyMessagingPlatformSecurityFailure(error)) throw error;
      throw new TribeLifecycleError(unavailable, { cause: error, ...(unavailable === TRIBE_LIFECYCLE_ERROR.operationUnresolved ? { operationId } : {}) });
    }
  }

  /** @param database - Existing transaction. @param context - Actual native account/session. @returns A current private account without requiring a surviving membership or tribe for historical recovery. */
  private async identity(database: RequestDatabase, context: TribeLifecycleContext) {
    const actor = (await database.execute<{actor: string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (actor !== context.actorUserId) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.permissionDenied);
    await database.execute(sql`select id from public."user" where id=${context.actorUserId} for share`);
    await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} for share`);
    const account = await new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.actorUserId, sessionId: context.sessionId }), (_identity, run) => run(database)).getAuthenticatedAccount();
    const now = new Date((await database.execute<{now: Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, now)) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.authenticationRequired);
    return account;
  }

  /** @param context - Native scope. @param input - Exact normalized original. @returns The complete MAC intent without persisting its raw body. */
  private command(context: TribeLifecycleContext, input: TribeLifecycleInput): AdmissionOperationCommand {
    return { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: TRIBE_LIFECYCLE_OPERATION, idempotencyKey: input.operationId, intent: { action: input.action, expectedConfigVersion: input.expectedConfigVersion, confirmed: input.confirmed } };
  }

  /** @param database - Current authorized actor transaction. @param context - Exact original scope. @param input - Original intent. @param fingerprint - Retained owner MAC helper. @returns The immutable original, isolated from another actor or a reused slug. */
  private async original(database: RequestDatabase, context: TribeLifecycleContext, input: TribeLifecycleInput, fingerprint: ReturnType<typeof createAdmissionOperationFingerprint>): Promise<AdmissionOperationResult<TribeLifecycleResult> | null> {
    const row = (await database.execute<OriginalRow>(sql`select actor_user_id,action,fingerprint_key_id,intent_fingerprint,public_result from public.tribe_lifecycle_operations where tribe_id=${context.tribeId} and operation_id=${input.operationId} for share`)).rows[0];
    if (!row) return null;
    if (row.actor_user_id !== context.actorUserId) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.permissionDenied);
    if (row.action !== input.action || !await fingerprint.verify(this.command(context, input), row.fingerprint_key_id, row.intent_fingerprint)) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.idempotencyConflict);
    const parsed = tribeLifecycleResultSchema.safeParse(row.public_result);
    if (!parsed.success) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.publicContractUnusable, { cause: parsed.error });
    return { state: OPERATION_STATE.completed, operationId: input.operationId, replayed: true, result: parsed.data };
  }

  /** @param context - Actual native identity. @param input - Original intent. @returns A known original or null, without locking or mutating a live tribe. */
  async recover(context: TribeLifecycleContext, input: TribeLifecycleInput) {
    try {
      // A recovery never discards an original it cannot verify yet: it stays unresolved until the platform security is back.
      const fingerprint = await this.fingerprint(TRIBE_LIFECYCLE_ERROR.operationUnresolved, input.operationId);
      return await this.execute(context, async (database) => { await this.identity(database, context); return this.original(database, context, input, fingerprint); });
    } catch (error) { if (error instanceof TribeLifecycleError) throw error; throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.unexpectedFailure, { cause: error }); }
  }

  /** @param database - Fenced original transaction. @param context - Current native scope. @returns After the canonical leader and its live session remain current; the explicit confirmation is checked by the caller. */
  private async authorizeChange(database: RequestDatabase, context: TribeLifecycleContext): Promise<void> {
    await this.identity(database, context);
    const leaders = (await database.execute<{user_id: string}>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
    if (leaders.length !== 1 || leaders[0].user_id !== context.actorUserId) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.permissionDenied);
  }

  /** Rechecks the native identity after the intentional parent cascade removed the tribe and its membership rows.
   * @param database - Original transaction retaining user/session locks.
   * @param context - Original native actor and retired UUID.
   * @returns After fresh SQL time and the surviving native session still authorize deletion.
   */
  private async authorizeDeletedScope(database: RequestDatabase, context: TribeLifecycleContext): Promise<void> {
    await this.identity(database, context);
  }

  /** @param context - Native actor and fixed UUID scope. @param input - Original confirmed action/CAS. @param error - Failure seen after the change was staged. @returns The original committed by a lost commit response. @throws TribeLifecycleError unresolved when no original can be observed, or the recovery authority failure. */
  private async recoverStagedChange(context: TribeLifecycleContext, input: TribeLifecycleInput, error: unknown): Promise<AdmissionOperationResult<TribeLifecycleResult>> {
    try { const original = await this.recover(context, input); if (original) return original; }
    catch (recoveryError) { if (recoveryError instanceof TribeLifecycleError && (recoveryError.code === TRIBE_LIFECYCLE_ERROR.authenticationRequired || recoveryError.code === TRIBE_LIFECYCLE_ERROR.permissionDenied)) throw recoveryError; throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.operationUnresolved, { cause: new AggregateError([error, recoveryError], "Tribe lifecycle original could not be observed", { cause: error }), operationId: input.operationId }); }
    throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.operationUnresolved, { cause: error, operationId: input.operationId });
  }

  /** @param context - Native actor and fixed UUID scope. @param input - Original confirmed action/CAS. @returns The original committed metadata; a lost commit response is reconciled before another mutation. */
  async change(context: TribeLifecycleContext, input: TribeLifecycleInput): Promise<AdmissionOperationResult<TribeLifecycleResult>> {
    if (!input.confirmed || !TRIBE_LIFECYCLE_ACTIONS.includes(input.action)) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.invalidInput);
    // Nothing is registered yet: a platform that cannot protect the change rejects it definitively instead of an unexpected failure.
    const fingerprint = await this.fingerprint(TRIBE_LIFECYCLE_ERROR.platformSecurityUnavailable, input.operationId), command = this.command(context, input);
    let transactionStaged = false;
    try {
      return await this.execute(context, async (database) => {
        await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);
        await this.identity(database, context);
        const original = await this.original(database, context, input, fingerprint);
        if (original) return original;
        if (!(await database.execute(sql`select id from public.tribes where id=${context.tribeId}`)).rows[0]) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.resourceUnavailable);
        await this.authorizeChange(database, context);
        const settings = (await database.execute<{access_model: string;config_version: number}>(sql`select access_model,config_version from public.tribe_academy_settings where tribe_id=${context.tribeId} for update`)).rows[0];
        if (settings?.config_version !== input.expectedConfigVersion || input.action === TRIBE_LIFECYCLE_ACTION.exitAcademy && settings.access_model !== TRIBE_ACCESS_MODEL.academy) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.lifecycleConflict);
        const signed = await fingerprint.sign(command);
        await this.authorizeChange(database, context);
        const deleted = input.action === TRIBE_LIFECYCLE_ACTION.deleteTribe;
        const result: TribeLifecycleResult = { action: input.action, deleted, accessModel: deleted ? null : TRIBE_ACCESS_MODEL.legacy, configVersion: deleted ? null : input.expectedConfigVersion + 1 };
        const publicResult = tribeLifecycleResultSchema.parse(result);
        // The original is private until commit; a failed effect or authority check rolls it back with its audit.
        await database.execute(sql`insert into public.tribe_lifecycle_operations(actor_user_id,tribe_id,operation_id,action,fingerprint_key_id,intent_fingerprint,public_result) values (${context.actorUserId},${context.tribeId},${input.operationId},${input.action},${signed.keyId},${Buffer.from(signed.digest)},${JSON.stringify(publicResult)}::jsonb)`);
        await database.execute(sql`select set_config(${TRIBE_LIFECYCLE_AUDIT_CONTEXT},${input.operationId},true)`);
        await new CloseAcademyAdmissionScopeUseCase(this.admission(database)).execute({ tribeId: context.tribeId, reason: deleted ? ADMISSION_SCOPE_RETIREMENT_REASON.tribeDeletion : ADMISSION_SCOPE_RETIREMENT_REASON.academyExit });
        if (deleted) await database.execute(sql`delete from public.tribes where id=${context.tribeId}`);
        else await database.execute(sql`update public.tribe_academy_settings set access_model=${TRIBE_ACCESS_MODEL.legacy},admission_enabled=false,sales_enabled=false,config_version=config_version+1,updated_at=clock_timestamp() where tribe_id=${context.tribeId} and config_version=${input.expectedConfigVersion}`);
        await database.execute(sql`select set_config(${TRIBE_LIFECYCLE_AUDIT_CONTEXT},'',true)`);
        if (!deleted) await this.authorizeChange(database, context); else await this.authorizeDeletedScope(database, context);
        transactionStaged = true;
        return { state: OPERATION_STATE.completed, operationId: input.operationId, replayed: false, result: publicResult };
      });
    } catch (error) {
      if (error instanceof TribeLifecycleError) throw error;
      if (transactionStaged) return this.recoverStagedChange(context, input, error);
      throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.unexpectedFailure, { cause: error });
    }
  }
}
