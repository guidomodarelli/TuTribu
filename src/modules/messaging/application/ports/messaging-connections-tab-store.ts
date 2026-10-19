/** Keeps the workspace tab across the Google confirmation without keys, destinations, codes or operation payloads. @module messaging-connections-tab-store */
import type {MessagingConnectionsTab} from "../../constants/messaging-connections-workspace";

/** A navigation convenience only: it grants no authority and never replaces an original operation reference. */
export interface MessagingConnectionsTabStore{
  /** @param viewerId - Current verified own viewer. @param slug - Current route. @returns The remembered tab, once, or absence when missing, invalid or unreadable. */
  take(viewerId:string,slug:string):MessagingConnectionsTab|null;
  /** @param viewerId - Current verified own viewer. @param slug - Current route. @param tab - Section to reopen after returning. @returns Whether it was remembered; failure never blocks the confirmation. */
  remember(viewerId:string,slug:string,tab:MessagingConnectionsTab):boolean;
}
