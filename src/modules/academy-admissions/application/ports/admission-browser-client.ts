/** Owns browser transport outcomes without importing provider or framework DTOs. @module admission-browser-client */
import type { AdmissionOverviewDto, AdmissionRequestDto, AdmissionOutcomeDto } from "../results/admission-flow-result-schemas";
import type { AdmissionOperationRecoveryDto } from "../results/admission-operation-recovery";
import type { AdmissionErrorCode } from "../results/admission-errors";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";

/** A transport failure never claims that a server operation was accepted; ambiguous writes retain the local intent. */
export type AdmissionBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: AdmissionErrorCode; message: string; uncertain: boolean } | { status: "aborted" };
/** An unfinished result must come from an actually registered original server operation. */
export type AdmissionStartedResponse = { state: "started"; operationId: string };
export type AdmissionBrowserSubmission = { operationId: string; confirmed: true; expectedPolicyVersion: number; message?: string; phone?: string; country?: string };
export type AdmissionBrowserCancellation = { operationId: string; confirmed: true; expectedVersion: number };

/** The route container is the only browser owner of account checks, requests, cancellation and draft recovery. */
export interface AdmissionBrowserClient {
  viewer(signal: AbortSignal): Promise<AdmissionBrowserResult<{ id: string } | null>>;
  overview(slug: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOverviewDto>>;
  own(slug: string, requestId: string | undefined, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionRequestDto | null>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationRecoveryDto>>;
  submit(slug: string, input: AdmissionBrowserSubmission, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOutcomeDto | AdmissionStartedResponse>>;
  cancel(slug: string, requestId: string, input: AdmissionBrowserCancellation, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionTransitionResult | AdmissionStartedResponse>>;
}
