/** Provides a deterministic leaf skeleton while list runtime input and authority resolve. @module allowlist-loading */
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @returns Safe server-rendered loading content without browser or session access. */
export default function Loading() { return <AdmissionSettingsPage title="Lista de habilitados"><p role="status">Consultando la lista…</p></AdmissionSettingsPage>; }
