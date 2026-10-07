/** Names stable own input categories; routes translate them to safe Spanish feedback. */
export const MESSAGING_INPUT_CATEGORY = {
  version: "messaging_version_invalid", operation: "messaging_operation_invalid",
  confirmation: "messaging_confirmation_required", country: "messaging_country_invalid",
  duplicateCountries: "messaging_countries_duplicated", quota: "messaging_quota_invalid",
  template:"messaging_template_configuration_invalid",
} as const;
