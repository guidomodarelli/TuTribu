/** Owns private audit persistence within the original business transaction. @module admission-audit-repository */
import type { AdmissionAuditEvent } from "../entities/admission-audit-event";

/** An audit append does not grant authority, commit independently or publish metric labels. */
export interface AdmissionAuditRepository {
  /** @param event - Fixed owner-generated audit fact. @returns After staging in the original transaction. */
  append(event: AdmissionAuditEvent): Promise<void>;
}
