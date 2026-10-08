/** Declares current usage configuration facts without persistence or provider DTOs. */
import type { MESSAGING_CONNECTION_SLOT } from "@/src/modules/messaging/constants/messaging-connection";

/** Contains only checked destination restrictions consumed by admission configuration. */
export type MessagingCountryRestriction = { country: string; channel: "sms" | "whatsapp"; allowed: boolean };

/** Own minimal facts; null before explicit initialization has no fabricated version. */
export type MessagingCountryPolicy = {
  tribeId: string;
  version: number;
  allowedCountries: readonly string[];
  platformRestrictions: readonly MessagingCountryRestriction[];
};

/** Display-only configured choices are distinct from sending eligibility and checked provider restrictions. */
export type MessagingApplicantCountryChoices = { tribeId: string; version: number; allowedCountries: readonly string[] };
/** Applicant reads retain current native session authority without table-wide permissions or quota fields. */
export interface MessagingApplicantCountryChoicesReader {
  /** @param tribeId - Already resolved tenant. @param sessionId - Server-derived actual session. @returns Sole configured choices or absence, never sending permission. */
  readCountryChoicesForApplicant(tribeId: string, sessionId: string): Promise<MessagingApplicantCountryChoices | null>;
}

/** A transaction-bound reader must authorize its current caller before reading. */
export interface MessagingCountryPolicyRepository {
  /**
   * Reads the sole country configuration and current selected capability facts.
   * @param tribeId - Tenant resolved by the server and reauthorized by the adapter.
   * @returns Current facts or absence, with no write, lease or provider effect.
   */
  readCountryPolicy(tribeId: string): Promise<MessagingCountryPolicy | null>;
}

/** Explicit server-owned resource scope for management/diagnostic country facts. */
export type MessagingConnectionCountryScope = { tribeId: string; connectionId: string; connectionVersion: number; slot: (typeof MESSAGING_CONNECTION_SLOT)[keyof typeof MESSAGING_CONNECTION_SLOT] };
/** Separate method prevents a candidate override from changing admission's default selected projection. */
export interface MessagingConnectionCountryPolicyRepository {
  /**
   * @param scope - Exact current selected/candidate resource, independently checked by persistence.
   * @returns Sole country policy and checked restrictions of only that live resource version.
   */
  readCountryPolicyForConnection(scope: MessagingConnectionCountryScope): Promise<MessagingCountryPolicy | null>;
}
