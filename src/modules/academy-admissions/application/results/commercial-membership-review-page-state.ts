/** Safe SSR props of the commercial membership review, shared by the server loader and the rules container. @module commercial-membership-review-page-state */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import type { CommercialMembershipReviewList } from "../../domain/entities/commercial-membership-review";

/** The current list, or a contained Spanish failure that never hides the rules page. */
export type CommercialMembershipReviewPageState = { kind: "ready"; list: CommercialMembershipReviewList } | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
