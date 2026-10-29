/** Owns safe request-history props independently of storage, transport and native authentication. @module admission-review-history-page-state */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import type { AdmissionReviewHistoryPageDto } from "../../constants/admission-review-history-schemas";
import type { AdmissionReviewSelection } from "./admission-review-selection";

/** No session identifier, actor identifier or private failure cause crosses into the component tree. */
export type AdmissionReviewHistoryPageState = {
  kind: "ready"; slug: string; viewerId: string; renderedAt: string;
  filters: AdmissionReviewSelection; page: AdmissionReviewHistoryPageDto; hasPrevious: boolean;
} | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
