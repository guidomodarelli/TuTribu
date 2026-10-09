/** Defines private read-only personal eligibility facts separately from recipient-facing DTOs and redemption effects. @module personal-invitation-overview-reader */
import type { AdmissionCommandScope } from "./admission-repositories";
import type { AdmissionSubmissionFacts } from "../policies/admission-eligibility";
import type { AdmissionOverviewFacts } from "./admission-query-reader";

/** Only inward facts contain the recipient; the application projects it out after current-account checks. */
export type PersonalInvitationOverviewFacts = {
  overview: AdmissionOverviewFacts;
  eligibility: AdmissionSubmissionFacts;
  tokenAvailable: boolean;
  recipientMatchesAccount: boolean;
  redeemedByUserId: string | null;
  redeemedRequestId: string | null;
};

/** Reading a token never claims an operation, sends a code or changes invitation/request state. */
export interface PersonalInvitationOverviewReader {
  /** @param query - Opaque proposed token and correlation only. @param scope - Native current account/session. @returns Private facts or generic absence, without a recipient lookup DTO. */
  readOverview(query: { token: string; requestId: string; proofId?: string }, scope: Pick<AdmissionCommandScope, "userId" | "sessionId">): Promise<PersonalInvitationOverviewFacts | null>;
}
