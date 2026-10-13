/** Owns current reviewer facts without exposing infrastructure or provider DTOs to application. @module admission-review-reader */
import type { AdmissionRequest } from "../entities/admission-request";
import type { PendingAdmissionReviewFacts } from "../policies/admission-eligibility";
import type { AdmissionCommandScope } from "./admission-repositories";

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
  search?: string; needsVerification?: boolean; submittedFrom?: string; submittedUntil?: string;
};

/** Read queries never create a request, decision, ledger, delivery or membership. */
export interface AdmissionReviewReader {
  readList(scope: AdmissionCommandScope, query: AdmissionReviewFilters): Promise<{ records: AdmissionReviewRecord[]; nextCursor: string | null }>;
  readDetail(scope: AdmissionCommandScope, admissionRequestId: string): Promise<AdmissionReviewRecord | null>;
}
