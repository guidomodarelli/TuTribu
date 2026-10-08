/** Validates own mutable-resource HTTP inputs once, never provider responses or Postgres rows. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_INPUT_CATEGORY, ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_PUBLIC_SOURCE, ADMISSION_DECISION, ADMISSION_QUERY_LIMIT, ADMISSION_QUERY_INTEGER_PATTERN, ADMISSION_PUBLIC_CODE_PATTERN, ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";

/** Mutations must carry a stable UUID and an explicit fresh confirmation. */
const operationFields = {
  operationId: z.uuid({ error: ADMISSION_INPUT_CATEGORY.operation }),
  confirmed: z.literal(true, { error: ADMISSION_INPUT_CATEGORY.confirmation }),
};
/** Verification UUID identity is canonical before its textual representation enters the immutable ledger fingerprint. */
const verificationOperationIdSchema = operationFields.operationId.transform((operationId) => operationId.toLowerCase());
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

/** Canonical path identities are data; no actor, role or audience may be supplied. */
export const admissionTribeParamsSchema = z.strictObject({ slug: z.string().regex(TRIBE_SLUG_PATTERN) });
/** These reads do not accept account, role, audience, key, policy overrides or hidden actions. */
export const admissionEmptyQuerySchema = z.strictObject({});
export const admissionRequestParamsSchema = admissionTribeParamsSchema.extend({ requestId: z.uuid() });
/** An explicit own history reference selects a resource, never another applicant or reviewer audience. */
export const admissionOwnRequestQuerySchema = z.strictObject({ admissionRequestId: z.uuid().optional() });
export const admissionChallengeParamsSchema = admissionTribeParamsSchema.extend({ challengeId: z.uuid().transform((challengeId) => challengeId.toLowerCase()) });
export const admissionOperationParamsSchema = admissionTribeParamsSchema.extend({ operationId: z.uuid() });
export const admissionAllowlistParamsSchema = admissionTribeParamsSchema.extend({ entryId: z.uuid() });
export const admissionInvitationParamsSchema = admissionTribeParamsSchema.extend({ invitationId: z.uuid() });
export const admissionImportParamsSchema = admissionTribeParamsSchema.extend({ importId: z.uuid() });

/** Query coercion accepts decimal strings only, never boolean/object input. */
const pageSizeSchema = z.union([z.int(), z.string().regex(ADMISSION_QUERY_INTEGER_PATTERN).transform(Number)]).pipe(z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize)).default(ADMISSION_QUERY_LIMIT.defaultPageSize);
const pageQueryFields = { limit: pageSizeSchema, cursor: z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).optional(), search: z.string().trim().max(ADMISSION_QUERY_LIMIT.searchCharacters).optional() };
/** Review filters remain bounded and tenant-local; current permissions are derived separately. */
const reviewCursorSchema = z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).transform((cursor) => cursor.split(ADMISSION_REVIEW_CURSOR_SEPARATOR)).pipe(z.tuple([z.iso.datetime({ offset: true }), z.uuid()])).transform(([submittedAt, id]) => ({ submittedAt, id }));
export const admissionReviewQuerySchema = z.strictObject({ ...pageQueryFields, cursor: reviewCursorSchema.optional(), status: z.enum(ADMISSION_REQUEST_STATUS).optional(), source: z.enum(ADMISSION_PUBLIC_SOURCE).optional(), needsVerification: z.enum(["true", "false"]).transform((value) => value === "true").optional(), submittedFrom: z.iso.datetime({ offset: true }).optional(), submittedUntil: z.iso.datetime({ offset: true }).optional() }).refine((query) => !query.submittedFrom || !query.submittedUntil || new Date(query.submittedFrom) <= new Date(query.submittedUntil));
export const admissionAllowlistQuerySchema = z.strictObject({ ...pageQueryFields, status: z.enum(ALLOWLIST_ENTRY_STATUS).optional() });

