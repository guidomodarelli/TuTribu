/** Calls the tribes-owned SQL functions for the leader's commercial membership review inside the original admission ledger. @module postgres-commercial-membership-review-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { CommercialMembershipResolutionCommand, CommercialMembershipReviewRepository } from "../../domain/repositories/commercial-membership-review-repository";
import type { CommercialMembershipResolutionResult, CommercialMembershipReviewCase, CommercialMembershipReviewList } from "../../domain/entities/commercial-membership-review";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION, COMMERCIAL_MEMBERSHIP_REVIEW_STATUS } from "../../constants/commercial-membership-review";
import { commercialMembershipResolutionResultSchema } from "../../application/results/commercial-membership-review-schemas";
import { authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { OPERATION_STATE } from "@/src/constants/operation-state";

type ReviewDatabaseExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Owned JSON projection of the reader function; row values are mapped, not schema-validated. */
type ReviewListRow = { cases: Array<{ memberId: string; displayName: string | null; role: CommercialMembershipReviewCase["role"]; status: CommercialMembershipReviewCase["status"]; statusReason: CommercialMembershipReviewCase["statusReason"]; recoveryStatus: CommercialMembershipReviewCase["recoveryStatus"]; joinedAt: string }>; pendingCount: number; resolvedCount: number };
/** Owned JSON projection of the writer function. */
type ResolutionRow =
  | { status: "denied"; code: AdmissionErrorCode }
  | { status: "rejected"; reason: Extract<CommercialMembershipResolutionResult, { status: "rejected" }>["reason"] }
  | { status: "resolved"; replayed: boolean; memberId: string; decision: Extract<CommercialMembershipResolutionResult, { status: "resolved" }>["decision"]; resultingRole: "tribemate"; resultingStatus: Extract<CommercialMembershipResolutionResult, { status: "resolved" }>["resultingStatus"]; resultingRecoveryStatus: CommercialMembershipReviewCase["recoveryStatus"]; decidedAt: string };

/** Authority denials of the owner function that may surface as closed application failures. */
const OWNER_DENIAL_CODES: ReadonlySet<AdmissionErrorCode> = new Set([ADMISSION_ERROR_CODE.authenticationRequired, ADMISSION_ERROR_CODE.permissionDenied, ADMISSION_ERROR_CODE.resourceUnavailable, ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.idempotencyConflict]);

/** @param value - Owner timestamp (ISO or PostgreSQL text). @returns Canonical ISO text for the public DTO. */
function toIso(value: string): string { return new Date(value).toISOString(); }

/** The owner functions repeat leadership, session, academy, locks and CAS; this adapter adds the original ledger. */
export class PostgresCommercialMembershipReviewRepository implements CommercialMembershipReviewRepository {
  /** @param execute - Current account's guarded transaction executor. @param readSecurityConfig - Local keyring snapshot for the ledger fingerprint. */
  constructor(private readonly execute: ReviewDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param context - Current leader read scope. @returns Pending cases; a null owner answer is a current denial. */
  async read(context: AuthorizedAdmissionContext): Promise<CommercialMembershipReviewList> {
    return this.execute(context, async (database) => {
      await authorizeAdmissionPolicy(database, context);
      const row = (await database.execute<{ value: ReviewListRow | null }>(sql`select public.read_commercial_membership_reviews(${context.tribeId},${context.sessionId}) as value`)).rows[0]?.value;
      if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      await authorizeAdmissionPolicy(database, context);
      return { pendingCount: row.pendingCount, resolvedCount: row.resolvedCount, cases: row.cases.map((item) => ({ ...item, joinedAt: toIso(item.joinedAt) })) };
    });
  }

  /** @param context - Current leader with the review's sensitive purpose. @param input - Confirmed decision. @returns The original confirmed decision or rejection, or registered progress. */
  async resolve(context: AuthorizedAdmissionContext, input: CommercialMembershipResolutionCommand): Promise<AdmissionOperationResult<CommercialMembershipResolutionResult>> {
    if (!input.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const memberId = input.memberId.toLowerCase();
    const command = { actorUserId: context.userId, tribeId: context.tribeId, operationType: COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION, idempotencyKey: input.operationId,
      intent: { memberId, decision: input.decision, expected: { role: input.expected.role, status: input.expected.status, statusReason: input.expected.statusReason, recoveryStatus: input.expected.recoveryStatus }, reason: input.reason } };
    const authorize = async (database: RequestDatabase) => { await authorizeAdmissionPolicy(database, context, COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION); return true; };
    const ledger = new PostgresAdmissionOperationRepository((run) => this.execute(context, run), authorize, this.readSecurityConfig);
    try {
      return await ledger.run(command, commercialMembershipResolutionResultSchema, async (database) => {
        const row = (await database.execute<{ value: ResolutionRow }>(sql`select public.resolve_commercial_membership_review(${context.tribeId},${context.sessionId},${input.operationId},${memberId},${input.decision},${input.expected.role},${input.expected.status},${input.expected.statusReason},${input.expected.recoveryStatus},${input.reason}) as value`)).rows[0]?.value;
        if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure);
        if (row.status === COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.denied) throw new AdmissionOperationError(OWNER_DENIAL_CODES.has(row.code) ? row.code : ADMISSION_ERROR_CODE.unexpectedFailure);
        if (row.status === COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.rejected) return { status: row.status, memberId, reason: row.reason };
        return { status: row.status, memberId: row.memberId, decision: row.decision, resultingRole: row.resultingRole, resultingStatus: row.resultingStatus, resultingRecoveryStatus: row.resultingRecoveryStatus, decidedAt: toIso(row.decidedAt) };
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved) {
        try {
          const original = await ledger.read(command, commercialMembershipResolutionResultSchema);
          if (original?.state === OPERATION_STATE.completed) return original;
        } catch (recoveryError) {
          if (recoveryError instanceof AdmissionOperationError) throw recoveryError;
          throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: input.operationId, cause: new AggregateError([error, recoveryError], "Commercial membership review original commit reconciliation failed", { cause: error }) });
        }
      }
      throw error;
    }
  }
}
