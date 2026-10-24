/** Reads own original transport without provider enumeration, dispatch or proof creation. @module message-delivery-read-route */
import {createMessageDeliveryReadRequestModule} from "@/src/modules/setup";
import {createMessageDeliveryHandler} from "@/src/modules/messaging/infrastructure/api/message-delivery-handler";
/** @param request - Current native session and exact resource. @param context - Canonical framework params. @returns Minimal guarded own transport state. */
export async function GET(request:Request,context:{params:Promise<{slug:string;deliveryId:string}>}){return createMessageDeliveryHandler(()=>createMessageDeliveryReadRequestModule())(request,context);}
