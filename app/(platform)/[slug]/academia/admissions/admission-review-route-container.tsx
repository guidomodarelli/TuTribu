"use client";
/** Owns route snapshot identity before mounting the reviewer workflow container. @module admission-review-route-container */
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import { AdmissionReviewContainer } from "./admission-review-container";

/** @param props - Guarded server snapshot and optional own transport port. @returns A workflow instance belonging to this route's current account and selection. */
export function AdmissionReviewRouteContainer({ initialState, client }: { initialState: AdmissionReviewPageState; client?: AdmissionReviewBrowserClient }) {
  const key = initialState.kind === "ready" ? `${initialState.slug}:${initialState.viewerId}:${initialState.selected?.id ?? ""}` : initialState.code;
  return <AdmissionReviewContainer key={key} initialState={initialState} client={client} />;
}
