/** @vitest-environment node */
/** Exercises actual Next/UI/auth/SQL in both engines with closed provider HTTP and ephemeral synthetic key input. @module messaging-connections-browser-ui-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native connection wizard first step",()=>{
  it.each([{name:"chromium",engine:chromium,width:1280},{name:"chromium",engine:chromium,width:390},{name:"webkit",engine:webkit,width:1280},{name:"webkit",engine:webkit,width:390}])("should preserve key privacy and reconcile a lost creation response on $name at $width",async({name,engine,width})=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=randomUUID();
      for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"}),page=await context.newPage(),errors:string[]=[];page.on("pageerror",(error)=>errors.push(error.message));
        try{
          await context.addCookies([{name:"better-auth.session_token",value:encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`),url:origin,httpOnly:true,sameSite:"Lax"}]);
          await page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`,{waitUntil:"networkidle",timeout:120_000});await page.getByLabel("Nombre de la conexión",{exact:true}).waitFor();await page.waitForFunction(()=>!(document.querySelector('input[placeholder="Mensajería de mi academia"]') as HTMLInputElement|null)?.disabled);
          if(name==="chromium"&&width===1280)await captureAdmissionReview(page,"connection-empty",[credential,fixture.sessionToken,secret,fixture.fixture.own.email,fixture.context.actorUserId],"connection-captures.json");
          await page.route(`**/api/tribes/${slug}/messaging/connections`,async(route)=>{try{await route.fetch({timeout:120_000});await route.abort("failed");}catch{throw new Error("Connection wizard test transport failed before controlled response loss");}});
          await page.getByLabel("Nombre de la conexión",{exact:true}).fill("Zavu de la academia");await page.getByLabel("Clave de Zavu",{exact:true}).fill(credential);await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Guardar conexión",exact:true}).click();
          await page.getByRole("button",{name:"Consultar guardado",exact:true}).waitFor({timeout:120_000});await page.waitForFunction(()=>{const button=Array.from(document.querySelectorAll("button")).find((element)=>element.textContent?.trim()==="Consultar guardado");return Boolean(button&&!button.disabled);},{},{timeout:120_000});expect((await page.getByLabel("Clave de Zavu",{exact:true}).inputValue())==="").toBe(true);expect(providerRequests).toBe(0);
          const stored=await page.evaluate(()=>Object.values(sessionStorage).join("\n"));expect(stored).not.toContain(credential);expect(stored).not.toContain(fixture.sessionToken);
          await page.unroute(`**/api/tribes/${slug}/messaging/connections`);await page.getByRole("button",{name:"Consultar guardado",exact:true}).click();await page.getByRole("heading",{name:"Conexión candidata",exact:true}).waitFor({timeout:120_000});expect(await page.getByText("Zavu de la academia",{exact:true}).count()).toBe(1);expect(providerRequests).toBe(0);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);expect(errors).toEqual([]);
          if(name==="chromium"&&width===1280)await captureAdmissionReview(page,"connection-candidate",[credential,fixture.sessionToken,secret,fixture.fixture.own.email,fixture.context.actorUserId],"connection-captures.json");
          const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${tribeId}) as connections,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows[0]);expect(counts).toEqual({connections:1,deliveries:0});
        }finally{await page.unrouteAll({behavior:"ignoreErrors"});await context.close();await browser.close();}
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },600_000);
});
