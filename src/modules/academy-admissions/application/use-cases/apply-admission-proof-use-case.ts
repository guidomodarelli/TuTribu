/** Applies an opaque admission proof to an original own pending request through native identity and atomic owner contracts. @module apply-admission-proof-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionProofApplicationOperations } from "../../domain/repositories/admission-verification-proof-repository";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { ADMISSION_PROOF_APPLICATION_OUTCOME } from "../../constants/admission-proof";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionProofApplicationOperationSchema } from "../results/admission-proof-application-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { admissionFailure } from "../results/admission-errors";

/** All identity, contact, evidence, policy and resource facts remain server-owned. */
export type ApplyAdmissionProofInput = { tribeId: string; requestId: string; admissionRequestId: string; proofId: string; expectedRequestVersion: number; operationId: string };
/** The use case never sends a code, creates a membership or substitutes current data for an original committed snapshot. */
export class ApplyAdmissionProofUseCase {
  /** @param accounts - Native current global account/session. @param operations - Atomic proof owner without HTTP or provider dependencies. @param clock - Fresh time after awaited identity reads. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly operations: AdmissionProofApplicationOperations, private readonly clock: () => Date) {}
  /** @param input - Boundary-validated original operation, own pending request, proof and observed version. @returns Registered progress, original applied snapshot or a safe confirmed denial. */
  async execute(input: ApplyAdmissionProofInput) {
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const raw = await this.operations.apply({ userId: account.userId, sessionId: account.session.id, tribeId: input.tribeId, requestId: input.requestId, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, admissionRequestId: input.admissionRequestId, proofId: input.proofId, expectedRequestVersion: input.expectedRequestVersion, operationId: input.operationId });
      const parsed = admissionProofApplicationOperationSchema.safeParse(raw);
      if (!parsed.success || parsed.data.operationId !== input.operationId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const value = parsed.data;
      if (value.state === OPERATION_STATE.completed) {
        if (value.result.outcome === ADMISSION_PROOF_APPLICATION_OUTCOME.denied) return { ok: false as const, failure: admissionFailure(value.result.code, { operation: { operationId: input.operationId, state: OPERATION_STATE.completed } }) };
        if (value.result.requestId !== input.admissionRequestId || value.result.proofId !== input.proofId || value.result.requestVersion !== input.expectedRequestVersion + 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      }
      return { ok: true as const, value };
    } catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId && error.operationId !== input.operationId) return admissionOperationFailure(new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: error }));
      return admissionOperationFailure(error);
    }
  }
}
