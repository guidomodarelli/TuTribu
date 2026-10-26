"use client";
/** Keeps notification settings render failures under their own heading instead of the review boundary, without diagnostics. @module admission-notification-settings-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only; the original exception is never rendered. @returns This page's own heading and safe Spanish recovery. */
export default function AdmissionNotificationSettingsError({ retry }: { retry: () => void }) { return <AdmissionSettingsPage page="notifications"><AdmissionRouteError embedded retry={retry} /></AdmissionSettingsPage>; }
