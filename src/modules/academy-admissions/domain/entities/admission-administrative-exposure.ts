/** Identifies already authorized administrative reads without carrying their private contents. @module admission-administrative-exposure */
/** The resource and version are the exact returned entity, or the tribe/null pair for a page. */
export type AdmissionAdministrativeExposure = {
  surface: "allowlist" | "allowlist_report" | "invitations" | "request_details";
  resourceId: string;
  resourceVersion: number | null;
  itemCount: number;
};
