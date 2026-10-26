/** Defines own public field contracts, never schemas for storage or provider data. @module admission-contract-fields */
import { z } from "zod";
import { ADMISSION_MASK_MARKER_PATTERN, ADMISSION_LOCAL_HREF_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** Canonical own resource identity; upper/lower case cannot create distinct selections. */
export const admissionPublicIdSchema = z.uuid().transform((id) => id.toLowerCase());
/** Existing resources always have a positive version; absence has a separate state. */
export const admissionPublicVersionSchema = z.int().positive();
/** Every public time includes an explicit offset. */
export const admissionPublicInstantSchema = z.iso.datetime({ offset: true });
/** Public navigation is local and cannot change URL authority through slash normalization. */
export const admissionLocalHrefSchema = z.string().regex(ADMISSION_LOCAL_HREF_PATTERN);
/** A public contact includes masking and evidence kind, without a raw identity or verification boolean. */
export const admissionMaskedContactSchema = z.object({ type: z.enum(ADMISSION_CONTACT_TYPE), maskedValue: z.string().min(1).regex(ADMISSION_MASK_MARKER_PATTERN), evidenceKind: z.enum(ADMISSION_EVIDENCE_KIND) });
