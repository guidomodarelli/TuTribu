/** Defines historical arrival attribution without personal invitation permissions. @module legacy-admission-invitation-reader */

/** Identifies an active impersonal link owned by exactly one tribe. */
export type LegacyAdmissionInvitation = { id: string; tribeId: string };
/** Carries only server-derived account/tribe scope and the proposed opaque arrival token. */
export type LegacyAdmissionInvitationQuery = { userId: string; sessionId: string; tribeId: string; token: string };

/** Reads attribution after the admission owner has locked and authorized its current account/tribe. */
export interface LegacyAdmissionInvitationReader {
  /**
   * Finds one current link without consuming it or granting admission exemptions.
   * @param query - Actual server account/tribe and boundary-normalized token.
   * @returns Minimal attribution, or absence for a crossed, revoked or unknown link.
   */
  findActiveByToken(query: LegacyAdmissionInvitationQuery): Promise<LegacyAdmissionInvitation | null>;
}
