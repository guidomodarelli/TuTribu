/** Supplies the admission compatibility policy with current facts from its own country port. */
import type { MessagingUsagePolicyReader } from "@/src/modules/academy-admissions/domain/repositories/messaging-usage-policy-reader";
import { validateAdmissionPolicyConfiguration, type AdmissionPolicyConfiguration, type AdmissionPolicyConfigurationFacts, type AdmissionPolicyConfigurationResult } from "@/src/modules/academy-admissions/domain/entities/admission-policy";

/** A transaction-bound owner calls this only after resolving current actor and capability readiness. */
export class ValidateAdmissionPolicyConfigurationUseCase {
  /** @param usage - Admission-owned port; the composition root supplies a collaborator in the same transaction. */
  constructor(private readonly usage: MessagingUsagePolicyReader) {}

  /**
   * Reads the sole editable country list immediately before deciding compatibility.
   * This does not activate settings or authorize a dispatch; its writer must keep
   * the current transaction/locks and perform the effective CAS itself.
   * @param policy - Proposed settings; no second country list is accepted.
   * @param readiness - Private current readiness facts supplied by the authorized owner.
   * @returns Pure compatibility with the current usage projection.
   */
  async execute(policy: AdmissionPolicyConfiguration, readiness: Omit<AdmissionPolicyConfigurationFacts, "usagePolicy">): Promise<AdmissionPolicyConfigurationResult> {
    const usagePolicy = await this.usage.readForTribe(policy.tribeId);
    return validateAdmissionPolicyConfiguration(policy, { ...readiness, usagePolicy });
  }
}
