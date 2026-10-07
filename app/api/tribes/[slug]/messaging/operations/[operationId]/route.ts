/** Wires only native readonly original connection recovery; no arbitrary namespace or retry is accepted. @module messaging-connection-operation-route */
import {createMessagingConnectionOperationRequestModule} from "@/src/modules/setup";
import {createMessagingConnectionOperationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-operation-handler";

export const GET=createMessagingConnectionOperationHandler(createMessagingConnectionOperationRequestModule);
