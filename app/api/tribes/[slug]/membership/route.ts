/** Composes the explicit membership owner through native framework request scope. @module tribe-membership-route */
import { createTribeMembershipRequestModule } from "@/src/modules/setup";
import { createTribeMembershipLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-membership-lifecycle-handlers";
/** Native POST requires one original confirmed body and never accepts caller identity. */
export const POST = createTribeMembershipLifecycleHandlers(createTribeMembershipRequestModule).change;
