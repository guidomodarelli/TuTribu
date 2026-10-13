/** Own internal identifiers for a decision already staged by the admission owner. */
import type {AcademyMembershipFacts} from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";

export type ApplyApprovedAcademyMembershipCommand={tribeId:string;userId:string;decisionId:string};
export type ApplyApprovedAcademyMembershipResult=
  |{status:"joined"|"already_member";member:AcademyMembershipFacts}
  |{status:"blocked"|"admission_closed"};

/** Bound to the authoritative transaction by infrastructure composition. */
export interface AcademyApprovedMembershipWriter {
  apply(command:ApplyApprovedAcademyMembershipCommand):Promise<ApplyApprovedAcademyMembershipResult>;
}
