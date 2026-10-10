/** Validates own messaging configuration inputs without a connection or a second country owner. */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_INPUT_CATEGORY } from "@/src/modules/messaging/constants/messaging-input";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_QUERY_LIMIT, ADMISSION_QUERY_INTEGER_PATTERN, ADMISSION_PUBLIC_CODE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import {MESSAGING_RESOURCE_KIND,MESSAGING_RESOURCE_CURSOR_MAXIMUM_OFFSET} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_CONNECTION_SECURITY_REASON} from "@/src/modules/messaging/constants/messaging-connection-security";

const operationFields = {
  operationId: z.uuid({ error: MESSAGING_INPUT_CATEGORY.operation }),
  confirmed: z.literal(true, { error: MESSAGING_INPUT_CATEGORY.confirmation }),
};
const countrySchema = z.string().trim().toUpperCase().refine((country) => isSupportedCountry(country as CountryCode), { error: MESSAGING_INPUT_CATEGORY.country });
const usageFields = {
  allowedCountries: z.array(countrySchema).refine((countries) => new Set(countries).size === countries.length, { error: MESSAGING_INPUT_CATEGORY.duplicateCountries }),
  verificationDailyLimit: z.int().min(0).max(MESSAGING_USAGE_LIMIT.verificationDailyMaximum, { error: MESSAGING_INPUT_CATEGORY.quota }),
  notificationDailyLimit: z.int().min(0).max(MESSAGING_USAGE_LIMIT.notificationDailyMaximum, { error: MESSAGING_INPUT_CATEGORY.quota }),
};

/** Explicit initialization uses only server defaults; country/quota edits require a later versioned PUT. */
export const messagingUsagePolicyCreateSchema = z.strictObject({ ...operationFields });

/** Countries are configurable before a connection; actual restrictions are rechecked by the writer/dispatcher. */
export const messagingUsagePolicyUpdateSchema = z.strictObject({
  ...operationFields, ...usageFields,
  expectedVersion: z.int({ error: MESSAGING_INPUT_CATEGORY.version }).positive({ error: MESSAGING_INPUT_CATEGORY.version }),
});

/** Messaging paths carry resources only; account, permissions and provider host are server-derived. */
export const messagingTribeParamsSchema = z.strictObject({ slug: z.string().regex(TRIBE_SLUG_PATTERN) });
export const messagingConnectionParamsSchema = messagingTribeParamsSchema.extend({ connectionId: z.uuid() });
export const messagingDiagnosticParamsSchema = messagingTribeParamsSchema.extend({ connectionId: z.uuid(), diagnosticId: z.uuid() });
export const messagingDeliveryParamsSchema = messagingTribeParamsSchema.extend({ deliveryId: z.uuid() });
/** Only decimal pagination and a bounded opaque cursor reach resource enumeration. */
const resourceCursorSchema=z.strictObject({tribeId:z.uuid(),connectionId:z.uuid(),configurationVersion:z.int().positive(),kind:z.enum(MESSAGING_RESOURCE_KIND),offset:z.int().nonnegative().max(MESSAGING_RESOURCE_CURSOR_MAXIMUM_OFFSET)});
/** Decodes only an own cursor, never a provider continuation or an authority token. */
const resourceCursorInput=z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).transform((value,context)=>{try{return JSON.parse(value) as unknown;}catch{context.addIssue({code:"custom",message:MESSAGING_INPUT_CATEGORY.version});return z.NEVER;}}).pipe(resourceCursorSchema);
export const messagingResourceQuerySchema = z.strictObject({ limit: z.union([z.int(), z.string().regex(ADMISSION_QUERY_INTEGER_PATTERN).transform(Number)]).pipe(z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize)).default(ADMISSION_QUERY_LIMIT.defaultPageSize), cursor: resourceCursorInput.optional() });
/** Saving a key does not validate, activate, diagnose or return it. */
export const messagingConnectionCreateSchema = z.strictObject({ ...operationFields, providerId: z.string().trim().min(1), apiKey: z.string().trim().min(1), name: z.string().trim().min(1).max(ADMISSION_LIMIT.displayNameCharacters) });
export const messagingConnectionValidateSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive() });
/** Authorized own resource references must still be verified by the integration owner. */
export const messagingConnectionConfigureSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive(), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), senderId: z.string().trim().min(1), templateId: z.string().trim().min(1).optional(), templateLanguage: z.string().trim().min(1).optional() }).refine((configuration)=>configuration.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?Boolean(configuration.templateId&&configuration.templateLanguage):configuration.templateId===undefined&&configuration.templateLanguage===undefined,{message:MESSAGING_INPUT_CATEGORY.template});
export const messagingConnectionDiagnosticSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive(), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), recipient: z.string().trim().min(1), country: countrySchema.optional(),currentChallengeId:z.uuid().optional() });
export const messagingDiagnosticVerifySchema = z.strictObject({ ...operationFields, verificationCode: z.string().regex(ADMISSION_PUBLIC_CODE_PATTERN) });
export const messagingConnectionActivateSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive() });
export const messagingConnectionSuspendSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive(), reason: z.enum(MESSAGING_CONNECTION_SECURITY_REASON) });
export const messagingConnectionDisconnectSchema = z.strictObject({ ...operationFields, expectedVersion: z.int().positive() });
