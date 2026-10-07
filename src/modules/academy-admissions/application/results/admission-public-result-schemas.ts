/** Allowlists only own public DTO fields; private storage/provider material is never validated here. */
import { z } from "zod";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_INVITATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ALLOWLIST_ENTRY_SOURCE, ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import type { AllowlistEntryResult, PersonalInvitationResult } from "./admission-resource-result";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionPublicError } from "./admission-errors";
import { ADMISSION_INVITATION_PUBLIC_PATH_PREFIX, ADMISSION_PUBLIC_URL_PROTOCOL } from "@/src/modules/academy-admissions/constants/admission-management-contract";

export { admissionRequestSchema, admissionReviewSchema, admissionOverviewSchema, admissionOutcomeSchema, admissionBatchResultSchema, createAdmissionOperationStateSchema } from "./admission-flow-result-schemas";
export type { AdmissionRequestDto, AdmissionReviewDto, AdmissionOverviewDto, AdmissionOutcomeDto, AdmissionBatchResultDto, OperationStateDto } from "./admission-flow-result-schemas";
export { admissionPolicySchema, allowlistImportSchema } from "./admission-management-result-schemas";
export type { AdmissionPolicyDto, AllowlistImportDto } from "./admission-management-result-schemas";

const resourceIdSchema = z.uuid();
const versionSchema = z.int().positive();
const instantSchema = z.iso.datetime({ offset: true });
const contactTypeSchema = z.enum(ADMISSION_CONTACT_TYPE);
const nameSchema = z.string().max(ADMISSION_LIMIT.displayNameCharacters);

/** Leader-only metadata; binding owners and protected indexes are deliberately absent. */
export const allowlistEntrySchema = z.object({
  id: resourceIdSchema, version: versionSchema, contactType: contactTypeSchema, identity: z.string().min(1),
  displayName: nameSchema.nullable().optional(), status: z.enum(ALLOWLIST_ENTRY_STATUS), source: z.enum(ALLOWLIST_ENTRY_SOURCE),
  createdAt: instantSchema, updatedAt: instantSchema,
}) satisfies z.ZodType<AllowlistEntryResult>;

/** Metadata/replay never return the invitation URL, plaintext token or token hash. */
export const personalInvitationSchema = z.object({
  id: resourceIdSchema, version: versionSchema, internalName: nameSchema.min(1),
  recipient: z.object({ type: contactTypeSchema, value: z.string().min(1), country: z.string().optional() }),
  requiresAllowlist: z.boolean(), expiresAt: instantSchema.nullable(), status: z.enum(ADMISSION_INVITATION_STATUS),
}) satisfies z.ZodType<PersonalInvitationResult>;

/**
 * Binds the one-time creation URL to configured origin and the public token route; replay uses metadata above.
 * @param trustedOrigin - Deployment origin supplied by server configuration, never request headers/body.
 * @returns The initial creation contract, including a server-created version-one invitation.
 */
export function createPersonalInvitationCreationSchema(trustedOrigin: string) {
  const origin = new URL(trustedOrigin).origin;
  return z.object({ invitation: personalInvitationSchema.extend({ version: z.literal(1) }), invitationUrl: z.url().refine((value) => {
    const url = new URL(value);
    const tokenPath = url.pathname.startsWith(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX)
      ? url.pathname.slice(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX.length) : "";
    return url.origin === origin && !url.username && !url.password
      && (url.protocol === ADMISSION_PUBLIC_URL_PROTOCOL.secure || url.protocol === ADMISSION_PUBLIC_URL_PROTOCOL.local)
      && tokenPath.length > 0 && !tokenPath.includes("/") && !url.search && !url.hash;
  }) });
}
/** Typed own metadata used by props and browser consumers. */
export type AllowlistEntryDto = z.infer<typeof allowlistEntrySchema>;
export type PersonalInvitationDto = z.infer<typeof personalInvitationSchema>;

/** Public error copy comes only from the own catalogue, never an upstream exception message. */
export const admissionPublicErrorSchema = z.object({
  code: z.enum(ADMISSION_ERROR_CODE), message: z.string(), requestId: z.string().min(1),
  retryAt: instantSchema.optional(),
  operation: z.object({ operationId: resourceIdSchema, state: z.enum(OPERATION_STATE) }).optional(),
}).refine((error) => error.message === ADMISSION_ERROR_MESSAGE[error.code])
  .refine((error) => error.code !== ADMISSION_ERROR_CODE.operationUnresolved || error.operation?.state === OPERATION_STATE.started) satisfies z.ZodType<AdmissionPublicError>;
