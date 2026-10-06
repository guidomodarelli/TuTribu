/** Allowlists only own public DTO fields; private storage/provider material is never validated here. */
import { z } from "zod";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_INVITATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ALLOWLIST_ENTRY_SOURCE, ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import type { AllowlistEntryResult, PersonalInvitationResult } from "./admission-resource-result";

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
