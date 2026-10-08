/** Exercises own same-origin lifecycle transport/result contracts without SDK/platform mocks. @module messaging-lifecycle-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMessagingLifecycleBrowserClient } from "@/lib/messaging/messaging-lifecycle-api-client";

describe("explicit local lifecycle browser client",()=>{
  it.each([true,false])("should issue one original suspension POST and accept only its coherent CAS/cause result for changed %s",async(changed)=>{
    const connectionId=randomUUID(),operationId=randomUUID(),input={operationId,expectedVersion:3,confirmed:true as const,reason:"suspected_compromise" as const},result={id:connectionId,version:changed?4:3,state:"suspended",reason:input.reason,changed},transport=vi.fn<typeof fetch>(async()=>Response.json({state:"completed",operationId,replayed:false,result})),client=createMessagingLifecycleBrowserClient({fetch:transport});
    const outcome=await client.suspend({slug:"synthetic",connectionId},input,new AbortController().signal);expect(outcome).toMatchObject({status:"ready",value:{result}});expect(transport).toHaveBeenCalledTimes(1);const request=transport.mock.calls[0];expect(String(request[0])).toContain(`/messaging/connections/${connectionId}/suspend`);expect(request[1]?.method).toBe("POST");expect(JSON.parse(String(request[1]?.body))).toEqual(input);
  });
  it.each(["resource","version","cause","state","private_field"]as const)("should preserve uncertainty for crossed suspension %s metadata without retry",async(scenario)=>{
    const connectionId=randomUUID(),operationId=randomUUID(),input={operationId,expectedVersion:3,confirmed:true as const,reason:"security_stop" as const},base={id:connectionId,version:4,state:"suspended",reason:"security_stop",changed:true},result=scenario==="resource"?{...base,id:randomUUID()}:scenario==="version"?{...base,version:5}:scenario==="cause"?{...base,reason:"suspected_compromise"}:scenario==="state"?{...base,state:"disconnected",reason:null}:{...base,secretRef:randomUUID()},transport=vi.fn<typeof fetch>(async()=>Response.json({state:"completed",operationId,replayed:false,result})),client=createMessagingLifecycleBrowserClient({fetch:transport});
    expect(await client.suspend({slug:"synthetic",connectionId},input,new AbortController().signal)).toMatchObject({status:"failed",uncertain:true,code:"public_contract_unusable"});expect(transport).toHaveBeenCalledTimes(1);
  });
  it("should bind disconnection to the original minimum result and retain a lost response without repeating it",async()=>{
    const connectionId=randomUUID(),operationId=randomUUID(),input={operationId,expectedVersion:3,confirmed:true as const},transport=vi.fn<typeof fetch>(async()=>Response.json({state:"completed",operationId,replayed:true,result:{id:connectionId,version:4,state:"disconnected",reason:null,changed:true}})),client=createMessagingLifecycleBrowserClient({fetch:transport});
    expect(await client.disconnect({slug:"synthetic",connectionId},input,new AbortController().signal)).toMatchObject({status:"ready",value:{state:"completed",operationId}});transport.mockRejectedValueOnce(new TypeError("Synthetic original response lost"));expect(await client.disconnect({slug:"synthetic",connectionId},input,new AbortController().signal)).toMatchObject({status:"failed",uncertain:true});expect(transport).toHaveBeenCalledTimes(2);
  });
});
