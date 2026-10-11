/** Commits membership lifecycle changes and their original result under one tenant fence. @module postgres-tribe-membership-lifecycle-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionOperationCommand } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-membership-lifecycle-writer";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { ReconcileAdmissionMembershipUseCase } from "@/src/modules/academy-admissions/application/use-cases/reconcile-admission-membership-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT } from "@/src/modules/academy-admissions/constants/admission-membership-lifecycle";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { TRIBE_MEMBER_ROLE } from "../../constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "../../constants/tribe-page-access";
import { TRIBE_MEMBERSHIP_LIFECYCLE_ACTION, TRIBE_MEMBERSHIP_LIFECYCLE_OPERATION, TRIBE_MEMBERSHIP_LIFECYCLE_ERROR, TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME } from "../../constants/tribe-membership-lifecycle";
import { TribeMembershipLifecycleError, type TribeMembershipLifecycleErrorCode } from "../../domain/errors/tribe-membership-lifecycle-error";
import type { TribeMembershipLifecycleContext, TribeMembershipLifecycleInput, TribeMembershipLifecycleWriter, TribeMembershipLifecycleResult } from "../../domain/repositories/tribe-membership-lifecycle-repository";
import { tribeMembershipLifecycleResultSchema } from "../../application/results/tribe-membership-lifecycle-result";

/** Every phase uses the actual request actor and the same database selection. */
export type TribeMembershipLifecycleDatabaseExecutor = <Result>(context: TribeMembershipLifecycleContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Admission composition keeps the membership owner's transaction and creates no provider dependency. */
export type AdmissionMembershipLifecycleFactory = (database: RequestDatabase) => AdmissionMembershipLifecycleWriter;
/** Consumes only membership facts needed for authorization and state transitions. */
type MemberRow = { id: string; user_id: string; role: string; status: string; status_reason: string };

/** Preserves CAS, revocation, terminal request effects and replay without lifting a nonrecoverable restriction. */
export class PostgresTribeMembershipLifecycleRepository implements TribeMembershipLifecycleWriter {
  /** @param execute - Native actor transaction executor. @param security - Original operation fingerprint configuration. @param admission - Admission owner on the existing transaction. */
  constructor(private readonly execute: TribeMembershipLifecycleDatabaseExecutor, private readonly security: () => Promise<MessagingSecurityConfig>, private readonly admission: AdmissionMembershipLifecycleFactory) {}

  /** @param database - Current actor transaction. @param context - Native session and tenant. @returns After the tenant fence and post-lock session lifetime remain valid. */
  private async authorizeIdentity(database: RequestDatabase, context: TribeMembershipLifecycleContext): Promise<void> {
    const actor = (await database.execute<{actor: string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (actor !== context.actorUserId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if (!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await database.execute(sql`select id from public."user" where id=${context.actorUserId} for share`);
    const session = (await database.execute<{expires_at: Date|string}>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} for share`)).rows[0];
    const now = new Date((await database.execute<{now: Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (!session || !Number.isFinite(new Date(session.expires_at).getTime()) || new Date(session.expires_at) <= now) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }

  /** @param context - Native owner scope. @param input - Confirmed original. @returns A fingerprint containing the complete original intent. */
  private command(context: TribeMembershipLifecycleContext, input: TribeMembershipLifecycleInput): AdmissionOperationCommand {
    return { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: TRIBE_MEMBERSHIP_LIFECYCLE_OPERATION, idempotencyKey: input.operationId, intent: { action: input.action, memberId: input.memberId, expectedStatus: input.expectedStatus, confirmed: input.confirmed } };
  }

  /** @param context - Native scope. @returns The original ledger with session authorization independent of current membership, so leaving cannot erase recovery. */
  private ledger(context: TribeMembershipLifecycleContext): PostgresAdmissionOperationRepository {
    return new PostgresAdmissionOperationRepository((run) => this.execute(context, run), async (database) => { await this.authorizeIdentity(database, context); return true; }, this.security);
  }

  /** @param error - Original internal failure. @param operationId - Exact original identity. @returns A closed failure, retaining progress only for the matching original. */
  private failure(error: unknown, operationId: string): TribeMembershipLifecycleError {
    if (error instanceof TribeMembershipLifecycleError) return error;
    const code = error instanceof AdmissionOperationError && Object.values(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR).some((candidate) => candidate === error.code) ? error.code as TribeMembershipLifecycleErrorCode : TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.unexpectedFailure;
    return new TribeMembershipLifecycleError(code, { cause: error, ...(error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId === operationId ? { operationId } : {}) });
  }

  /** @param context - Current native identity. @param input - Same original intent. @returns Original known state without acquiring another mutation lease. */
  async recover(context: TribeMembershipLifecycleContext, input: TribeMembershipLifecycleInput) {
    try { return await this.ledger(context).read(this.command(context, input), tribeMembershipLifecycleResultSchema); }
    catch (error) { throw this.failure(error, input.operationId); }
  }

  /** @param context - Native actor/session. @param input - Explicit original CAS action. @returns The original durable result. @throws A safe typed failure preserving unknown-outcome progress. */
  async change(context: TribeMembershipLifecycleContext, input: TribeMembershipLifecycleInput) {
    const ledger = this.ledger(context), command = this.command(context, input);
    try {
      if (!input.confirmed) throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.invalidInput);
      const original = await ledger.read(command, tribeMembershipLifecycleResultSchema);
      if (original?.state === OPERATION_STATE.completed) return original;
      return await ledger.run(command, tribeMembershipLifecycleResultSchema, async (database): Promise<TribeMembershipLifecycleResult> => {
        await this.authorizeIdentity(database, context);
        const members = (await database.execute<MemberRow>(sql`select id,user_id,role,status,status_reason from public.tribe_members where tribe_id=${context.tribeId} and (id=${input.memberId} or user_id=${context.actorUserId} or role=${TRIBE_MEMBER_ROLE.leader}) order by user_id for update`)).rows;
        const target = members.find((member) => member.id === input.memberId), actor = members.find((member) => member.user_id === context.actorUserId);
        const leaving = input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.leave;
        if (leaving) {
          if (!target || target.user_id !== context.actorUserId) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.permissionDenied };
          const recoverable = target.status === TRIBE_MEMBERSHIP_STATUS.active || target.status === TRIBE_MEMBERSHIP_STATUS.muted || target.status === TRIBE_MEMBERSHIP_STATUS.blocked && target.status_reason === TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked || target.status === TRIBE_MEMBERSHIP_STATUS.removed && target.status_reason === TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive;
          if (!recoverable) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.permissionDenied };
        } else {
          const leaders = members.filter((member) => member.role === TRIBE_MEMBER_ROLE.leader && member.status === TRIBE_MEMBERSHIP_STATUS.active);
          if (!actor || actor.role !== TRIBE_MEMBER_ROLE.leader || actor.status !== TRIBE_MEMBERSHIP_STATUS.active || leaders.length !== 1 || leaders[0].user_id !== context.actorUserId) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.permissionDenied };
        }
        if (!target) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.resourceUnavailable };
        if (target.role === TRIBE_MEMBER_ROLE.leader) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.permissionDenied };
        if (target.status !== input.expectedStatus) return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied, code: TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.membershipConflict };
        const status = input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.block ? TRIBE_MEMBERSHIP_STATUS.blocked : TRIBE_MEMBERSHIP_STATUS.removed;
        if (leaving) await database.execute(sql`delete from public.tribe_members where id=${target.id} and tribe_id=${context.tribeId} and user_id=${target.user_id}`);
        else await database.execute(sql`update public.tribe_members set status=${status},status_reason=${input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.block ? TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked : TRIBE_MEMBERSHIP_STATUS_REASON.none} where id=${target.id} and tribe_id=${context.tribeId} and user_id=${target.user_id}`);
        const reconcile = new ReconcileAdmissionMembershipUseCase(this.admission(database));
        await reconcile.execute({ tribeId: context.tribeId, userId: target.user_id, memberId: target.id, kind: leaving ? ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.left : input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.block ? ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.conductBlocked : ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.removed });
        await this.authorizeIdentity(database, context);
        return { outcome: TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.changed, memberId: target.id, action: input.action, status, deleted: leaving };
      });
    } catch (error) { throw this.failure(error, input.operationId); }
  }
}
