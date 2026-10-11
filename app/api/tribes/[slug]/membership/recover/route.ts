/** Composes read-only recovery of the same original membership command. @module tribe-membership-recovery-route */
import { createTribeMembershipRequestModule } from "@/src/modules/setup";
import { createTribeMembershipLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-membership-lifecycle-handlers";
/** Native POST observes the original; it creates no lease, member change or admission. */
export const POST = createTribeMembershipLifecycleHandlers(createTribeMembershipRequestModule).recover;
