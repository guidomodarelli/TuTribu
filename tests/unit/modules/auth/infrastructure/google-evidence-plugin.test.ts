/** @vitest-environment node */

/** Exercises request-scoped evidence through Better Auth's real global sign-in API. */
import {randomUUID} from "node:crypto";
import {betterAuth} from "better-auth";
import type {google} from "better-auth/social-providers";
import {memoryAdapter} from "better-auth/adapters/memory";
import {describe,expect,it} from "vitest";
import {createAdmissionGoogleTokenFixture} from "@/tests/support/admission-google-tokens";
import {createAdmissionProviderTransport,withAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {googleIdentityEvidencePlugin} from "@/src/modules/auth/infrastructure/better-auth/google-identity-evidence-plugin";
import {getAuthEvidenceContext,runWithAuthEvidenceContext} from "@/src/modules/auth/infrastructure/better-auth/auth-evidence-context";
import {createScopedAuthEvidenceHandler} from "@/src/modules/auth/infrastructure/better-auth/scoped-auth-evidence-handler";

/** Creates a real auth instance with its published in-memory adapter and synthetic credentials. */
function createTestAuth(clientId:string,mapProfileToUser?:Parameters<typeof google>[0]["mapProfileToUser"],authorizeIntent?:(intentId:string)=>Promise<{allowed:true;nonce:string}|{allowed:false}>) {
  return betterAuth({
    baseURL:"https://auth.example.test",secret:randomUUID()+randomUUID(),
    database:memoryAdapter({user:[],account:[],session:[],verification:[]}),
    logger:{disabled:true},
    socialProviders:{google:{clientId,clientSecret:randomUUID(),mapProfileToUser}},
    plugins:[googleIdentityEvidencePlugin({authorizeIntent})],
  });
}

/** Signs in through the public handler; only its own opaque scope carries the private capture. */
async function signIn(auth:ReturnType<typeof createTestAuth>,token:string) {
  return runWithAuthEvidenceContext(async()=>{
    const response=await auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{
      method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},
      body:JSON.stringify({provider:"google",idToken:{token}}),
    }));
    const capture=getAuthEvidenceContext()?.googleEvidence??null;
    const completion=getAuthEvidenceContext()?.completedGoogleLogin??null;
    return {response,capture,completion};
  });
}

