/** Derives standard country input labels, never provider availability or a second saved policy. @module messaging-usage-country-choices */
import "server-only";
import { getCountries } from "libphonenumber-js/max";
import type { MessagingUsageCountryChoice } from "../../application/commands/messaging-usage-draft";
import { MESSAGING_USAGE_PRESENTATION_LOCALE } from "../../constants/messaging-usage";
/** Region names in the presentation locale, built once per server instance. */
const REGION_NAMES = new Intl.DisplayNames([MESSAGING_USAGE_PRESENTATION_LOCALE], { type: "region" });
/** @returns Stable localized options computed server-side once for SSR and retained as props across hydration. */
export function getMessagingUsageCountryChoices(): MessagingUsageCountryChoice[] {
  return getCountries().map((country) => ({ value: country, label: REGION_NAMES.of(country) ?? country })).sort((left, right) => left.label.localeCompare(right.label, MESSAGING_USAGE_PRESENTATION_LOCALE));
}
