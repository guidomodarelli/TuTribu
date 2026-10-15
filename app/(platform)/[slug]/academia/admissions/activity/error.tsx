"use client";
/** Contains runtime render failures without displaying their causes or stale private props. @module admission-activity-error */
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
/** @param props - Framework retry only; the original exception is never rendered. @returns One main landmark and explicit recovery. */
export default function AdmissionActivityError({ reset }: { reset: () => void }) {
  return <AdmissionSettingsPage title="Consumo e historial de admisión"><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>;
}
