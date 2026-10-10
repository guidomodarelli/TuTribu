/** Declares admission-owned current role/resource facts without provider or persistence contracts. */
import type { AdmissionActorFacts, AdmissionAction } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import type { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";

/** Resource identities are selected by the owning server operation, never by a table name. */
export type AdmissionResourceIdentity = { kind: (typeof ADMISSION_RESOURCE_KIND)[keyof typeof ADMISSION_RESOURCE_KIND]; id: string };
export type AdmissionAuthorizationResource = { id: string; tribeId: string; applicantUserId?: string };
export type AdmissionContextCommand = { tribeId: string; action: AdmissionAction; requestId: string; resource?: AdmissionResourceIdentity; sensitiveOperation?: ReauthenticationOperation };

/** These are private current facts; each writer independently rechecks them under its final locks. */
export type AuthorizedAdmissionContext = {
  userId: string; sessionId: string; tribeId: string; requestId: string; action: AdmissionAction;
  role: AdmissionActorFacts["role"]; membershipStatus: AdmissionActorFacts["status"];
  resourceId: string; applicantUserId?: string; sensitiveOperation?: ReauthenticationOperation; authenticatedAt?: Date; validUntil?: Date;
};

export interface AdmissionAuthorizationReader {
  /** Reads the current actor for an existing tribe; absence never invents membership. */
  getCurrentActor(tribeId: string, userId: string): Promise<AdmissionActorFacts | null>;
  /** Reads minimal resource ownership only after current actor permission has been established. */
  getResource(tribeId: string, resource: AdmissionResourceIdentity): Promise<AdmissionAuthorizationResource | null>;
}
