/** Describes only the review window the user has already loaded and its optional selected detail. @module admission-review-visible-snapshot */
import type { AdmissionReviewDto } from "./admission-flow-result-schemas";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** A background read does not load an arbitrary global queue or alter decision drafts; it carries the platform requirement its last page read. */
export type AdmissionReviewVisibleSnapshot = { readonly items: AdmissionReviewDto[]; readonly nextCursor: string | null; readonly selected: AdmissionReviewDto | null; readonly platformRequirement: PlatformSecurityRequirement | null };
