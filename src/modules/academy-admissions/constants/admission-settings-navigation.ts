/** Validates the allowlisted navigation parameters shared by the admission settings pages. @module admission-settings-navigation */
import { z } from "zod";
import { ADMISSION_POLICY_ENTRY_STEP, ADMISSION_SETTINGS_NAVIGATION_PARAM, ADMISSION_SETTINGS_RETURN_TARGET, type AdmissionPolicyEntryStep, type AdmissionSettingsReturnTarget } from "./admission-policy-flow";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "./admission-policy-browser";

/** Navigation intent of a settings page; it never carries a URL, an identity or a permission. */
export type AdmissionSettingsNavigation = { returnTo: AdmissionSettingsReturnTarget | null; step: AdmissionPolicyEntryStep | null };

const returnSchema = z.enum(ADMISSION_SETTINGS_RETURN_TARGET);
const stepSchema = z.enum(ADMISSION_POLICY_ENTRY_STEP);

/**
 * Separates the navigation parameters from the rest of the query, so each page loader keeps validating an empty query.
 * Unknown or repeated values are ignored instead of failing the page.
 *
 * @param query - Untrusted resolved search params.
 * @returns The validated navigation intent and the remaining query.
 */
export function readAdmissionSettingsNavigation(query: Record<string, string | string[] | undefined>): { navigation: AdmissionSettingsNavigation; query: Record<string, string | string[] | undefined> } {
  const { [ADMISSION_SETTINGS_NAVIGATION_PARAM.returnTo]: returnTo, [ADMISSION_SETTINGS_NAVIGATION_PARAM.step]: step, ...rest } = query;
  const parsedReturn = returnSchema.safeParse(returnTo), parsedStep = stepSchema.safeParse(step);
  return { navigation: { returnTo: parsedReturn.success ? parsedReturn.data : null, step: parsedStep.success ? parsedStep.data : null }, query: rest };
}

/** @param slug - Tribe slug. @param step - Rules step to open. @returns The rules page path that opens that step. */
export function admissionPolicyStepHref(slug: string, step: AdmissionPolicyEntryStep): string {
  return `/${encodeURIComponent(slug)}/${ADMISSION_POLICY_SETTINGS_SEGMENT}?${new URLSearchParams({ [ADMISSION_SETTINGS_NAVIGATION_PARAM.step]: step })}`;
}

/** @param path - Settings page path. @returns The same path carrying the allowlisted return to the rules review. */
export function withPolicyReviewReturn(path: string): string {
  return `${path}?${new URLSearchParams({ [ADMISSION_SETTINGS_NAVIGATION_PARAM.returnTo]: ADMISSION_SETTINGS_RETURN_TARGET.policyReview })}`;
}
