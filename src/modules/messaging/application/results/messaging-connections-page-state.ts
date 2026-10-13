/** Exposes own wizard-props contracts without private session or credential material. @module messaging-connections-page-state */
import type { z } from "zod";
import { messagingConnectionsPageStateSchema } from "../../constants/messaging-connections-page-state";
export { messagingConnectionsPageStateSchema };
/** Guards current connection and optional leader-only notification metadata at the server/client boundary. */
export type MessagingConnectionsPageState = z.infer<typeof messagingConnectionsPageStateSchema>;
