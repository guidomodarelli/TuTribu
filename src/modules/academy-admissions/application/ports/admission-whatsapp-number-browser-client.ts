/** Defines own declared-number browser operations without exposing private server identity. @module admission-whatsapp-number-browser-client */
import type { AdmissionBrowserClient, AdmissionBrowserResult, AdmissionStartedResponse } from "./admission-browser-client";
import type { AdmissionWhatsappNumberResult } from "../../domain/repositories/admission-whatsapp-number-writer";

/** Retains the original canonical intent for explicit confirmation and recovery. */
export type AdmissionWhatsappNumberBrowserInput = { operationId: string; expectedVersion: number; confirmed: true; whatsappNumber: string | null };
/** Ordinary mutations and read-only reconciliation use the same native account and own request boundary. */
export interface AdmissionWhatsappNumberBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "own" | "operation"> {
  updateWhatsappNumber(slug: string, requestId: string, input: AdmissionWhatsappNumberBrowserInput, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionWhatsappNumberResult | AdmissionStartedResponse>>;
}
