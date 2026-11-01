/** Describes minimal own notification configuration views without contacts, identity or precise internal cuts. @module admission-notification-settings-result */
import type { AdmissionNotificationPreferenceMode } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsRejectionReason } from "../../domain/entities/admission-notification-email-settings";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Distinguishes a role default from the recipient's explicit saved frequency. */
export type AdmissionNotificationPreferenceView = { mode: AdmissionNotificationPreferenceMode; version: number; source: "implicit" | "stored" };
/** Exposes a current UI capability hint; it never authorizes an email settings mutation. */
export type AdmissionNotificationPreferenceReadResult = { preference: AdmissionNotificationPreferenceView; canConfigureEmail: boolean };
/** Preserves a personal conflict as an explicit rejected outcome rather than a claimed save. */
export type AdmissionNotificationPreferenceChangeResult =
  | { status: "changed" | "unchanged"; preference: AdmissionNotificationPreferenceView & { source: "stored" } }
  | { status: "rejected"; reason: "notification_preference_version_conflict" };
/** Selects current or historical email configuration without its native cut or provider metadata. */
export type AdmissionNotificationEmailSettingsView = { enabled: boolean; version: number; timeZone: string };
/** Current email configuration and the closed platform requirement that blocks changing it, or null when a change can be protected. */
export type AdmissionNotificationEmailSettingsReadResult = { settings: AdmissionNotificationEmailSettingsView; platformRequirement: PlatformSecurityRequirement | null };
/** Keeps the original ledger's rejection separate from a confirmed effective write or no-op. */
export type AdmissionNotificationEmailSettingsChangeResult =
  | { status: "changed" | "unchanged"; settings: AdmissionNotificationEmailSettingsView }
  | { status: "rejected"; reason: AdmissionNotificationEmailSettingsRejectionReason };
/** Retains original UUID and terminal/progress semantics without replacing a replay with current settings. */
export type AdmissionNotificationEmailSettingsOperationResult =
  | { state: "started"; operationId: string }
  | { state: "completed"; operationId: string; replayed: boolean; result: AdmissionNotificationEmailSettingsChangeResult };
