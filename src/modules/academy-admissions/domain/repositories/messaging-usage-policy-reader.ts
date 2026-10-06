/**
 * Declares admission-owned country facts instead of importing messaging DTOs.
 *
 * @module messaging-usage-policy-reader
 */

/** Describes an actually checked platform/provider restriction for one channel. */
export type AdmissionCountryRestriction = {
  country: string;
  channel: "sms" | "whatsapp";
  allowed: boolean;
};

/** Projects the sole editable country configuration for an authorized tribe. */
export type AdmissionMessagingUsagePolicy = {
  tribeId: string;
  version: number;
  allowedCountries: readonly string[];
  platformRestrictions: readonly AdmissionCountryRestriction[];
};

/** Reads current owner-projected facts; absence does not fabricate a version. */
export interface MessagingUsagePolicyReader {
  /**
   * Reads current usage configuration under the caller's authorized tribe scope.
   *
   * @param tribeId - Tribe already resolved and authorized by the use case.
   * @returns Current minimal facts, or null before explicit initialization.
   */
  readForTribe(tribeId: string): Promise<AdmissionMessagingUsagePolicy | null>;
}
