/** @vitest-environment node */
/** Exercises the installed dev request logger and actual config with native HTTP and ephemeral private canaries. @module private-next-request-logging-tests */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { NodeNextRequest, NodeNextResponse } from "next/dist/server/base-http/node";
import { logRequests } from "next/dist/server/dev/log-requests";
import type { LoggingConfig } from "next/dist/server/config-shared";
import { expect, it, vi } from "vitest";

it("should keep private route/query URLs out of the actual dev logger while retaining ordinary request diagnostics", async () => {
  vi.stubEnv("VERCEL","1");
  const configuration = (await import("@/next.config")).default;
  const token = randomUUID();let leaked=false,ordinaryLogged=false;
  const output = vi.spyOn(process.stdout,"write").mockImplementation((chunk) => {
    const rendered=String(chunk);
    leaked ||= rendered.includes(token);ordinaryLogged ||= rendered.includes("GET /public-logging-check");return true;
  });
  const server=createServer((request,response)=>{
    const began=process.hrtime.bigint();
    logRequests(new NodeNextRequest(request),new NodeNextResponse(response),configuration.logging as LoggingConfig,began,process.hrtime.bigint(),undefined,undefined,undefined,undefined);
    response.end("ok");
  });
  try {
    await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    const address=server.address();if(!address||typeof address==="string")throw new Error("Private dev logger fixture could not bind loopback");
    const base=`http://127.0.0.1:${address.port}`;
    const paths=[`/admissions/invitations/${token}`,`/api/admissions/invitations/${token}/overview`,`/admissions/tribe/legacy/${token}`,`/tribe/invitar/${token}`,`/api/auth/callback/google?code=${token}&state=${token}`,`/api/tribes/tribe/messaging/connections?apiKey=${token}`];
    for(const path of paths){const response=await fetch(base+path);expect(response.status).toBe(200);await response.text();}
    const publicResponse=await fetch(base+"/public-logging-check");await publicResponse.text();
    expect(ordinaryLogged).toBe(true);expect(leaked).toBe(false);
  } finally {
    try {if(server.listening)await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}
    finally{output.mockRestore();vi.unstubAllEnvs();}
  }
});