describe("Google evidence plugin",()=>{
  it("should carry the owned intent and signed nonce/auth_time through the complete OAuth callback",async()=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();const intentId=randomUUID();const nonce=randomUUID();
    const instant=Math.floor(Date.now()/1000);const email=`${subject}@gmail.com`;
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic recent account",email_verified:true,nonce,auth_time:instant});
    const auth=createTestAuth(clientId,undefined,async(opaqueId)=>opaqueId===intentId?{allowed:true,nonce}:{allowed:false});
    const persisted:unknown[]=[];
    const handler=createScopedAuthEvidenceHandler(auth.handler,{persist:async(completion)=>{persisted.push(completion);return {status:"stored"};},reportFailure:()=>{throw new Error("Unexpected capture failure");}});
    const transport=createAdmissionProviderTransport([
      {origin:"https://oauth2.googleapis.com",pathname:"/token",method:"POST",respond:()=>Response.json({access_token:randomUUID(),token_type:"Bearer",expires_in:3600,id_token:token})},
      {origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)},
    ]);
    await withAdmissionProviderTransport(transport,async()=>{
      const started=await handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",callbackURL:"https://auth.example.test/tribes",disableRedirect:true,additionalData:{reauthenticationIntentId:intentId}})}));
      expect(started.status).toBe(200);
      const body=await started.json() as {url:string};const authorization=new URL(body.url);
      expect(authorization.searchParams.get("nonce")).toBe(nonce);
      const cookies=started.headers.getSetCookie().map((cookie)=>cookie.split(";")[0]).join("; ");
      const callback=new URL("https://auth.example.test/api/auth/callback/google");
      callback.searchParams.set("state",authorization.searchParams.get("state")??"");callback.searchParams.set("code",randomUUID());
      const response=await handler(new Request(callback,{headers:{Cookie:cookies}}));
      expect(response.status).toBe(302);expect(response.headers.get("location")).toBe("https://auth.example.test/tribes");
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({reauthenticationIntentId:intentId,evidence:{subject,normalizedEmail:email,nonce,authenticatedAt:new Date(instant*1000)}});
    expect(JSON.stringify(persisted)).not.toContain(token);expect(getAuthEvidenceContext()).toBeUndefined();
  });

  it("should add only an owned nonce and auth_time request while preserving native OAuth state and PKCE",async()=>{
    const intentId=randomUUID();const nonce=randomUUID();const requested:string[]=[];
    const auth=createTestAuth(randomUUID(),undefined,async(opaqueId)=>{requested.push(opaqueId);return {allowed:true,nonce};});
    const transport=createAdmissionProviderTransport([]);
    const response=await withAdmissionProviderTransport(transport,()=>runWithAuthEvidenceContext(()=>auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",callbackURL:"https://auth.example.test/tribes",disableRedirect:true,additionalData:{reauthenticationIntentId:intentId}})}))));
    expect(response.status).toBe(200);
    const body=await response.json() as {url:string};const url=new URL(body.url);
    expect(requested).toEqual([intentId]);
    expect(url.searchParams.get("nonce")).toBe(nonce);
    expect(JSON.parse(url.searchParams.get("claims")??"null")).toEqual({id_token:{auth_time:{essential:true}}});
    expect(url.searchParams.get("state")).toBeTruthy();expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(transport.receipts).toEqual([]);
  });

  it("should close a denied opaque intent before creating an OAuth authorization URL",async()=>{
    const auth=createTestAuth(randomUUID(),undefined,async()=>({allowed:false}));const transport=createAdmissionProviderTransport([]);
    const response=await withAdmissionProviderTransport(transport,()=>runWithAuthEvidenceContext(()=>auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",callbackURL:"https://auth.example.test/tribes",disableRedirect:true,additionalData:{reauthenticationIntentId:randomUUID()}})}))));
    expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty("url");expect(transport.receipts).toEqual([]);
  });

  it.each([false,true])("should persist native completion without changing global login when persistence fails=%s",async(fails)=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const instant=Math.floor(Date.now()/1000);const email=`${subject}@gmail.com`;const requestId=randomUUID();
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic account",email_verified:true});
    const auth=createTestAuth(clientId);const persisted:unknown[]=[];const failures:unknown[]=[];
    const handler=createScopedAuthEvidenceHandler(auth.handler,{
      persist:async(completion)=>{persisted.push(completion);if(fails) throw new Error(`Synthetic private failure ${token}`);return {status:"stored"};},
      reportFailure:(failure)=>{failures.push(failure);},
    });
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const response=await withAdmissionProviderTransport(transport,()=>handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test","x-request-id":requestId},body:JSON.stringify({provider:"google",idToken:{token}})})));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({user:{email}});
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({evidence:{subject,normalizedEmail:email},reauthenticationIntentId:null});
    expect(failures).toEqual(fails?[{requestId,traceId:requestId,code:"capture_persistence_failed",failureKind:"exception"}]:[]);
    expect(JSON.stringify(failures)).not.toContain(token);
    expect(getAuthEvidenceContext()).toBeUndefined();
  });

  it("should bind a verified login to the native account and newly created session",async()=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const instant=Math.floor(Date.now()/1000);const email=`${subject}@gmail.com`;
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic account",email_verified:true});
    const auth=createTestAuth(clientId);
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const result=await withAdmissionProviderTransport(transport,()=>signIn(auth,token));
    expect(result.response.status).toBe(200);
    const cookie=result.response.headers.getSetCookie().map((value)=>value.split(";")[0]).join("; ");
    const headers=new Headers({Cookie:cookie});
    const session=await auth.api.getSession({headers});
    const accounts=await auth.api.listUserAccounts({headers});
    expect(session).not.toBeNull();
    expect(result.completion).toMatchObject({userId:session?.user.id,sessionId:session?.session.id,accountId:accounts[0].id,reauthenticationIntentId:null,evidence:{subject,normalizedEmail:email}});
    expect(JSON.stringify(result.completion)).not.toContain(token);
  });

  it("should preserve a mapped global login without granting authority to mutated profile claims",async()=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const originalEmail=`${subject}@external.example.test`;const mappedEmail=`${subject}@gmail.com`;const instant=Math.floor(Date.now()/1000);
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email:originalEmail,name:"Synthetic account",email_verified:false});
    const auth=createTestAuth(clientId,(profile)=>{
      profile.email=mappedEmail;profile.email_verified=true;profile.hd="workspace.example.test";
      return {};
    });
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const result=await withAdmissionProviderTransport(transport,()=>signIn(auth,token));
    expect(result.response.status).toBe(200);
    expect(await result.response.json()).toMatchObject({user:{email:mappedEmail,emailVerified:true}});
    expect(result.capture).toMatchObject({status:"verified",evidence:{subject,normalizedEmail:originalEmail,emailVerifiedClaim:false,hostedDomain:null,classification:"insufficient"}});
    expect(result.completion).toBeNull();
  });

  it.each([
    {domain:"gmail.com",classification:"gmail"},
    {domain:"external.example.test",classification:"insufficient"},
  ])("should capture $classification evidence from the real OAuth callback without changing state or PKCE",async(scenario)=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const email=`${subject}@${scenario.domain}`;const instant=Math.floor(Date.now()/1000);
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic OAuth account",email_verified:true});
    const auth=createTestAuth(clientId);const callbackURL="https://auth.example.test/tribes";
    const transport=createAdmissionProviderTransport([
      {origin:"https://oauth2.googleapis.com",pathname:"/token",method:"POST",respond:async(request)=>{
        const body=new URLSearchParams(await request.text());
        expect(body.get("code_verifier")).toBeTruthy();
        expect(body.get("redirect_uri")).toBe("https://auth.example.test/api/auth/callback/google");
        return Response.json({access_token:randomUUID(),token_type:"Bearer",expires_in:3600,id_token:token});
      }},
      {origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)},
    ]);
    const result=await withAdmissionProviderTransport(transport,async()=>{
      const started=await runWithAuthEvidenceContext(()=>auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",callbackURL,disableRedirect:true})})));
      expect(started.status).toBe(200);
      const body=await started.json() as {url:string};const authorizationUrl=new URL(body.url);
      expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
      const cookies=started.headers.getSetCookie().map((cookie)=>cookie.split(";")[0]).join("; ");
      const callback=new URL("https://auth.example.test/api/auth/callback/google");
      callback.searchParams.set("state",authorizationUrl.searchParams.get("state")??"");
      callback.searchParams.set("code",randomUUID());
      const persisted:unknown[]=[];const failures:unknown[]=[];
      let capture:unknown;
      const handler=createScopedAuthEvidenceHandler(auth.handler,{
        persist:async(completion)=>{persisted.push(completion);capture=getAuthEvidenceContext()?.googleEvidence;return {status:"stored"};},
        reportFailure:(failure)=>{failures.push(failure);},
      });
      const response=await handler(new Request(callback,{headers:{Cookie:cookies}}));
      return {response,capture,persisted,failures};
    });
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("location")).toBe(callbackURL);
    expect(result.persisted).toHaveLength(1);
    expect(result.persisted[0]).toMatchObject({evidence:{subject,normalizedEmail:email},reauthenticationIntentId:null});
    expect(result.failures).toEqual([]);
    expect(result.capture).toMatchObject({status:"verified",evidence:{subject,normalizedEmail:email,classification:scenario.classification}});
    expect(getAuthEvidenceContext()).toBeUndefined();
    expect(transport.deniedRequests).toBe(0);
  });

  it.each([
    {domain:"gmail.com",verified:true,hostedDomain:undefined,classification:"gmail"},
    {domain:"workspace.example.test",verified:true,hostedDomain:"workspace.example.test",classification:"workspace"},
    {domain:"external.example.test",verified:true,hostedDomain:undefined,classification:"insufficient"},
    {domain:"gmail.com",verified:undefined,hostedDomain:undefined,classification:"insufficient"},
  ])("should preserve global login with $classification evidence for $domain",async(scenario)=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const email=`${randomUUID()}@${scenario.domain}`;const instant=Math.floor(Date.now()/1000);
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic account",email_verified:scenario.verified,hd:scenario.hostedDomain});
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const result=await withAdmissionProviderTransport(transport,()=>signIn(createTestAuth(clientId),token));
    expect(result.response.status).toBe(200);
    expect(await result.response.json()).toMatchObject({user:{email}});
    expect(result.capture).toMatchObject({status:"verified",evidence:{subject,normalizedEmail:email,classification:scenario.classification}});
    expect(JSON.stringify(result.capture)).not.toContain(token);
    expect(getAuthEvidenceContext()).toBeUndefined();
  });

  it("should keep concurrent global sign-ins scoped to their own account",async()=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const auth=createTestAuth(clientId);
    const instant=Math.floor(Date.now()/1000);
    const subjects=[randomUUID(),randomUUID()];
    const tokens=await Promise.all(subjects.map((subject)=>signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email:`${subject}@gmail.com`,name:"Synthetic account",email_verified:true})));
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const results=await withAdmissionProviderTransport(transport,()=>Promise.all(tokens.map((token)=>signIn(auth,token))));
    for(const [index,result] of results.entries()) {
      expect(result.response.status).toBe(200);
      expect(result.capture).toMatchObject({status:"verified",evidence:{subject:subjects[index],normalizedEmail:`${subjects[index]}@gmail.com`}});
    }
    expect(getAuthEvidenceContext()).toBeUndefined();
  });

  it("should leave an unscoped global login unchanged without using another request's capture",async()=>{
    const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const subject=randomUUID();
    const instant=Math.floor(Date.now()/1000);const email=`${subject}@gmail.com`;
    const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,name:"Synthetic account",email_verified:true});
    const auth=createTestAuth(clientId);
    const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
    const response=await withAdmissionProviderTransport(transport,()=>auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",idToken:{token}})})));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({user:{email}});
    expect(getAuthEvidenceContext()).toBeUndefined();
  });

  it("should preserve native OAuth state and PKCE without capturing an unverified authorization request",async()=>{
    const auth=createTestAuth(randomUUID());const transport=createAdmissionProviderTransport([]);
    const result=await withAdmissionProviderTransport(transport,()=>runWithAuthEvidenceContext(async()=>{
      const response=await auth.handler(new Request("https://auth.example.test/api/auth/sign-in/social",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://auth.example.test"},body:JSON.stringify({provider:"google",callbackURL:"https://auth.example.test/tribes",disableRedirect:true})}));
      return {response,capture:getAuthEvidenceContext()?.googleEvidence};
    }));
    expect(result.response.status).toBe(200);
    const body=await result.response.json() as {url:string};const url=new URL(body.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result.capture).toBeNull();
    expect(transport.receipts).toEqual([]);
  });
});
