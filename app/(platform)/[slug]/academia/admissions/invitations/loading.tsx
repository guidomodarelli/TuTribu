/** Shows only a deterministic private management skeleton while native input and authority resolve. @module invitations-loading */
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @returns Safe loading without account, storage, clocks or hidden actions. */
export default function Loading() { return <AdmissionSettingsPage title="Invitaciones personales"><p role="status">Consultando las invitaciones…</p></AdmissionSettingsPage>; }
