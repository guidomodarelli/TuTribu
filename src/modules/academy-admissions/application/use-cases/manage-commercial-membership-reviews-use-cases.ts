/** Resolves current leader authority before listing or deciding memberships blocked by payment. @module manage-commercial-membership-reviews-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { CommercialMembershipResolutionCommand, CommercialMembershipReviewRepository } from "../../domain/repositories/commercial-membership-review-repository";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { admissionFailure } from "../results/admission-errors";
import { commercialMembershipReviewListSchema } from "../results/commercial-membership-review-schemas";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION } from "../../constants/commercial-membership-review";
import { OPERATION_STATE } from "@/src/constants/operation-state";

type ReviewQuery = { tribeId: string; requestId: string };

/** The browser never supplies identity, role or the membership facts it is allowed to change. */
export class ManageCommercialMembershipReviewsUseCases {
  /** @param resolver - Current account/session/role owner. @param repository - Tribes-owned reader and audited writer. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly repository: CommercialMembershipReviewRepository) {}

  /** @param query - Validated tribe and correlation. @returns Pending cases for the current leader, rechecking the session after the read. */
  async read(query: ReviewQuery) {
    try {
      const first = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const list = await this.repository.read(first.context);
      const current = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== first.context.userId || current.context.sessionId !== first.context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const parsed = commercialMembershipReviewListSchema.safeParse(list);
      if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Boundary-validated confirmed decision. @returns The original confirmed result (decision or rejection) or registered progress for the same member. */
  async resolve(input: ReviewQuery & CommercialMembershipResolutionCommand) {
    try {
      const reason = input.reason?.trim() ? input.reason.trim() : null;
      if (!input.confirmed || (reason?.length ?? 0) > ADMISSION_LIMIT.internalMessageCharacters) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const result = await this.repository.resolve(authority.context, { operationId: input.operationId, confirmed: input.confirmed, memberId: input.memberId, decision: input.decision, expected: input.expected, reason });
      if (result.operationId.toLowerCase() !== input.operationId.toLowerCase() || result.state === OPERATION_STATE.completed && result.result.memberId.toLowerCase() !== input.memberId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: result };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
