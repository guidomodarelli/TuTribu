/** Composes the native explicit tribe lifecycle owner using an immutable UUID scope. @module tribe-lifecycle-route */
import { createTribeLifecycleRequestModule } from "@/src/modules/setup";
import { createTribeLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-lifecycle-handlers";
export const POST = createTribeLifecycleHandlers(createTribeLifecycleRequestModule).change;
