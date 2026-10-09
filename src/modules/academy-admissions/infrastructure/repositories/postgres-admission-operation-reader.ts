/** Reads only the current actor's original registry without taking or renewing a lease. @module postgres-admission-operation-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionOperationReader } from "@/src/modules/academy-admissions/domain/repositories/admission-operation-reader";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_RECOVERABLE_OPERATION_TYPES, ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_POLICY_RECOVERABLE_OPERATIONS } from "../../constants/admission-policy";
import { ALLOWLIST_RECOVERABLE_OPERATIONS } from "../../constants/allowlist-management";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { authorizeAdmissionLeader } from "./postgres-admission-leader-authorizer";

/** Owned row fields are consumed directly; only the final own recovery DTO is schema-guarded by application. */
type RegisteredOperationRow = { operation_type: string; state: "started" | "completed"; idempotency_key: string; public_result: unknown; member_role: string | null; member_status: string | null; request_user_id: string | null };

/** This reader has no keyring, claim, writer, sender, retry or reconciliation-effect dependency. */
export class PostgresAdmissionOperationReader implements AdmissionOperationReader<unknown> {
  /** @param execute - Guarded actual current account executor. */
  constructor(private readonly execute: <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>) {}

  /** Samples current SQL session validity after each preceding wait. */
  private async authorizeSession(database: RequestDatabase, scope: AdmissionCommandScope): Promise<void> {
    if (!(await database.execute(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }

  /** @param scope - Native server account/session/tribe. @param operationId - Original client UUID. @returns Genuine registered original state or absence, without creating work. */
  async read(scope: AdmissionCommandScope, operationId: string): Promise<unknown | null> {
    return this.execute(scope, async (database) => {
      await this.authorizeSession(database, scope);
      const rows = (await database.execute<RegisteredOperationRow>(sql`select operation_type,state,idempotency_key,public_result,member_role,member_status,request_user_id from public.read_own_admission_operations(${scope.tribeId},${scope.sessionId},${operationId}) where operation_type=any(${sql.param(ADMISSION_RECOVERABLE_OPERATION_TYPES)}::text[]) limit 2`)).rows;
      if (rows.length > 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
      const row = rows[0];
      if (!row) { await this.authorizeSession(database, scope); return null; }
      const leader = row.member_status === TRIBE_MEMBERSHIP_STATUS.active && row.member_role === TRIBE_MEMBER_ROLE.leader;
      const reviewer = row.member_status === TRIBE_MEMBERSHIP_STATUS.active && (row.member_role === TRIBE_MEMBER_ROLE.leader || row.member_role === TRIBE_MEMBER_ROLE.guardian);
      if (ADMISSION_POLICY_RECOVERABLE_OPERATIONS.includes(row.operation_type) && !leader) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      if (ALLOWLIST_RECOVERABLE_OPERATIONS.includes(row.operation_type)) {
        if (!leader) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
        await authorizeAdmissionLeader(database, { ...scope, action: ADMISSION_ACTION.manageAllowlist, role: TRIBE_MEMBER_ROLE.leader, membershipStatus: TRIBE_MEMBERSHIP_STATUS.active, resourceId: scope.tribeId }, { action: ADMISSION_ACTION.manageAllowlist, resourceId: scope.tribeId });
      }
      if (row.operation_type === ADMISSION_OPERATION_TYPE.decide && !reviewer) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      if (row.operation_type === ADMISSION_OPERATION_TYPE.allowRetry && !leader) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      if (row.operation_type === ADMISSION_OPERATION_TYPE.cancel && row.state === OPERATION_STATE.completed) {
        const result = row.public_result;
        if (typeof result !== "object" || result === null || !("admissionRequestId" in result) || typeof result.admissionRequestId !== "string") throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
        if (!row.request_user_id || row.request_user_id !== scope.userId && !leader) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      }
      await this.authorizeSession(database, scope);
      return { operationType: row.operation_type, operation: row.state === OPERATION_STATE.started ? { state: OPERATION_STATE.started, operationId: row.idempotency_key } : { state: OPERATION_STATE.completed, operationId: row.idempotency_key, replayed: true, result: row.public_result } };
    });
  }
}
