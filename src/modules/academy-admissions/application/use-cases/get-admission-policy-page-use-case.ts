/** Builds one current leader SSR policy projection through inward read ports. @module get-admission-policy-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { LiveAccountTribePageUseCase, type TribePageQuery } from "@/src/modules/shared/application/live-account-tribe-page-read";
import { ADMISSION_TRIBE_PAGE_FAILURES } from "./admission-tribe-scope";
import type { GetAdmissionPolicyUseCase } from "./get-admission-policy-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import { admissionPolicyPageStateSchema } from "../results/admission-policy-page-state";
import type { admissionOperationFailure } from "../results/admission-operation-failure";
import type { AdmissionFailure } from "../results/admission-errors";

/** The current leader query remains independent of keyrings and provider clients. */
export class GetAdmissionPolicyPageUseCase extends LiveAccountTribePageUseCase<AuthenticatedAccount, AdmissionFailure, { ok: false; failure: AdmissionFailure }, ReturnType<typeof admissionOperationFailure>> {
  /** @param accounts - Native global identity. @param readers - Current authorized policy and canonical tribe resolution. @param clock - Final render clock. */
  constructor(accounts: AuthenticatedAccountProvider, private readonly readers: { policy: Pick<GetAdmissionPolicyUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, clock: () => Date) { super(accounts, readers, clock, ADMISSION_TRIBE_PAGE_FAILURES); }

  /** @param query - Once-validated slug and safe correlation. @returns Own current state or a controlled failure without private partial props. */
  execute(query: TribePageQuery) {
    return this.readPage(query, async ({ tribeId, confirm }) => {
      const policy = await this.readers.policy.execute({ tribeId, requestId: query.requestId });
      if (!policy.ok) return policy;
      const { current, now } = await confirm();
      return { ok: true as const, value: admissionPolicyPageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId, viewerId: current.userId, renderedAt: now.toISOString(), policy: policy.value }) };
    });
  }
}
