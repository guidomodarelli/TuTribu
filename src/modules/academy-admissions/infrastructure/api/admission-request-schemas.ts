/** Validates own mutable-resource HTTP inputs once, never provider responses or Postgres rows. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_INPUT_CATEGORY, ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";

/** Mutations must carry a stable UUID and an explicit fresh confirmation. */
const operationFields = {
  operationId: z.uuid({ error: ADMISSION_INPUT_CATEGORY.operation }),
  confirmed: z.literal(true, { error: ADMISSION_INPUT_CATEGORY.confirmation }),
};
const expectedVersionSchema = z.int({ error: ADMISSION_INPUT_CATEGORY.version }).positive({ error: ADMISSION_INPUT_CATEGORY.version });
const editableNameSchema = z.string({ error: ADMISSION_INPUT_CATEGORY.name }).trim().max(ADMISSION_LIMIT.displayNameCharacters, { error: ADMISSION_INPUT_CATEGORY.name });
const countrySchema = z.string().trim().toUpperCase().refine((country) => isSupportedCountry(country as CountryCode), { error: ADMISSION_INPUT_CATEGORY.country });

/** Creation chooses version one in the writer; browser versions or owner bindings are rejected. */
export const allowlistEntryCreateSchema = z.strictObject({
  ...operationFields, contactType: z.enum(ADMISSION_CONTACT_TYPE), identity: z.string().trim().min(1),
  country: countrySchema.optional(), displayName: editableNameSchema.nullable().optional(),
});

/** Allows only name/status edits; contact and binding identity cannot be reassigned here. */
export const allowlistEntryUpdateSchema = z.strictObject({
  ...operationFields, expectedVersion: expectedVersionSchema,
  displayName: editableNameSchema.nullable().optional(),
  status: z.enum(ALLOWLIST_ENTRY_STATUS).optional(),
}).refine((command) => command.displayName !== undefined || command.status !== undefined, { error: ADMISSION_INPUT_CATEGORY.fields });

/** A rename never changes recipient, constraints, token or the invitation deadline. */
export const personalInvitationRenameSchema = z.strictObject({
  ...operationFields, expectedVersion: expectedVersionSchema,
  internalName: editableNameSchema.min(1, { error: ADMISSION_INPUT_CATEGORY.name }),
});

/** A token is minted server-side once; creation preserves the explicit no-list acknowledgement. */
export const personalInvitationCreateSchema = z.strictObject({
  ...operationFields, internalName: editableNameSchema.min(1),
  recipient: z.strictObject({ type: z.enum(ADMISSION_CONTACT_TYPE), value: z.string().trim().min(1), country: countrySchema.optional() }),
  requiresAllowlist: z.boolean(), acknowledgeNoAllowlist: z.literal(true).optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
}).refine((command) => command.requiresAllowlist || command.acknowledgeNoAllowlist === true, { error: ADMISSION_INPUT_CATEGORY.confirmation });

/** Expected version protects revocation's confirmed resource state from concurrent redemption. */
export const personalInvitationRevokeSchema = z.strictObject({
  ...operationFields, expectedVersion: expectedVersionSchema,
  reason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters),
});
