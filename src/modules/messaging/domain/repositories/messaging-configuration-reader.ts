/** Defines role-scoped read-only configuration without secret or provider access. @module messaging-configuration-reader */
import type {MessagingUsageContext} from "./messaging-usage-operations";

/** The server derives audience from current membership, never from query/body flags. */
export type MessagingConfigurationContext=MessagingUsageContext&{audience:"leader"|"guardian"};
/** Application owns the guarded view model supplied by the read adapter. */
export interface MessagingConfigurationReader<Result>{
  /** @param context - Current native account, exact tribe and current audience. @returns Authorized metadata only; read never initializes or contacts the provider. */
  read(context:MessagingConfigurationContext):Promise<Result>;
}
