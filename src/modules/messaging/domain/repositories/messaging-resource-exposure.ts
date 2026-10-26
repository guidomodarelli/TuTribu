/** Records only an already authorized own resource page, without SDK objects or private contents. @module messaging-resource-exposure */
import type { AuthorizedMessagingContext } from "./messaging-repositories";
/** A fixed caller selects the kind; the count describes only the own returned page. */
export type MessagingResourceExposure = { kind: "senders" | "templates"; itemCount: number };
/** Implementations recheck current resource authority before committing the read fact. */
export interface MessagingResourceExposureRecorder {
  /** @param context - Exact native account/session/resource scope. @param exposure - Fixed kind and own selected count only. @returns After confirmed authorization and recording, never a provider action. */
  record(context: AuthorizedMessagingContext, exposure: MessagingResourceExposure): Promise<void>;
}
