/** Owns safe page contracts and stable browser routing for current admission notification settings. @module admission-notification-settings-page-constants */
import { z } from "zod";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "@/src/modules/academy-admissions/constants/admission-route-input";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionNotificationPreferenceViewSchema, admissionNotificationEmailSettingsViewSchema, admissionNotificationEmailSettingsCommandSchema, admissionNotificationPlatformRequirementSchema } from "./admission-notification-settings-schemas";
import type { AdmissionNotificationSettingsPageState } from "../application/results/admission-notification-settings-page-state";

/** The leaf exists independently of admission policy and OTP configuration. */
export const ADMISSION_NOTIFICATION_SETTINGS_SEGMENT = "academia/admissions/notifications";
/** Local recovery belongs to one viewer and tribe, without storing credentials or proof. */
export const ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX = "tutribu-admission-email-settings";
/** Owns the explicit safe SSR state vocabulary independently of browser request phases. */
export const ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND = { ready: "ready", unavailable: "unavailable" } as const;
/** Browser requests always use the application's relative same-origin resources. */
export const ADMISSION_NOTIFICATION_SETTINGS_API = { prefix: "/api/tribes", segment: "admissions", preference: "notification-preferences", email: "email-settings", operation: "operations", preferenceMethod: "PATCH", emailMethod: "POST" } as const;
/** Own browser result discriminators are independent of HTTP status and business outcome. */
export const ADMISSION_NOTIFICATION_SETTINGS_BROWSER_STATUS = { ready: "ready", failed: "failed", aborted: "aborted" } as const;
/** Server-side page failure logs carry only operation and own safe codes. */
export const ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG = { feature: "notifications", operation: "load_admission_notification_settings", failed: "Admission notification settings page could not load safe state" } as const;
/** Rejects browser-supplied role, recipient, account or alternative action before native composition. */
export const admissionNotificationSettingsPageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema });
/** An actual leader must have an authorized email projection; guardians never receive one, nor its platform requirement. */
export const admissionNotificationSettingsPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND.ready), slug: admissionTribeParamsSchema.shape.slug, tribeId: z.uuid(), viewerId: z.string().min(1), preference: admissionNotificationPreferenceViewSchema, canConfigureEmail: z.boolean(), email: admissionNotificationEmailSettingsViewSchema.nullable(), platformRequirement: admissionNotificationPlatformRequirementSchema }).refine((state) => state.canConfigureEmail ? state.email !== null : state.email === null && state.platformRequirement === null),
  z.strictObject({ kind: z.literal(ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND.unavailable), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]) satisfies z.ZodType<AdmissionNotificationSettingsPageState>;
/** Storage retains an exact prior command, not the editor's current consent. */
export const admissionNotificationEmailSettingsStoredIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: admissionTribeParamsSchema.shape.slug, input: admissionNotificationEmailSettingsCommandSchema });
