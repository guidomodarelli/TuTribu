/** Names activation requirements independently of provider transport failures. @module messaging-connection-lifecycle-constants */
/** Requires local confirmation within an inclusive twenty-four-hour activation window. */
export const MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS = 86_400_000;
/** Preserves deterministic own outcomes for the application owner's safe error mapping. */
export const MESSAGING_CONNECTION_REQUIREMENT = { versionConflict: "version_conflict", ownerChanged: "owner_changed", resourceUnavailable: "resource_unavailable", credentialNotValidated: "credential_not_validated", testMode: "test_mode", capabilityRequired: "capability_required", diagnosticRequired: "diagnostic_required", countriesRequired: "countries_required", secretVersionRequired: "secret_version_required" } as const;
/** Compares only effective configuration; unrelated timestamps never create a version. */
export const MESSAGING_CONNECTION_CONFIGURATION_FIELDS = ["emailSenderId", "smsSenderId", "whatsappSenderId", "whatsappTemplateId", "whatsappTemplateLanguage"] as const;
