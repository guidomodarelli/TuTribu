/** Keeps the admission heading and section row mounted across admission pages. @module admissions-layout */
import type { ReactNode } from "react";
import { AdmissionWorkspaceFrame } from "@/components/academy-admissions/admission-workspace-frame";

/** @param props - The admission page. @returns The page inside the shared frame; route params resolve on the client, never in this layout. */
export default function AdmissionsLayout({ children }: { children: ReactNode }) {
  return <AdmissionWorkspaceFrame>{children}</AdmissionWorkspaceFrame>;
}
