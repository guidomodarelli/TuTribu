/** Guards server-to-client wizard props without private session or credential material. @module messaging-connections-page-state */
import {z} from "zod";
import {messagingConfigurationSchema} from "./messaging-configuration-result";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "../../constants/messaging-errors";

/** Current own metadata is the initial client state; the key is never part of this contract. */
export const messagingConnectionsPageStateSchema=z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("ready"),slug:z.string().min(1),tribeId:z.uuid(),viewerId:z.string().min(1),renderedAt:z.iso.datetime({offset:true}),configuration:messagingConfigurationSchema}),
  z.strictObject({kind:z.literal("unavailable"),code:z.enum(MESSAGING_ERROR_CODE),message:z.string()}).refine((state)=>state.message===MESSAGING_ERROR_MESSAGE[state.code]),
]);
export type MessagingConnectionsPageState=z.infer<typeof messagingConnectionsPageStateSchema>;
