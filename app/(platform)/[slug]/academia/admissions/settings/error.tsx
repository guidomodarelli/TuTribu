"use client";
/** Keeps rule-editing render failures under the rules heading instead of the review boundary, without diagnostics. @module admission-policy-settings-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only; the original exception is never rendered. @returns This page's own heading and safe Spanish recovery. */
export default function AdmissionPolicySettingsError({ retry }: { retry: () => void }) { return <AdmissionSettingsPage page="policy"><AdmissionRouteError embedded retry={retry} /></AdmissionSettingsPage>; }
