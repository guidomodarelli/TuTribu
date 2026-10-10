"use client";
/** Selects the shared global creator for exact policy recency without starting OAuth or retrying. @module admission-policy-reauthentication-client */
import type { AdmissionPolicyReauthenticationClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-reauthentication-client";
import { createReauthenticationIntentBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-intent-browser-client";
/** @param transport - Own same-origin HTTP port. @returns Cancellation-aware creation limited to exact policy purposes. */
export function createAdmissionPolicyReauthenticationClient(transport: typeof fetch = fetch): AdmissionPolicyReauthenticationClient { return createReauthenticationIntentBrowserClient(transport); }
/** No request begins merely by importing this creator. */
export const admissionPolicyReauthenticationClient = createAdmissionPolicyReauthenticationClient();
