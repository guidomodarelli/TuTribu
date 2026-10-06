/** Declares current usage configuration facts without persistence or provider DTOs. */

/** Contains only checked destination restrictions consumed by admission configuration. */
export type MessagingCountryRestriction = { country: string; channel: "sms" | "whatsapp"; allowed: boolean };

/** Own minimal facts; null before explicit initialization has no fabricated version. */
export type MessagingCountryPolicy = {
  tribeId: string;
  version: number;
  allowedCountries: readonly string[];
  platformRestrictions: readonly MessagingCountryRestriction[];
};

/** A transaction-bound reader must authorize its current caller before reading. */
export interface MessagingCountryPolicyRepository {
  /**
   * Reads the sole country configuration and current selected capability facts.
   * @param tribeId - Tenant resolved by the server and reauthorized by the adapter.
   * @returns Current facts or absence, with no write, lease or provider effect.
   */
  readCountryPolicy(tribeId: string): Promise<MessagingCountryPolicy | null>;
}
