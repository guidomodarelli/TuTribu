"use client";
/** Contains private management failures without displaying native diagnostics. @module invitations-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
/** @param props - Framework retry only. @returns Safe Spanish feedback without serializing the thrown error. */
export default function Error({ reset }: { reset: () => void }) { return <AdmissionRouteError reset={reset} />; }
