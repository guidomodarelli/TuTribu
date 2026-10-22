/** @vitest-environment node */
/** Exercises the connection test step of a tribe that never saved Países y cupos with real Next/UI/auth/SQL and a closed synthetic provider. @module messaging-usage-required-browser-ui-tests */
import { clickClearOfToasts, openConnectionsStep } from "@/tests/support/messaging-connections-steps";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {chromium,webkit} from "@playwright/test";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {makeSignature} from "better-auth/crypto";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {readMessagingHostingSecurityConfig} from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {withAdmissionNextServer} from "@/tests/support/admission-next-server";
import {captureAdmissionReview} from "@/tests/support/admission-review-capture";
import {MESSAGING_CONNECTIONS_FLOW_COPY} from "@/src/modules/messaging/constants/messaging-connections-workspace";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "@/src/modules/messaging/constants/messaging-errors";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native connection test without saved usage",()=>{
  it.each([{name:"chromium",engine:chromium,width:1280},{name:"chromium",engine:chromium,width:390},{name:"webkit",engine:webkit,width:1280},{name:"webkit",engine:webkit,width:390}])("should block the channel test before sending, link to Países y cupos and send a new test after a denial on $name at $width",async({name,engine,width})=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const securityConfig=await readMessagingHostingSecurityConfig();const fixture=await prepareMessagingConnectionCreation(database,securityConfig),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=randomUUID(),senderId=randomUUID();
      for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006120000_index_messaging_contact_windows.sql","20261006140000_claim_messaging_deliveries_fairly.sql","20261006160000_purge_verification_delivery_material.sql","20261006230000_bind_credential_validation_usage.sql","20261007050000_claim_scoped_diagnostic_delivery.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookieValue=encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`),headers={cookie:`better-auth.session_token=${cookieValue}`,origin,"content-type":"application/json"},base=`${origin}/api/tribes/${slug}/messaging`;
        // A complete candidate: saved key, configured email channel and a valid credential, but no usage policy row.
        const created=await fetch(`${base}/connections`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Prueba sin cupos",apiKey:credential})});expect(created.status).toBe(201);const connectionId=(await created.json()).result.id;
        const configured=await fetch(`${base}/connections/${connectionId}/configuration`,{method:"PUT",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",senderId})});expect(configured.status).toBe(200);
        const validated=await fetch(`${base}/connections/${connectionId}/validate`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,expectedVersion:2})});expect(validated.status).toBe(200);expect(providerRequests).toBe(2);
        // The server names what is missing instead of calling the connection incomplete, and sends nothing.
        const denied=await fetch(`${base}/connections/${connectionId}/diagnostics`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,expectedVersion:3,channel:"email",recipient:fixture.fixture.own.email})});
        expect(denied.status).toBe(409);expect(await denied.json()).toMatchObject({code:MESSAGING_ERROR_CODE.usagePolicyMissing,message:MESSAGING_ERROR_MESSAGE[MESSAGING_ERROR_CODE.usagePolicyMissing]});expect(providerRequests).toBe(2);
        const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"}),page=await context.newPage(),errors:string[]=[];page.on("pageerror",(error)=>errors.push(error.message));
        try{
          await context.addCookies([{name:"better-auth.session_token",value:cookieValue,url:origin,httpOnly:true,sameSite:"Lax"}]);
          await page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`,{waitUntil:"networkidle",timeout:120_000});
          // The flow opens on the waiting test step; moving there again is a no-op.
          await openConnectionsStep(page,"Pruebas");
          const step=page.getByRole("group",{name:"Probar Correo",exact:true});
          await page.getByText(MESSAGING_CONNECTIONS_FLOW_COPY.usageRequired,{exact:true}).waitFor({timeout:120_000});
          expect(await page.getByRole("button",{name:"Enviar código de prueba",exact:true}).count()).toBe(0);expect(await page.getByLabel("Destino de la prueba",{exact:true}).count()).toBe(0);
          const next=page.getByRole("button",{name:MESSAGING_CONNECTIONS_FLOW_COPY.next,exact:true});expect(await next.isDisabled()).toBe(true);expect(await next.getAttribute("aria-describedby")).toBeTruthy();
          expect(await page.getByRole("group",{name:"Próxima acción",exact:true}).getByText("Guardá Países y cupos",{exact:true}).count()).toBe(1);
          const link=step.getByRole("link",{name:MESSAGING_CONNECTIONS_FLOW_COPY.usageLink,exact:true});expect(await link.getAttribute("href")).toBe(`/${slug}/academia/admissions/messaging`);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
          if(name==="chromium"&&width===1280)await captureAdmissionReview(page,"diagnostic-usage-required",[credential,fixture.sessionToken,secret,fixture.fixture.own.email,fixture.context.actorUserId],"connection-diagnostic-captures.json");
          await link.click();await page.waitForURL((url)=>url.pathname===`/${slug}/academia/admissions/messaging`,{timeout:120_000});
          expect(errors).toEqual([]);expect(providerRequests).toBe(2);
          const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.contact_verification_challenges where tribe_id=${tribeId}) as challenges`)).rows[0]);
          expect(counts).toEqual({deliveries:0,challenges:0});
          // A page rendered while the policy existed can still send after it disappears: the denial closes that attempt instead of leaving an original to replay.
          const saveUsage=async()=>{const saved=await fetch(`${base}/usage-policy`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true})});expect(saved.status).toBe(200);};
          await saveUsage();const issueOperations:string[]=[];page.on("request",(request)=>{if(request.method()==="POST"&&request.url().endsWith(`/connections/${connectionId}/diagnostics`))issueOperations.push((request.postDataJSON() as {operationId:string}).operationId);});
          await page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`,{waitUntil:"networkidle",timeout:120_000});await openConnectionsStep(page,"Pruebas");await page.getByLabel("Destino de la prueba",{exact:true}).waitFor({timeout:120_000});
          expect((await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`delete from public.messaging_usage_policies where tribe_id=${tribeId} returning tribe_id`))).rows).toHaveLength(1);
          const send=async()=>{await page.waitForFunction(()=>!(document.querySelector('input[type="email"]') as HTMLInputElement|null)?.disabled,undefined,{timeout:120_000});await page.getByLabel("Destino de la prueba",{exact:true}).fill(fixture.fixture.own.email);await page.getByRole("checkbox",{name:/Confirmo el destino y el consumo/}).check();await clickClearOfToasts(page.getByRole("button",{name:"Enviar código de prueba",exact:true}));};
          await send();await page.getByText(MESSAGING_ERROR_MESSAGE[MESSAGING_ERROR_CODE.usagePolicyMissing],{exact:true}).first().waitFor({timeout:240_000});
          expect(await page.getByRole("button",{name:"Consultar guardado",exact:true}).count()).toBe(0);expect(providerRequests).toBe(2);
          await saveUsage();await send();await page.getByLabel("Código recibido",{exact:true}).waitFor({timeout:240_000});
          expect(issueOperations).toHaveLength(2);expect(new Set(issueOperations).size).toBe(2);expect(providerRequests).toBe(3);expect(errors).toEqual([]);
        }finally{await context.close();await browser.close();}
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential,ADMISSION_TEST_ZAVU_SENDER_ID:senderId,ADMISSION_TEST_ZAVU_RECIPIENT:fixture.fixture.own.email,ADMISSION_TEST_ZAVU_TEST_MODE:"false"},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },1_200_000);
});
