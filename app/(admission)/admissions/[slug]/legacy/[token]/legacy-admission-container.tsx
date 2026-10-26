"use client";

/** Reads historical URL material only in the browser workflow; SSR props contain no token. @module legacy-admission-container */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { LEGACY_ADMISSION_ARRIVAL, LEGACY_ADMISSION_COPY } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";
import { createLegacyAdmissionBrowserScope } from "@/lib/academy-admissions/legacy-admission-scope";
import { buildLegacyAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
import { AdmissionContainer } from "../../admission-container";

/** @param props - Safe deterministic SSR snapshot. @returns Common policy workflow with reference-only original recovery for this arrival. */
export function LegacyAdmissionContainer({ initialState }: { initialState: AdmissionPageState }) {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [reference, setReference] = useState<{ token: string; scope: string } | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void createLegacyAdmissionBrowserScope(token).then(
      (scope) => { if (!controller.signal.aborted) { setReference({ token, scope }); setFailedToken(null); } },
      () => { if (!controller.signal.aborted) setFailedToken(token); },
    );
    return () => controller.abort();
  }, [token]);
  // A malformed token, or a browser without native hashing, fails the same way on every reload: explain it and leave, never retry.
  if (!LEGACY_ADMISSION_ARRIVAL.canonicalTokenPattern.test(token)) return <AdmissionRouteError message={LEGACY_ADMISSION_COPY.invalidLink} />;
  if (failedToken === token) return <AdmissionRouteError message={LEGACY_ADMISSION_COPY.unsupportedBrowser} />;
  return <AdmissionContainer key={`${slug}:${token}`} initialState={initialState} legacyInvitationToken={token} arrivalScope={reference?.token === token ? reference.scope : undefined} arrivalReturnPath={buildLegacyAdmissionEntryRoute(slug, token)} />;
}
