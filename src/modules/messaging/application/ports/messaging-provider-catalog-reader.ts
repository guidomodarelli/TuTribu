/** Describes implemented provider metadata through an own read-only application port. @module messaging-provider-catalog-reader */
import type { MessagingConnectionConfigurationInput } from "../../domain/repositories/messaging-connection-configuration";

/** Reuses the domain's channel vocabulary without exposing adapter or SDK types. */
export type MessagingProviderChannel = MessagingConnectionConfigurationInput["channel"];
/** Contains only actually implemented identity and channels, without factories or private resources. */
export type MessagingProviderCatalogEntry = { readonly id: string; readonly channels: readonly MessagingProviderChannel[] };
/** Reads deployed static capabilities without SQL, keyrings, provider RPC or mutable browser authority. */
export interface MessagingProviderCatalogReader {
  /** @returns Only currently implemented metadata from the explicit infrastructure registry. */
  read(): readonly MessagingProviderCatalogEntry[];
}
