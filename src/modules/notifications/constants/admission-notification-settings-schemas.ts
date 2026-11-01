/** Guards own public inputs and DTOs without revalidating PostgreSQL rows or provider replies. @module admission-notification-settings-schemas */
import { z } from "zod";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE, ADMISSION_NOTIFICATION_PREFERENCE_SOURCE, ADMISSION_NOTIFICATION_PREFERENCE_STATUS, ADMISSION_NOTIFICATION_PREFERENCE_REJECTION } from "./admission-notification-preference";
import { ADMISSION_EMAIL_SETTINGS_REJECTION, ADMISSION_EMAIL_SETTINGS_STATUS } from "./admission-notification-email-settings";
import { ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH } from "./admission-notification-settings-http";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";
import type { AdmissionNotificationEmailSettingsCommand } from "../domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationPreferenceChange } from "../domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceReadResult, AdmissionNotificationPreferenceChangeResult, AdmissionNotificationEmailSettingsView, AdmissionNotificationEmailSettingsReadResult, AdmissionNotificationEmailSettingsChangeResult, AdmissionNotificationEmailSettingsOperationResult } from "../application/results/admission-notification-settings-result";

/** Reuses the existing closed frequency vocabulary for own input and output. */
const mode = z.enum(ADMISSION_NOTIFICATION_PREFERENCE_MODE);
/** Keeps timezone normalization at the public input boundary; existence is a native owner check. */
const timeZone = z.string().trim().min(1).max(ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH);
/** Rejects recipient, actor, role and capability claims before application composition. */
export const admissionNotificationPreferenceChangeSchema = z.strictObject({ mode, expectedVersion: z.int().nonnegative() }) satisfies z.ZodType<AdmissionNotificationPreferenceChange>;
/** Requires the original confirmed intent and version for an independent email change. */
export const admissionNotificationEmailSettingsCommandSchema = z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedVersion: z.int().nonnegative(), enabled: z.boolean(), timeZone }) satisfies z.ZodType<AdmissionNotificationEmailSettingsCommand>;
/** Retains the distinction between a version-zero default and an actual stored preference. */
export const admissionNotificationPreferenceViewSchema = z.strictObject({ mode, version: z.int().nonnegative(), source: z.enum(ADMISSION_NOTIFICATION_PREFERENCE_SOURCE) }).refine((value) => value.source === ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.implicit ? value.version === 0 : value.version > 0);
/** Own read metadata excludes internal recipients, accounts, timestamps and provider resources. */
export const admissionNotificationPreferenceReadResultSchema = z.strictObject({ preference: admissionNotificationPreferenceViewSchema, canConfigureEmail: z.boolean() }) satisfies z.ZodType<AdmissionNotificationPreferenceReadResult>;
/** Explicit changes can retain an existing stored record or reject its stale observed version. */
export const admissionNotificationPreferenceChangeResultSchema = z.union([
  z.strictObject({ status: z.enum([ADMISSION_NOTIFICATION_PREFERENCE_STATUS.changed, ADMISSION_NOTIFICATION_PREFERENCE_STATUS.unchanged]), preference: z.strictObject({ mode, version: z.int().positive(), source: z.literal(ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.stored) }) }),
  z.strictObject({ status: z.literal(ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected), reason: z.literal(ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.versionConflict) }),
]) satisfies z.ZodType<AdmissionNotificationPreferenceChangeResult>;
/** Current and historical settings omit the native cut and selected credential state. */
export const admissionNotificationEmailSettingsViewSchema = z.strictObject({ enabled: z.boolean(), version: z.int().nonnegative(), timeZone }).refine((value) => !value.enabled || value.version > 0) satisfies z.ZodType<AdmissionNotificationEmailSettingsView>;
/** Closed platform requirement shared with every admission read; never a key, epoch or environment detail. */
export const admissionNotificationPlatformRequirementSchema = z.enum(PLATFORM_SECURITY_REQUIREMENT).nullable();
/** A current read also says whether the platform can protect a change, so the leader learns it before writing. */
export const admissionNotificationEmailSettingsReadResultSchema = z.strictObject({ settings: admissionNotificationEmailSettingsViewSchema, platformRequirement: admissionNotificationPlatformRequirementSchema }) satisfies z.ZodType<AdmissionNotificationEmailSettingsReadResult>;
/** Publishes only the original operation's safe confirmed result or registered progress. */
export const admissionNotificationEmailSettingsChangeResultSchema = z.union([
  z.strictObject({ status: z.enum([ADMISSION_EMAIL_SETTINGS_STATUS.changed, ADMISSION_EMAIL_SETTINGS_STATUS.unchanged]), settings: admissionNotificationEmailSettingsViewSchema }),
  z.strictObject({ status: z.literal(ADMISSION_EMAIL_SETTINGS_STATUS.rejected), reason: z.enum(ADMISSION_EMAIL_SETTINGS_REJECTION) }),
]) satisfies z.ZodType<AdmissionNotificationEmailSettingsChangeResult>;
/** Publishes only the original operation's safe confirmed result or registered progress. */
export const admissionNotificationEmailSettingsOperationSchema = z.union([
  z.strictObject({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }),
  z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.boolean(), result: admissionNotificationEmailSettingsChangeResultSchema }),
]) satisfies z.ZodType<AdmissionNotificationEmailSettingsOperationResult>;
