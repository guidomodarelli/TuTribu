/** Wires request-scoped application dependencies into the member checkout HTTP adapter. @module tribe-subscription-start-route */
import { createRequestModules } from "@/src/modules/setup";
import { createSubscriptionStartRouteHandler } from "@/src/modules/subscriptions/infrastructure/api/subscription-start-route-handler";

/** Starts or retries only the application-authorized member subscription flow. */
export const POST = createSubscriptionStartRouteHandler(createRequestModules);
