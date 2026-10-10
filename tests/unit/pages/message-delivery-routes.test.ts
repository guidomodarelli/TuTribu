/** @vitest-environment node */
/** Exercises no-side-effect minimal transport projection with real own HTTP guards. @module message-delivery-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessageDeliveryHandler} from "@/src/modules/messaging/infrastructure/api/message-delivery-handler";

describe("own delivery HTTP",()=>{
  it("should reject caller-selected authority and publish only minimal original transport",async()=>{
    const deliveryId=randomUUID(),tribeId=randomUUID(),privateValue=randomUUID(),execute=vi.fn(async()=>({ok:true as const,value:{id:deliveryId,state:"accepted"as const,purpose:"connection_diagnostic"as const,channel:"email"as const,createdAt:new Date().toISOString(),providerMessageId:privateValue,body:privateValue}})),open=vi.fn(async()=>({delivery:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),handler=createMessageDeliveryHandler(open),url=`https://tutribu.example.test/api/tribes/synthetic/messaging/deliveries/${deliveryId}`,context={params:Promise.resolve({slug:"synthetic",deliveryId})};
    expect((await handler(new Request(`${url}?role=leader`),context)).status).toBe(400);expect(open).not.toHaveBeenCalled();
    const response=await handler(new Request(url),context);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");const result=await response.json();expect(result).toMatchObject({id:deliveryId,state:"accepted",purpose:"connection_diagnostic",channel:"email"});expect(JSON.stringify(result)).not.toContain(privateValue);expect(execute).toHaveBeenCalledWith(expect.objectContaining({tribeId,deliveryId}));
  });
});
