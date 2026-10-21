"use client";
/** Keeps allowlist render failures under its own heading instead of the review boundary, without diagnostics. @module allowlist-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only; the original exception is never rendered. @returns This page's own heading and safe Spanish recovery. */
export default function AllowlistError({ reset }: { reset: () => void }) { return <AdmissionSettingsPage page="allowlist"><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>; }
