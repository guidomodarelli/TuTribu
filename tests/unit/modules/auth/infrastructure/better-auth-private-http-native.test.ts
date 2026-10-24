/** @vitest-environment node */
/** Exercises the built Next auth entrypoints with actual PostgreSQL and signed synthetic cookies. @module better-auth-private-http-native-tests */
import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { getCookies } from "better-auth/cookies";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { BETTER_AUTH_SERVER_ONLY_HTTP_PATHS } from "@/src/modules/auth/constants/better-auth-config";
import { SECONDS_PER_DAY, MILLISECONDS_PER_SECOND } from "@/src/constants/time";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("built Next private authentication", () => {
  it("should protect current sessions, OAuth token routes and foreign-origin intent creation in the actual composition", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect();
          const userId = randomUUID(), sessionId = randomUUID(), token = randomUUID();
          const expiration = new Date(Date.now() + SECONDS_PER_DAY * MILLISECONDS_PER_SECOND);
          await client.query('insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now())', [userId, "Synthetic Next privacy member", `${randomUUID()}@example.test`]);
          await client.query('insert into public.session(id,token,"userId","expiresAt","createdAt","updatedAt") values($1,$2,$3,$4,now(),now())', [sessionId, token, userId, expiration]);
          await withAdmissionNextServer(environment, `synthetic-${randomUUID()}`, async (origin, secret) => {
            const cookieName = getCookies({ baseURL: origin }).sessionToken.name;
            const cookie = `${cookieName}=${encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)}`;
            const requestId = randomUUID(), traceId = randomUUID();
            const headers = new Headers({ cookie, "x-request-id": requestId, "x-trace-id": traceId });
            const current = await fetch(`${origin}/api/auth/get-session`, { headers });
            expect(current.status).toBe(200);
            const session = await current.json();
            expect(session).toMatchObject({ user: { id: userId }, session: { id: sessionId } });
            expect(JSON.stringify(session).includes(token)).toBe(false);
            expect(current.headers.get("cache-control")).toBe("no-store");
            expect(current.headers.get("referrer-policy")).toBe("no-referrer");
            expect(current.headers.get("x-request-id")).toBe(requestId);
            expect(current.headers.get("x-trace-id")).toBe(traceId);
            const listed = await fetch(`${origin}/api/auth/list-sessions`, { headers });
            expect(listed.status).toBe(200);
            const sessions = await listed.json();
            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe(sessionId);
            expect(JSON.stringify(sessions).includes(token)).toBe(false);
            const anonymous = await fetch(`${origin}/api/auth/get-session`);
            expect(anonymous.status).toBe(200);
            expect(await anonymous.json()).toBeNull();
            for (const path of BETTER_AUTH_SERVER_ONLY_HTTP_PATHS) {
              const blocked = await fetch(`${origin}/api/auth${path}`, { method: "POST", headers: new Headers({ cookie, origin, "content-type": "application/json" }), body: JSON.stringify({ providerId: "google" }) });
              expect(blocked.status).toBe(404);
              expect(blocked.headers.get("cache-control")).toBe("no-store");
              expect(blocked.headers.get("referrer-policy")).toBe("no-referrer");
            }
            for (const contentType of ["application/json", "text/plain"]) {
              const denied = await fetch(`${origin}/api/auth/reauthentication/intents`, { method: "POST", headers: new Headers({ cookie, origin: "https://foreign.example.test", "content-type": contentType }), body: "not-a-readable-command" });
              expect(denied.status).toBe(403);
              expect(denied.headers.get("cache-control")).toBe("no-store");
              expect(denied.headers.get("referrer-policy")).toBe("no-referrer");
              expect(await denied.json()).toMatchObject({ code: "context_unavailable" });
            }
            expect((await client.query('select count(*)::integer as total from public.session where "userId"=$1 and id=$2', [userId, sessionId])).rows[0].total).toBe(1);
          });
        } finally { await client.end(); }
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
