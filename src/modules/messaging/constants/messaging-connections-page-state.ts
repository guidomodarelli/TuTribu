/** Owns the static wizard-props guard while application retains the public result facade. @module messaging-connections-page-state-constants */
import { z } from "zod";
import { messagingConfigurationSchema } from "../application/results/messaging-configuration-result";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "./messaging-errors";
import { notificationDeliveryCatalogPageSchema } from "./notification-delivery-catalog";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { messagingProviderCatalogSchema } from "./messaging-provider-catalog";

/** Current own props contain no session/provider DTO or credential; guardian props exclude both leader catalogs. */
export const messagingConnectionsPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), configuration: messagingConfigurationSchema, notificationCatalog: notificationDeliveryCatalogPageSchema.optional(), providerCatalog: messagingProviderCatalogSchema.optional() }).refine((state) => state.configuration.audience === TRIBE_MEMBER_ROLE.leader ? state.providerCatalog !== undefined : state.notificationCatalog === undefined && state.providerCatalog === undefined),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(MESSAGING_ERROR_CODE), message: z.string() }).refine((state) => state.message === MESSAGING_ERROR_MESSAGE[state.code]),
]);
