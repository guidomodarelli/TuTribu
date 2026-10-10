/** @vitest-environment node */
/** Exercises real constant-time cron authorization with native requests and a hosting-owned secret source. @module request-maintenance-authorizer-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";

describe("messaging request maintenance authority",()=>{
  it("should permit only a matching live bearer without trusting body or actor flags",async()=>{
    const secret=randomUUID();
    const authorized=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{method:"POST",headers:{authorization:`Bearer ${secret}`},body:JSON.stringify({maintenance:false,actorUserId:randomUUID()})}),()=>secret);
    expect(await authorized()).toBe(true);
    const forged=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{method:"POST",body:JSON.stringify({maintenance:true,role:"leader",verified:true})}),()=>secret);
    expect(await forged()).toBe(false);
  });

  it.each([undefined,"",`Bearer ${randomUUID()}`,`bearer ${randomUUID()}`])("should deny absent or mismatched authorization %s",async(header)=>{
    const headers=new Headers();if(header!==undefined)headers.set("authorization",header);
    expect(await createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{headers}),()=>randomUUID())()).toBe(false);
  });

  it("should revalidate secret withdrawal and rotation instead of retaining an earlier success",async()=>{
    const original=randomUUID();let current:string|undefined=original;
    const authorize=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{headers:{authorization:`Bearer ${original}`}}),()=>current);
    expect(await authorize()).toBe(true);
    current=undefined;expect(await authorize()).toBe(false);
    current=randomUUID();expect(await authorize()).toBe(false);
  });
});
