/** Observes an original lifecycle result after exit or physical deletion without repeating its mutation. @module tribe-lifecycle-recovery-route */
import { createTribeLifecycleRequestModule } from "@/src/modules/setup";
import { createTribeLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-lifecycle-handlers";
export const POST = createTribeLifecycleHandlers(createTribeLifecycleRequestModule).recover;
