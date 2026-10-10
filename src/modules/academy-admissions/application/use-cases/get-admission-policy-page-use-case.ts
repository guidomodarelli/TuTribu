/** Builds one current leader SSR policy projection through inward read ports. @module get-admission-policy-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { GetAdmissionPolicyUseCase } from "./get-admission-policy-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import { admissionPolicyPageStateSchema } from "../results/admission-policy-page-state";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** The current leader query remains independent of mutation recency, keyrings and provider clients. */
export class GetAdmissionPolicyPageUseCase {
  /** @param accounts - Native global identity. @param readers - Current authorized policy and canonical tribe resolution. @param clock - Final render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { policy: Pick<GetAdmissionPolicyUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /** @param query - Once-validated slug and safe correlation. @returns Own current state or a controlled failure without private partial props. */
  async execute(query: { slug: string; requestId: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const tribe = await this.readers.resolveTribe.execute(query);
      if (!tribe.ok) return tribe;
      const policy = await this.readers.policy.execute({ tribeId: tribe.value.tribeId, requestId: query.requestId });
      if (!policy.ok) return policy;
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      return { ok: true as const, value: admissionPolicyPageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId: tribe.value.tribeId, viewerId: current.userId, renderedAt: now.toISOString(), policy: policy.value }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
