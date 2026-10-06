/** @vitest-environment node */

/** Exercises real input and public DTO boundaries with only owned use case dependencies. */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {postReauthenticationIntent,getReauthenticationIntent} from "@/src/modules/auth/infrastructure/api/reauthentication-route-handlers";

describe("reauthentication intent HTTP",()=>{
  it("should reject client identity or permission fields before invoking a use case",async()=>{
    let invoked=false;
    const response=await postReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tribeId:randomUUID(),operation:"save_messaging_credentials",resourceId:randomUUID(),returnPath:"/tribe",confirmed:true,userId:randomUUID(),verified:true})}),async()=>{invoked=true;throw new Error("Unexpected invocation");});
    expect(response.status).toBe(422);expect(invoked).toBe(false);
    expect(await response.json()).toMatchObject({code:"invalid_input"});
  });

  it("should return only the safe committed intent with private caching headers",async()=>{
    const intentId=randomUUID();const tribeId=randomUUID();
    const response=await postReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tribeId,operation:"save_messaging_credentials",resourceId:tribeId,returnPath:"/tribe",confirmed:true})}),async()=>({useCases:{createIntent:{execute:async()=>({ok:true as const,value:{intentId,state:"created" as const,outcome:"pending" as const,safeMessage:"Confirmá tu autenticación con Google para continuar.",returnPath:"/tribe"}})},readIntent:{execute:async()=>({ok:false as const,failure:{code:"intent_not_found" as const}})}}}));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toMatchObject({intentId,state:"created",outcome:"pending"});
  });

  it("should hide an actual internal failure without claiming creation",async()=>{
    const tribeId=randomUUID();
    const response=await postReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tribeId,operation:"save_messaging_credentials",resourceId:tribeId,returnPath:"/tribe",confirmed:true})}),async()=>{throw new Error("Synthetic private credential must not escape");});
    expect(response.status).toBe(500);const body=await response.json();
    expect(body).toMatchObject({code:"unexpected_failure"});expect(JSON.stringify(body)).not.toContain("credential");expect(body).not.toHaveProperty("intentId");
  });

  it("should validate an opaque id before resolving auth or persistence",async()=>{
    let invoked=false;
    const response=await getReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents/invalid"),{intentId:"invalid"},async()=>{invoked=true;throw new Error("Unexpected invocation");});
    expect(response.status).toBe(422);expect(invoked).toBe(false);
  });
});
