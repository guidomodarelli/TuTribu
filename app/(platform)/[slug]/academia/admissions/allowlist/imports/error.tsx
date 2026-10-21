"use client";
/** Keeps CSV import render failures under its own heading instead of the allowlist boundary, without diagnostics. @module allowlist-import-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only; the original exception is never rendered. @returns This page's own heading and safe Spanish recovery. */
export default function AllowlistImportError({ reset }: { reset: () => void }) { return <AdmissionSettingsPage page="allowlistImport"><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>; }
