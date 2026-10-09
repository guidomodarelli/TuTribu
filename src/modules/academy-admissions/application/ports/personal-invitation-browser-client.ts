/** Defines personal applicant transport without exposing provider/session DTOs to the UI. @module personal-invitation-browser-client */
import type { z } from "zod";
import type { AdmissionBrowserClient, AdmissionBrowserResult } from "./admission-browser-client";
import type { personalInvitationBrowserOverviewSchema } from "../../constants/personal-invitation-browser";

/** Account checks, original ledger reads and explicit canje use the existing admission boundary. */
export interface PersonalInvitationBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "operation" | "submit"> {
  overview(token: string, proofId: string | undefined, signal: AbortSignal): Promise<AdmissionBrowserResult<z.infer<typeof personalInvitationBrowserOverviewSchema>>>;
  changeAccount(signal: AbortSignal): Promise<AdmissionBrowserResult<null>>;
}
