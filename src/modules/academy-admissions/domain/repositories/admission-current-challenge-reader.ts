/** Defines an owned exact-contact read without issuer, quota consumption or transport authority. @module admission-current-challenge-reader */
import type { AdmissionContact } from "../value-objects/admission-contact";
import type { AdmissionChallengeSnapshot, AdmissionVerificationAccountScope } from "./admission-contact-verification";

/** A server-owned original is only a candidate for an explicitly confirmed replacement. */
export type AdmissionCurrentChallengeSelection = { current: { operationId: string; challenge: AdmissionChallengeSnapshot; requiresReplacement: boolean } | null };
/** Identity, canonical contact and purpose are derived before infrastructure, never accepted as browser authority. */
export type AdmissionCurrentChallengeQuery = AdmissionVerificationAccountScope & { previousRequestId: string; expectedPolicyVersion: number; channel: "email" | "sms" | "whatsapp"; contact: AdmissionContact };
/** Reading a candidate neither renews the code nor creates a proof or outgoing obligation. */
export interface AdmissionCurrentChallengeReader {
  /** @param query - Own current proposal and terminal request lineage. @returns The exact current challenge original or no matching candidate. */
  readCurrent(query: AdmissionCurrentChallengeQuery): Promise<AdmissionCurrentChallengeSelection>;
}
