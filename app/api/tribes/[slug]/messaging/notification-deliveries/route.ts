/** Wires owned notification metadata without importing native persistence into the route. @module notification-delivery-catalog-route */
import { createNotificationDeliveryCatalogRequestModule } from "@/src/modules/setup";
import { createNotificationDeliveryCatalogHandler } from "@/src/modules/messaging/infrastructure/api/notification-delivery-catalog-handler";
/** Current native services are composed only after public input validation. */
export const GET = createNotificationDeliveryCatalogHandler(createNotificationDeliveryCatalogRequestModule);
