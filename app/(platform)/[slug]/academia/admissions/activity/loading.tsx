/** Preserves an immediate own leaf loading state on page loads and sibling navigation. @module admission-activity-loading */
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @returns Deterministic public loading copy without administrative values. */
export default function AdmissionActivityLoading() {
  return <AdmissionSettingsPage title="Consumo e historial de admisión"><p role="status">Cargando consumo e historial…</p></AdmissionSettingsPage>;
}