/** The account email/source/identity evidence are server-owned; the body can select only the explicit route intent. */
export const admissionSubmissionSchema = z.strictObject({ ...operationFields, expectedPolicyVersion: expectedVersionSchema, invitationToken: z.string().min(1).optional(), legacyInvitationToken: z.string().min(1).optional(), phone: z.string().trim().min(1).optional(), country: countrySchema.optional(), proofId: z.uuid().optional(), message: z.string().trim().max(ADMISSION_LIMIT.internalMessageCharacters).optional() }).refine((command) => !(command.invitationToken && command.legacyInvitationToken));
/** Proof attachment cannot create another request or replace the contact owned by that request. */
export const admissionProofAttachmentSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, proofId: z.uuid() }).transform((command) => ({ ...command, operationId: command.operationId.toLowerCase(), proofId: command.proofId.toLowerCase() }));
export const admissionCancellationSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, internalReason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters).optional() });
/** A review decision requires a meaningful internal reason; its external message stays separate. */
export const admissionDecisionSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, decision: z.enum(ADMISSION_DECISION), internalReason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters), externalMessage: z.string().trim().max(ADMISSION_LIMIT.externalMessageCharacters).optional() });
/** Explicit selections are deduped case-insensitively before any writer effects. */
export const admissionBatchDecisionSchema = z.strictObject({ ...operationFields, decision: z.enum(ADMISSION_DECISION), internalReason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters), externalMessage: z.string().trim().max(ADMISSION_LIMIT.externalMessageCharacters).optional(), items: z.array(z.strictObject({ requestId: z.uuid().transform((id) => id.toLowerCase()), expectedVersion: expectedVersionSchema })).min(1).max(ADMISSION_LIMIT.batchRequestCount) }).refine((command) => new Set(command.items.map((item) => item.requestId)).size === command.items.length);
/** Retry changes cadence only; role, suspension and memberships cannot be rewritten here. */
export const admissionRetryEligibilitySchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, internalReason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters) });

/** Policy input excludes epoch/activation, countries and counters; only the owner derives those facts. */
export const admissionPolicyInitializationSchema = z.strictObject({ ...operationFields });
export const admissionPolicyUpdateSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, mode: z.enum(ADMISSION_POLICY_MODE), contactType: z.enum(ADMISSION_CONTACT_TYPE), isOpen: z.boolean(), allowCommonExceptions: z.boolean(), requiresAdditionalVerification: z.boolean(), phoneChannel: z.enum(ADMISSION_PHONE_CHANNEL).nullable(), allowSmsAlternative: z.boolean(), messagingConnectionId: z.uuid().nullable(), messagingConnectionVersion: expectedVersionSchema.nullable() }).refine((command) => (command.messagingConnectionId === null) === (command.messagingConnectionVersion === null));
export const admissionPolicyActivationSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema });
export const admissionPolicyPauseSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, reason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters) });
/** Route purpose, text, code, sender and account identity stay server-owned. */
export const admissionChallengeCreateSchema = z.strictObject({ ...operationFields, operationId: verificationOperationIdSchema, expectedPolicyVersion: expectedVersionSchema, phone: z.string().trim().min(1).optional(), country: countrySchema.optional(), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), requestId: z.uuid().transform((requestId) => requestId.toLowerCase()).optional(), invitationToken: z.string().min(1).optional(), legacyInvitationToken: z.string().min(1).optional() }).refine((command) => !(command.invitationToken && command.legacyInvitationToken));
export const admissionChallengeVerifySchema = z.strictObject({ ...operationFields, operationId: verificationOperationIdSchema, verificationCode: z.string().regex(ADMISSION_PUBLIC_CODE_PATTERN) });
export const admissionChallengeResendSchema = z.strictObject({ ...operationFields, operationId: verificationOperationIdSchema, useSmsAlternative: z.literal(true).optional() });
/** CSV text has an independent byte ceiling; row/header parsing belongs to the import owner. */
export const admissionImportPreviewSchema = z.strictObject({ ...operationFields, contactType: z.enum(ADMISSION_CONTACT_TYPE), expectedPolicyVersion: expectedVersionSchema, csvText: z.string().refine((text) => new TextEncoder().encode(text).byteLength <= ADMISSION_LIMIT.csvByteCount) });
export const admissionImportConfirmationSchema = z.strictObject({ ...operationFields, expectedVersion: expectedVersionSchema, selectedRows: z.array(z.int().min(1).max(ADMISSION_LIMIT.csvDataRowCount)).min(1).max(ADMISSION_LIMIT.csvDataRowCount) }).refine((command) => new Set(command.selectedRows).size === command.selectedRows.length);
