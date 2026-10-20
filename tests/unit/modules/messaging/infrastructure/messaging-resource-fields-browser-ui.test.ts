/** @vitest-environment node */
/** Exercises capability-specific visible fields with actual Next/shared UI/auth and zero provider requests. @module messaging-resource-fields-browser-tests */
import { openConnectionsStep } from "@/tests/support/messaging-connections-steps";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {chromium,webkit} from "@playwright/test";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {makeSignature} from "better-auth/crypto";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {withAdmissionNextServer} from "@/tests/support/admission-next-server";
import {captureAdmissionReview} from "@/tests/support/admission-review-capture";
import {readMessagingHostingSecurityConfig} from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

/** Bounded consultations of an uncertain credential check before the test gives up on it settling. */
const CREDENTIAL_RECOVERY_ATTEMPTS = 6;

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native resource capability fields",()=>{
  it.each([{name:"chromium",engine:chromium,width:1280},{name:"chromium",engine:chromium,width:390},{name:"webkit",engine:webkit,width:1280},{name:"webkit",engine:webkit,width:390}])("should expose only the selected channel fields without provider queries on $name at $width",async({name,engine,width})=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const securityConfig=await readMessagingHostingSecurityConfig(),keyringsJson=process.env.MESSAGING_KEYRINGS_JSON;
      if(!keyringsJson)throw new Error("Native resource capability validation requires its own synthetic hosting keyrings");
      const fixture=await prepareMessagingConnectionCreation(database,securityConfig),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=randomUUID();
      for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookieValue=encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`),response=await fetch(`${origin}/api/tribes/${slug}/messaging/connections`,{method:"POST",headers:{cookie:`better-auth.session_token=${cookieValue}`,origin,"content-type":"application/json"},body:JSON.stringify({operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Canales de ejemplo",apiKey:credential})});expect(response.status).toBe(201);expect(providerRequests).toBe(0);
        const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"}),page=await context.newPage(),errors:string[]=[];page.on("pageerror",(error)=>errors.push(error.message));
        const browserConfigurationRequests:string[]=[];page.on("request",(request)=>{const path=new URL(request.url()).pathname;if(path.includes("/messaging/")&&path.startsWith("/api/"))browserConfigurationRequests.push(request.method());});
        try{
          await context.addCookies([{name:"better-auth.session_token",value:cookieValue,url:origin,httpOnly:true,sameSite:"Lax"}]);await page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`,{waitUntil:"networkidle",timeout:120_000});/* Canales opens once the credential is checked; only the queries made after that check are counted. */const checkCredential=page.getByRole("button",{name:"Comprobar credencial",exact:true}),checkedCredential=page.getByText("Credencial comprobada",{exact:true}),readSaved=page.getByRole("button",{name:"Consultar guardado",exact:true});await page.getByRole("checkbox",{name:/Confirmo que quiero comprobar/}).check();await page.waitForFunction(()=>Array.from(document.querySelectorAll("button")).some((button)=>button.textContent?.trim()==="Comprobar credencial"&&!button.disabled),{},{timeout:120_000});await checkCredential.click();/* An uncertain reply is recovered through its original, never by checking again; while the original is still running the page keeps it pending, so it is consulted again until it settles. */await checkedCredential.or(readSaved).first().waitFor({timeout:120_000});for(let attempt=0;attempt<CREDENTIAL_RECOVERY_ATTEMPTS&&await readSaved.count();attempt++){await page.waitForFunction(()=>Array.from(document.querySelectorAll("button")).some((button)=>button.textContent?.trim()==="Consultar guardado"&&!button.disabled),{},{timeout:120_000});await readSaved.click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll("button")).some((button)=>button.textContent?.trim()==="Consultar guardado"&&button.disabled),{},{timeout:120_000});}expect(await readSaved.count()).toBe(0);await checkedCredential.waitFor({timeout:120_000});providerRequests=0;browserConfigurationRequests.length=0;await openConnectionsStep(page,"Canales");await page.getByRole("combobox",{name:"Canal que querés preparar",exact:true}).waitFor();await page.waitForFunction(()=>!(document.querySelector('button[role="combobox"][id$="-channel"]') as HTMLButtonElement|null)?.disabled,{},{timeout:120_000});
          expect(await page.getByRole("combobox",{name:"Canal que querés preparar",exact:true}).textContent()).toBe("Correo");expect(await page.getByLabel("Identificador de plantilla",{exact:true}).count()).toBe(0);expect(await page.getByLabel("Idioma de la plantilla",{exact:true}).count()).toBe(0);expect(browserConfigurationRequests).toEqual([]);
          await page.getByRole("combobox",{name:"Canal que querés preparar",exact:true}).click();expect(await page.getByRole("option").allTextContents()).toEqual(["Correo","SMS","WhatsApp"]);await page.getByRole("option",{name:"WhatsApp",exact:true}).click();await page.getByLabel("Identificador de plantilla",{exact:true}).waitFor();expect(await page.getByLabel("Idioma de la plantilla",{exact:true}).count()).toBe(1);expect(await page.getByRole("button",{name:"Guardar configuración del canal",exact:true}).isDisabled()).toBe(true);expect(providerRequests).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
          if(name==="chromium"&&width===1280)await captureAdmissionReview(page,"connection-whatsapp-fields",[credential,fixture.sessionToken,secret,fixture.fixture.own.email,fixture.context.actorUserId],"connection-fields-captures.json");
          await page.getByRole("combobox",{name:"Canal que querés preparar",exact:true}).click();await page.getByRole("option",{name:"SMS",exact:true}).click();expect(await page.getByLabel("Identificador de plantilla",{exact:true}).count()).toBe(0);expect(await page.getByLabel("Idioma de la plantilla",{exact:true}).count()).toBe(0);expect((await page.getByLabel("Identificador del remitente",{exact:true}).inputValue())==="").toBe(true);expect(providerRequests).toBe(0);expect(browserConfigurationRequests).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
          if(name==="chromium"&&width===1280)await captureAdmissionReview(page,"connection-sms-fields",[credential,fixture.sessionToken,secret,fixture.fixture.own.email,fixture.context.actorUserId],"connection-fields-captures.json");
        }finally{await context.close();await browser.close();}
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential},messagingSecurity:{environment:securityConfig.environment,securityEpoch:securityConfig.securityEpoch,keyringsJson},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },600_000);
});
