"use client";
/** Keeps private runtime failures out of the early usage page's recovery surface. @module admission-messaging-settings-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework error reset. @returns Safe local recovery without rendering the raw exception. */
export default function AdmissionMessagingSettingsError({ reset }: { reset: () => void }) { return <AdmissionSettingsPage page="usage"><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>; }
