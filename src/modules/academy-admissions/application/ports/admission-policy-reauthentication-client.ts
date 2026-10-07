/** Owns explicit policy recency creation without starting OAuth or treating browser success as authority. @module admission-policy-reauthentication-client-port */
import type { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
export type AdmissionPolicyReauthenticationOperation = typeof REAUTHENTICATION_OPERATION.updateAdmissionPolicy | typeof REAUTHENTICATION_OPERATION.activateAdmissionPolicy | typeof REAUTHENTICATION_OPERATION.pauseAdmissionPolicy;
export interface AdmissionPolicyReauthenticationClient {
  create(command: { tribeId: string; resourceId: string; operation: AdmissionPolicyReauthenticationOperation; returnPath: string; confirmed: true }, signal: AbortSignal): Promise<{ status: "ready"; href: string } | { status: "failed" } | { status: "aborted" }>;
}
