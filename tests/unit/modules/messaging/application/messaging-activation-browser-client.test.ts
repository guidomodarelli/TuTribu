/** @vitest-environment node */
/** Exercises one explicit own activation action and exact public result binding through real guards. @module messaging-activation-browser-client-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingActivationBrowserClient} from "@/lib/messaging/messaging-activation-api-client";

/** @returns An observed candidate and minimal original selection with no credential or provider references. */
function activationFixture(){const connectionId=randomUUID(),operationId=randomUUID(),scope={slug:"synthetic",connectionId,configurationVersion:2},input={operationId,expectedVersion:4,confirmed:true as const},value={state:"completed",operationId,replayed:false,result:{id:connectionId,name:"Candidata comprobada",version:5,configurationVersion:2,state:"active",maskedCredential:"••••••••",replaced:null,policyVersion:null}};return{scope,input,value};}

describe("activation browser transport",()=>{
  it("should activate once only after an explicit original action and return the exact selected configuration",async()=>{
    const fixture=activationFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(fixture.value)),client=createMessagingActivationBrowserClient({fetch});expect(fetch).not.toHaveBeenCalled();expect(await client.activate(fixture.scope,fixture.input,new AbortController().signal)).toEqual({status:"ready",value:fixture.value});expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/tribes/synthetic/messaging/connections/${fixture.scope.connectionId}/activate`,expect.objectContaining({method:"POST",body:JSON.stringify(fixture.input),credentials:"same-origin",cache:"no-store"}));
  });
  it.each([{field:"id",value:randomUUID()},{field:"configurationVersion",value:3},{field:"version",value:6},{field:"state",value:"draft"}])("should reject a crossed or non-selected activation result for $field without a second action",async({field,value})=>{
    const fixture=activationFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({...fixture.value,result:{...fixture.value.result,[field]:value}})),client=createMessagingActivationBrowserClient({fetch});expect(await client.activate(fixture.scope,fixture.input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("should preserve a registered original identity while selection remains pending without retrying",async()=>{
    const fixture=activationFixture(),value={state:"started",operationId:fixture.input.operationId},fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(value,{status:202})),client=createMessagingActivationBrowserClient({fetch});expect(await client.activate(fixture.scope,fixture.input,new AbortController().signal)).toEqual({status:"ready",value});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("should reject a crossed original UUID and internal fields from the public selection",async()=>{
    const fixture=activationFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({...fixture.value,operationId:randomUUID()})),client=createMessagingActivationBrowserClient({fetch});expect(await client.activate(fixture.scope,fixture.input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});fetch.mockResolvedValueOnce(Response.json({...fixture.value,result:{...fixture.value.result,secretRef:randomUUID()}}));expect(await client.activate(fixture.scope,fixture.input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("should stop an aborted observation before dispatch without inventing a selection",async()=>{
    const fixture=activationFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(fixture.value)),client=createMessagingActivationBrowserClient({fetch}),controller=new AbortController();controller.abort();expect(await client.activate(fixture.scope,fixture.input,controller.signal)).toEqual({status:"aborted"});expect(fetch).not.toHaveBeenCalled();
  });
});
