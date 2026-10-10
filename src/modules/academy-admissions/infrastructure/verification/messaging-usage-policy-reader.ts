/** Adapts messaging-owned current facts to the admission-owned port without sharing DTOs. */
import "server-only";
import type { MessagingUsagePolicyReader, AdmissionMessagingUsagePolicy } from "@/src/modules/academy-admissions/domain/repositories/messaging-usage-policy-reader";
import type { MessagingCountryPolicyRepository } from "@/src/modules/messaging/domain/repositories/messaging-usage-policy-repository";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** The composition root injects the messaging collaborator bound to the same transaction. */
export class AdmissionMessagingUsagePolicyReader implements MessagingUsagePolicyReader {
  /** @param messaging - Private current-state port with mandatory owner authorization. */
  constructor(private readonly messaging: MessagingCountryPolicyRepository) {}

  /**
   * Projects only countries/version/restrictions and maps expected owner failures.
   * @param tribeId - Admission's already resolved scope; messaging checks it again.
   * @returns Admission-owned facts without persistence or provider metadata.
   */
  async readForTribe(tribeId: string): Promise<AdmissionMessagingUsagePolicy | null> {
    try {
      const current = await this.messaging.readCountryPolicy(tribeId);
      if (!current) return null;
      if (current.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      return { tribeId, version: current.version, allowedCountries: [...current.allowedCountries], platformRestrictions: current.platformRestrictions.map((restriction) => ({ country: restriction.country, channel: restriction.channel, allowed: restriction.allowed })) };
    } catch (error) {
      if (error instanceof MessagingSecretAccessError) throw new AdmissionOperationError(error.code === MESSAGING_ERROR_CODE.permissionDenied ? ADMISSION_ERROR_CODE.permissionDenied : ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error });
      throw error;
    }
  }
}
