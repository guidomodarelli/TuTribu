/** Owns current reviewer facts without exposing infrastructure or provider DTOs to application. @module admission-review-reader */
import type { AdmissionRequest } from "../entities/admission-request";
import type { PendingAdmissionReviewFacts } from "../policies/admission-eligibility";
import type { AdmissionCommandScope } from "./admission-repositories";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Current request and evaluation facts remain private until an audience-specific application projection. */
export type AdmissionReviewRecord = {
  request: AdmissionRequest;
  applicantName: string;
  review: PendingAdmissionReviewFacts;
  internalReason: string | null;
  externalMessage: string | null;
  approvalSupported: boolean;
};

/** Explicit bounded reviewer filters never select account, role or provider authority. */
export type AdmissionReviewFilters = {
  limit: number; status?: AdmissionRequest["status"]; source?: AdmissionRequest["source"]; cursor?: { submittedAt: string; id: string };
  search?: string; needsVerification?: boolean; requiresExceptionReason?: boolean; submittedFrom?: string; submittedUntil?: string;
};

/**
 * Requirement read in the same reviewer transaction, with the checks every decision runs before signing: while it is present the
 * platform cannot protect a decision, so none is offered. Null when decisions can be protected.
 */
type ReviewPlatformFact = { platformRequirement: PlatformSecurityRequirement | null };
/** One bounded page of current records and the platform requirement that applies to all of them. */
export type AdmissionReviewRecordPage = ReviewPlatformFact & { records: AdmissionReviewRecord[]; nextCursor: string | null };
/** One current record and the platform requirement that applies to it. */
export type AdmissionReviewRecordDetail = ReviewPlatformFact & { record: AdmissionReviewRecord };

/** Read queries never create a request, decision, ledger, delivery or membership. */
export interface AdmissionReviewReader {
  readList(scope: AdmissionCommandScope, query: AdmissionReviewFilters): Promise<AdmissionReviewRecordPage>;
  readDetail(scope: AdmissionCommandScope, admissionRequestId: string): Promise<AdmissionReviewRecordDetail | null>;
}
