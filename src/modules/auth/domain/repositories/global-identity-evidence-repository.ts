/** Own contracts for persisting a verified global capture after native account/session creation. */
import type {GlobalIdentityEvidence,GoogleIdentityEvidenceCandidate} from "../entities/global-identity-evidence";

/** Identifies the actual global session and account, never a browser permission flag. */
export type GlobalIdentityEvidenceScope={userId:string;accountId:string;sessionId:string};
/** Excludes transient nonce and authentication recency from the durable identity capture. */
export type CaptureGlobalIdentityEvidenceCommand=GlobalIdentityEvidenceScope&{
  evidence:Omit<GoogleIdentityEvidenceCandidate,"nonce"|"authenticatedAt">;
};
/** A mismatch remains insufficient and does not replace a current capture. */
export type CaptureGlobalIdentityEvidenceResult=
  |{status:"stored";evidence:GlobalIdentityEvidence}
  |{status:"identity_mismatch"};

/** Stores minimal history and returns evidence only while current identity relationships agree. */
export interface GlobalIdentityEvidenceRepository {
  capture(command:CaptureGlobalIdentityEvidenceCommand):Promise<CaptureGlobalIdentityEvidenceResult>;
  getCurrent(scope:GlobalIdentityEvidenceScope):Promise<GlobalIdentityEvidence|null>;
}
