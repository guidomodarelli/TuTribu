"use client";
/** Contains private management failures without displaying native diagnostics. @module invitations-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Framework retry only. @returns Safe Spanish feedback without serializing the thrown error. */
export default function AdmissionInvitationsError({ retry }: { retry: () => void }) { return <AdmissionSettingsPage page="invitations"><AdmissionRouteError embedded retry={retry} /></AdmissionSettingsPage>; }
