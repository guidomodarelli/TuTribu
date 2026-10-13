/** Wires global authentication to request-local, verified identity capture. */
import { auth } from "@/src/modules/auth/infrastructure/better-auth/auth";
import { buildAuthEvidenceRouteHandlers } from "@/src/modules/auth/infrastructure/composition/auth-evidence-route-handlers";

export const { GET, POST } = buildAuthEvidenceRouteHandlers(auth);
