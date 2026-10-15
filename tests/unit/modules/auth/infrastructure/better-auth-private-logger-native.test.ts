/** @vitest-environment node */
/** Observes the real SDK's database-failure output without preserving its private session material. @module better-auth-private-logger-native-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { format } from "node:util";
import { betterAuth, APIError, logger as providerLogger, type DBAdapterInstance, type User } from "better-auth";
import { makeSignature } from "better-auth/crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import {DrizzleQueryError} from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { accounts, sessions, users, verifications } from "@/src/modules/shared/infrastructure/database/schema";
import { BETTER_AUTH_PRIVACY_TEST } from "@/tests/support/constants/better-auth-privacy";
import { createBetterAuthLogger } from "@/src/modules/auth/infrastructure/better-auth/better-auth-logger";
import { BETTER_AUTH_SESSION_FAILURE, SERVER_RENDER_SESSION_QUERY } from "@/src/modules/auth/constants/better-auth-session";
import { BETTER_AUTH_PROVIDER } from "@/src/modules/auth/constants/better-auth-config";
import {createPrivateAuthDatabaseAdapter} from "@/src/modules/auth/infrastructure/better-auth/private-auth-database-adapter";
import {AuthDatabaseOperationError} from "@/src/modules/auth/infrastructure/better-auth/auth-database-operation-error";
import {buildAuthEvidenceRouteHandlers} from "@/src/modules/auth/infrastructure/composition/auth-evidence-route-handlers";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native Better Auth private diagnostics", () => {
  it("should preserve real adapter CRUD, transactions, consumption, metadata and callback failures", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect();
          const schema = { account: accounts, session: sessions, user: users, verification: verifications };
          const originalFactory = drizzleAdapter(drizzle(client, { schema }), { provider: BETTER_AUTH_PROVIDER.database, schema, transaction: true });
          let original: ReturnType<DBAdapterInstance> | undefined;
          const instance = betterAuth({ baseURL: BETTER_AUTH_PRIVACY_TEST.localBaseUrl, secret: randomBytes(BETTER_AUTH_PRIVACY_TEST.secretBytes).toString("hex"), logger: createBetterAuthLogger(), database: createPrivateAuthDatabaseAdapter((options) => { original = originalFactory(options); return original; }) });
          const adapter = (await instance.$context).adapter;
          expect(adapter.id).toBe(original?.id);
          expect(adapter.options).toBe(original?.options);
          const email = `${randomUUID()}@example.test`, instant = new Date();
          const created = await adapter.transaction((transaction) => transaction.create<User>({ model: "user", data: { email, name: "Synthetic private adapter member", emailVerified: false, createdAt: instant, updatedAt: instant } }));
          expect((await client.query('select count(*)::integer as total from public."user" where id=$1', [created.id])).rows[0].total).toBe(1);
          expect(await adapter.count({ model: "user", where: [{ field: "id", value: created.id }] })).toBe(1);
          expect((await adapter.findMany<{ id: string }>({ model: "user", where: [{ field: "id", value: created.id }] })).map((member) => member.id)).toEqual([created.id]);
          const renamed = await adapter.update<{ name: string }>({ model: "user", where: [{ field: "id", value: created.id }], update: { name: "Synthetic renamed member" } });
          expect(renamed?.name).toBe("Synthetic renamed member");
          await adapter.updateMany({ model: "user", where: [{ field: "id", value: created.id }], update: { emailVerified: true } });
          expect((await client.query('select "emailVerified" from public."user" where id=$1', [created.id])).rows[0].emailVerified).toBe(true);
          const rollbackEmail = `${randomUUID()}@example.test`;
          const denied = new APIError("FORBIDDEN", { code: "SYNTHETIC_CALLBACK_DENIED", message: "Synthetic callback denied" });
          let callbackFailure: unknown;
          try {
            await adapter.transaction(async (transaction) => {
              await transaction.create({ model: "user", data: { email: rollbackEmail, name: "Synthetic rolled-back member", emailVerified: false, createdAt: instant, updatedAt: instant } });
              throw denied;
            });
          } catch (error) { callbackFailure = error; }
          expect(callbackFailure === denied).toBe(true);
          expect((await client.query('select count(*)::integer as total from public."user" where email=$1', [rollbackEmail])).rows[0].total).toBe(0);
          const redirect = Response.redirect(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/tribes`);
          let redirectFailure: unknown;
          try { await adapter.transaction(async () => { throw redirect; }); }
          catch (error) { redirectFailure = error; }
          expect(redirectFailure === redirect).toBe(true);
          let constraintFailure: unknown;
          const privateParameter = randomUUID();
          try {
            await adapter.transaction(async (transaction) => {
              await transaction.create({ model: "user", data: { email, name: privateParameter, emailVerified: false, createdAt: instant, updatedAt: instant } });
            });
          } catch (error) { constraintFailure = error; }
          expect(constraintFailure instanceof AuthDatabaseOperationError).toBe(true);
          if (!(constraintFailure instanceof AuthDatabaseOperationError)) throw new Error("Native transactional constraint did not reach the private boundary");
          expect(constraintFailure.operation).toBe("create");
          expect(constraintFailure.cause instanceof DrizzleQueryError).toBe(true);
          const cause = (constraintFailure.cause as DrizzleQueryError).cause;
          expect(cause && typeof cause === "object" && "code" in cause ? cause.code : null).toBe("23505");
          expect(format(constraintFailure.cause).includes(privateParameter)).toBe(true);
          expect(format(constraintFailure).includes(privateParameter)).toBe(false);
          // A failed real transaction must roll back and leave the same connection usable.
          expect(await adapter.count({ model: "user", where: [{ field: "id", value: created.id }] })).toBe(1);
          const identifier = randomUUID();
          await adapter.create({ model: "verification", data: { identifier, value: randomUUID(), expiresAt: instant, createdAt: instant, updatedAt: instant } });
          const consumed = await adapter.consumeOne<{ identifier: string }>({ model: "verification", where: [{ field: "identifier", value: identifier }] });
          expect(consumed?.identifier).toBe(identifier);
          expect(await adapter.consumeOne({ model: "verification", where: [{ field: "identifier", value: identifier }] })).toBeNull();
          expect(await adapter.deleteMany({ model: "verification", where: [{ field: "identifier", value: identifier }] })).toBe(0);
          await adapter.delete({ model: "user", where: [{ field: "id", value: created.id }] });
          expect(await adapter.findOne({ model: "user", where: [{ field: "id", value: created.id }] })).toBeNull();
        } finally { await client.end(); }
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should retain a failed session diagnostic without serializing the real query's session token", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const token = randomUUID(), secret = randomBytes(BETTER_AUTH_PRIVACY_TEST.secretBytes).toString("hex");
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        let leaked = false, diagnostics = 0;
        const capture = vi.spyOn(console, "error").mockImplementation((...argumentsList: unknown[]) => {
          diagnostics += 1;
          // Match actual Console formatting in memory; only the boolean is asserted or retained.
          leaked ||= format(...argumentsList).includes(token);
        });
        try {
          await client.connect();
          await client.query(`set role "${database.nonBypassRole.name.replaceAll('"', '""')}"`);
          let databaseCode: string | undefined;
          try { await client.query('select token from public.session where token=$1', [token]); }
          catch (error) { databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : undefined; }
          expect(databaseCode).toBe("42501");
          const instance = betterAuth({
            baseURL: BETTER_AUTH_PRIVACY_TEST.localBaseUrl, secret,
            logger: createBetterAuthLogger(),
            database: createPrivateAuthDatabaseAdapter(drizzleAdapter(drizzle(client, { schema: { account: accounts, session: sessions, user: users, verification: verifications } }), { provider: BETTER_AUTH_PROVIDER.database, schema: { account: accounts, session: sessions, user: users, verification: verifications } })),
          });
          const cookieName = (await instance.$context).authCookies.sessionToken.name;
          const headers = new Headers({ cookie: `${cookieName}=${encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)}` });
          let privateFailure:unknown;
          try {await (await instance.$context).adapter.findOne({model:"session",where:[{field:"token",value:token}]});}catch(error){privateFailure=error;}
          expect(privateFailure instanceof AuthDatabaseOperationError).toBe(true);
          if(!(privateFailure instanceof AuthDatabaseOperationError))throw new Error("Native auth failure did not reach its private adapter boundary");
          expect(privateFailure.cause instanceof DrizzleQueryError).toBe(true);
          expect(format(privateFailure.cause).includes(token)).toBe(true);
          expect([String(privateFailure),format(privateFailure),JSON.stringify(privateFailure)].some((representation)=>representation.includes(token))).toBe(false);
          // The installed OAuth helper also uses this actual singleton logger, outside options.logger.
          providerLogger.error("Unable to link account",privateFailure);
          await expect(instance.api.getSession({ headers, query: SERVER_RENDER_SESSION_QUERY })).rejects.toMatchObject({ statusCode: BETTER_AUTH_SESSION_FAILURE.numericStatus, body: { code: BETTER_AUTH_SESSION_FAILURE.bodyCode } });
          const routes=buildAuthEvidenceRouteHandlers(instance),requestId=randomUUID(),traceId=randomUUID();
          const response=await routes.GET(new Request(`${BETTER_AUTH_PRIVACY_TEST.localBaseUrl}/api/auth/get-session`,{headers:new Headers({...Object.fromEntries(headers),"x-request-id":requestId,"x-trace-id":traceId})}));
          expect(response.status).toBe(500);
          expect(response.headers.get("cache-control")).toBe("no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");expect(response.headers.get("x-request-id")).toBe(requestId);
          expect(JSON.stringify(await response.json()).includes(token)).toBe(false);
          expect(diagnostics).toBeGreaterThan(0);
          expect(leaked).toBe(false);
        } finally { capture.mockRestore(); await client.end(); }
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
