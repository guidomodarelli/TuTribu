/** Captures immutable minimal decision provenance without contact/provider/verification material. @module admission-decision-evidence */
import type { AdmissionRequestEvidence } from "../entities/admission-request";
import { ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** Private evidence facts are history, never a new approval or global identity authority. */
export type AdmissionDecisionEvidence = { kind: "none" | "declared" | "base" | "local"; referenceId: string | null; verifiedAt: Date | null };

/** @param evidence - Original applied/declared request provenance. @returns A detached minimum snapshot, excluding contact, tokens, provider claims and code material. */
export function snapshotAdmissionDecisionEvidence(evidence: AdmissionRequestEvidence): AdmissionDecisionEvidence {
  if (evidence.kind === ADMISSION_EVIDENCE_KIND.base) return { kind: evidence.kind, referenceId: evidence.identityEvidenceId, verifiedAt: new Date(evidence.verifiedAt) };
  if (evidence.kind === ADMISSION_EVIDENCE_KIND.local) return { kind: evidence.kind, referenceId: evidence.proofId, verifiedAt: new Date(evidence.verifiedAt) };
  return { kind: evidence.kind, referenceId: null, verifiedAt: null };
}
