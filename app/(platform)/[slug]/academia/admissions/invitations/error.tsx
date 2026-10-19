"use client";
/** Contains private management failures without displaying native diagnostics. @module invitations-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only. @returns Safe Spanish feedback without serializing the thrown error. */
export default function Error({ reset }: { reset: () => void }) { return <AdmissionSettingsPage page="invitations"><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>; }
