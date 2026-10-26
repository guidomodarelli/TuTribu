/** Names closed administrative surfaces independently of the returned private data. @module admission-administrative-exposure-constants */
import type { AdmissionAdministrativeExposure } from "../domain/entities/admission-administrative-exposure";
/** Each concrete reader selects its fixed surface; the browser cannot claim one. */
export const ADMISSION_ADMINISTRATIVE_SURFACE = { allowlist: "allowlist", report: "allowlist_report", invitations: "invitations", reviews: "request_details" } as const satisfies Readonly<Record<string, AdmissionAdministrativeExposure["surface"]>>;
