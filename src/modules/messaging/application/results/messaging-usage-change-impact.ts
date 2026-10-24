/** Describes a validated proposal against the sole current usage owner without changing counters. @module messaging-usage-change-impact */
import type { MessagingUsageUpdate } from "../../domain/repositories/messaging-usage-operations";
import type { MessagingUsagePolicyResult } from "./messaging-usage-policy-result";

/** Preserves both configuration values so a proposed increase cannot look already saved. */
export type MessagingQuotaChangeImpact = { previous: number; proposed: number };
/** Contains only the current version and the differences of an already validated own proposal. */
export type MessagingUsageChangeImpact = {
  configurationVersion: number;
  verification: MessagingQuotaChangeImpact;
  notification: MessagingQuotaChangeImpact;
  addedCountries: string[];
  removedCountries: string[];
  increasesQuota: boolean;
  reducesQuota: boolean;
  hasChanges: boolean;
};

/**
 * Compares an own validated draft without assigning a persisted version or touching consumption.
 * @param current - Latest authorized configuration; a recovered historical result is not substituted here.
 * @param proposed - Normalized input already accepted by the browser input boundary.
 * @returns The exact differences to explain before the leader's new confirmation.
 */
export function describeMessagingUsageChangeImpact(
  current: MessagingUsagePolicyResult,
  proposed: Pick<MessagingUsageUpdate, "allowedCountries" | "verificationDailyLimit" | "notificationDailyLimit">,
): MessagingUsageChangeImpact {
  const currentCountries = new Set(current.allowedCountries);
  const proposedCountries = new Set(proposed.allowedCountries);
  const addedCountries = proposed.allowedCountries.filter((country) => !currentCountries.has(country));
  const removedCountries = current.allowedCountries.filter((country) => !proposedCountries.has(country));
  const verification = { previous: current.verificationDailyLimit, proposed: proposed.verificationDailyLimit };
  const notification = { previous: current.notificationDailyLimit, proposed: proposed.notificationDailyLimit };
  return {
    configurationVersion: current.version,
    verification,
    notification,
    addedCountries,
    removedCountries,
    increasesQuota: verification.proposed > verification.previous || notification.proposed > notification.previous,
    reducesQuota: verification.proposed < verification.previous || notification.proposed < notification.previous,
    hasChanges: addedCountries.length > 0 || removedCountries.length > 0
      || verification.proposed !== verification.previous || notification.proposed !== notification.previous,
  };
}
