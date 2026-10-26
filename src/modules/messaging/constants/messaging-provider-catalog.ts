/** Guards the public projection of implemented providers, independently of provider payloads. @module messaging-provider-catalog */
import { z } from "zod";
import type { MessagingProviderCatalogEntry } from "../application/ports/messaging-provider-catalog-reader";
import { MESSAGING_INITIAL_PROVIDER_ID, MESSAGING_PUBLIC_CHANNEL } from "./messaging-public-contract";

/** The first delivery exposes only Zavu and actual distinct channels, never clients, keys or factories. */
export const messagingProviderCatalogEntrySchema = z.strictObject({
  id: z.literal(MESSAGING_INITIAL_PROVIDER_ID),
  channels: z.array(z.enum(MESSAGING_PUBLIC_CHANNEL)).nonempty().refine((channels) => new Set(channels).size === channels.length),
}) satisfies z.ZodType<MessagingProviderCatalogEntry>;

/** A missing, duplicate or unimplemented provider closes the own public projection without a default. */
export const messagingProviderCatalogSchema = z.array(messagingProviderCatalogEntrySchema).nonempty().refine((providers) => new Set(providers.map((provider) => provider.id)).size === providers.length);
