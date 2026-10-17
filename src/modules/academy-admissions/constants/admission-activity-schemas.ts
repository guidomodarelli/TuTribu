/** Guards only the owned history DTO and user-controlled query, never storage rows. @module admission-activity-schemas */
import { z } from "zod";
import { ADMISSION_ACTIVITY_RESOURCE, ADMISSION_ACTIVITY_QUERY, ADMISSION_ACTIVITY_EVENTS, ADMISSION_ACTIVITY_RULES, ADMISSION_ACTIVITY_CAUSES, ADMISSION_ACTIVITY_STATES, ADMISSION_ACTIVITY_SURFACES, ADMISSION_ACTIVITY_RESOURCE_KINDS, ADMISSION_ACTIVITY_RETENTION_OWNERS, ADMISSION_ACTIVITY_COUNTRY_PATTERN } from "./admission-activity";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CREDENTIAL_MODE } from "@/src/modules/messaging/constants/messaging-credential-validation";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { ADMISSION_CONTACT_TYPE } from "./admission-contact";
import { admissionPageSizeSchema } from "./admission-route-input";
import { ADMISSION_NOTIFICATION_AUDIT_SOURCES } from "@/src/modules/notifications/constants/admission-notification-audit";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL } from "./admission-policy";

/** Keeps opaque reference and count schemas reusable without accepting free bodies. */
const referenceSchema = z.uuid().nullable().optional();
/** Preserves absent versions without manufacturing an initial revision. */
const versionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional();
/** The owner emits finite integral counters and elapsed milliseconds. */
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Projects only the owned historical policy flags; identity, actor and version stay on the enclosing event. */
const admissionPolicyAuditSnapshotSchema = z.strictObject({
  mode: z.enum(ADMISSION_POLICY_MODE), contactType: z.enum(ADMISSION_CONTACT_TYPE), isOpen: z.boolean(),
  allowCommonExceptions: z.boolean(), requiresAdditionalVerification: z.boolean(),
  requiresWhatsappNumber: z.boolean().optional(),
  phoneChannel: z.enum(ADMISSION_PHONE_CHANNEL).nullable(), allowSmsAlternative: z.boolean(),
  messagingConnectionId: z.uuid().nullable(), messagingConnectionVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  verificationEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), activatedAt: z.iso.datetime({ precision: 3 }).nullable(),
});
/** Every optional change field belongs to a known internal producer. */
export const admissionActivityChangesSchema = z.strictObject({
  enabled: z.boolean().optional(), timeZone: z.string().min(1).optional(),
  fromPolicy: admissionPolicyAuditSnapshotSchema.nullable().optional(), toPolicy: admissionPolicyAuditSnapshotSchema.optional(),
  fromState: z.enum(ADMISSION_ACTIVITY_STATES).nullable().optional(), toState: z.enum(ADMISSION_ACTIVITY_STATES).nullable().optional(),
  fromStatus: z.enum(ADMISSION_ACTIVITY_STATES).nullable().optional(), toStatus: z.enum(ADMISSION_ACTIVITY_STATES).nullable().optional(),
  previousVersion: versionSchema, previousRequestVersion: versionSchema, policyVersion: versionSchema, verificationEpoch: versionSchema, configurationVersion: versionSchema, previousConfigurationVersion: versionSchema,
  channel: z.enum(MESSAGING_PUBLIC_CHANNEL).nullable().optional(), requestId: referenceSchema, proofId: referenceSchema, challengeId: referenceSchema, decisionId: referenceSchema,
  invitationId: referenceSchema, importId: referenceSchema, connectionId: referenceSchema, previousConnectionId: referenceSchema, connectionVersion: versionSchema, previousConnectionVersion: versionSchema,
  attemptId: referenceSchema, authorizedUsagePolicyVersion: versionSchema, originalDeliveryId: referenceSchema, targetConnectionId: referenceSchema, originalConnectionId: referenceSchema,
  originalConnectionVersion: versionSchema, originalFromState: z.enum(ADMISSION_ACTIVITY_STATES).optional(), originalToState: z.enum(ADMISSION_ACTIVITY_STATES).optional(),
  previousOriginalVersion: versionSchema, originalVersion: versionSchema, originalAttemptId: referenceSchema, originalAuthorizedUsagePolicyVersion: versionSchema,
  contactType: z.enum(ADMISSION_CONTACT_TYPE).optional(), fromAuthorizationRevoked: z.boolean().nullable().optional(), toAuthorizationRevoked: z.boolean().optional(),
  allowedCountries: z.array(z.string().regex(ADMISSION_ACTIVITY_COUNTRY_PATTERN)).optional(), verificationDailyLimit: countSchema.optional(), notificationDailyLimit: countSchema.optional(),
  membershipInstanceId: referenceSchema, fromRole: z.enum(TRIBE_MEMBER_ROLE).nullable().optional(), toRole: z.enum(TRIBE_MEMBER_ROLE).nullable().optional(),
  surface: z.enum(ADMISSION_ACTIVITY_SURFACES).optional(), itemCount: countSchema.optional(),
  resourceKind: z.enum(ADMISSION_ACTIVITY_RESOURCE_KINDS).optional(),
  owner: z.enum(ADMISSION_ACTIVITY_RETENTION_OWNERS).optional(), processed: countSchema.optional(), remaining: z.boolean().optional(), cutoff: z.iso.datetime().optional(),
  purpose: z.enum(MESSAGING_KEY_PURPOSE).optional(),
  previousKeyId: z.string().nullable().optional(), activeKeyId: z.string().nullable().optional(), securityEpoch: z.string().optional(),
  previousCredentialState: z.enum(MESSAGING_CREDENTIAL_PUBLIC_STATE).optional(), credentialState: z.enum(MESSAGING_CREDENTIAL_PUBLIC_STATE).optional(), credentialMode: z.enum(MESSAGING_CREDENTIAL_MODE).optional(),
  obligationId: referenceSchema, requestVersion: versionSchema, sourceEvent: z.enum(ADMISSION_NOTIFICATION_AUDIT_SOURCES).optional(), audience: z.enum(ADMISSION_NOTIFICATION_AUDIENCE).nullable().optional(), durationMs: countSchema.nullable().optional(),
});
/** Returns only a bounded private page with millisecond display time and an exact microsecond cursor. */
export const admissionActivityPageSchema = z.strictObject({
  tribeId: z.uuid(), items: z.array(z.strictObject({
    id: z.uuid(), actorUserId: z.string().nullable(), operationId: z.uuid().nullable(), tribeLifecycleOperationId: z.uuid().nullable(),
    resourceType: z.enum(ADMISSION_ACTIVITY_RESOURCE), resourceId: z.uuid().nullable(), eventType: z.enum(ADMISSION_ACTIVITY_EVENTS),
    rule: z.enum(ADMISSION_ACTIVITY_RULES).nullable(), cause: z.enum(ADMISSION_ACTIVITY_CAUSES).nullable(), resourceVersion: z.number().int().positive().nullable(),
    changes: admissionActivityChangesSchema, createdAt: z.iso.datetime({ precision: 3 }),
  })).max(ADMISSION_ACTIVITY_QUERY.maximumLimit), nextCursor: z.string().nullable(),
});
/** HTTP filters select resources only; account, role and permission cannot be supplied. */
export const admissionActivityQuerySchema = z.strictObject({
  limit: admissionPageSizeSchema,
  resourceType: z.enum(ADMISSION_ACTIVITY_RESOURCE).optional(), resourceId: z.uuid().optional(),
  cursor: z.string().optional().transform((value, context) => {
    if (value === undefined) return undefined;
    const [at, id, extra] = value.split(ADMISSION_ACTIVITY_QUERY.cursorSeparator);
    if (extra !== undefined || !z.iso.datetime().safeParse(at).success || !z.uuid().safeParse(id).success) { context.addIssue({ code: "custom", message: "Cursor de actividad inválido." }); return z.NEVER; }
    return { at, id };
  }),
});
