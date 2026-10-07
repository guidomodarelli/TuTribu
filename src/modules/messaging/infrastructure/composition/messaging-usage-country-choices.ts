/** Derives standard country input labels, never provider availability or a second saved policy. @module messaging-usage-country-choices */
import "server-only";
import { getCountries } from "libphonenumber-js/max";
import type { MessagingUsageCountryChoice } from "../../application/commands/messaging-usage-draft";
import { MESSAGING_USAGE_PRESENTATION_LOCALE } from "../../constants/messaging-usage";
/** @returns Stable localized options computed server-side once for SSR and retained as props across hydration. */
export function getMessagingUsageCountryChoices(): MessagingUsageCountryChoice[] {
  const names = new Intl.DisplayNames([MESSAGING_USAGE_PRESENTATION_LOCALE], { type: "region" });
  return getCountries().map((country) => ({ value: country, label: names.of(country) ?? country })).sort((left, right) => left.label.localeCompare(right.label, MESSAGING_USAGE_PRESENTATION_LOCALE));
}
