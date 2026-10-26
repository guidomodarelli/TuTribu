/** Creates actual password accounts, HTTP sign-ins and browser cookies only against the owned sample database. @module admission-entry-sample-auth */
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { BrowserContext } from "@playwright/test";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { withDevSignIn } from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-auth-options";
import { DEV_SIGN_IN_ENDPOINT_PATH, DEV_SIGN_IN_ENVIRONMENT_VARIABLE, DEV_SIGN_IN_NODE_ENVIRONMENT } from "@/src/modules/auth/constants/dev-sign-in";
import { BETTER_AUTH_PROVIDER, BETTER_AUTH_SERVER_ONLY_HTTP_PATHS } from "@/src/modules/auth/constants/better-auth-config";
import { BETTER_AUTH_SESSION_OPTIONS } from "@/src/modules/auth/constants/session";
import { publicAuthSessionResultSchema } from "@/src/modules/auth/application/results/public-auth-session-result";
import { createBetterAuthLogger } from "@/src/modules/auth/infrastructure/better-auth/better-auth-logger";
import { createPrivateAuthDatabaseAdapter } from "@/src/modules/auth/infrastructure/better-auth/private-auth-database-adapter";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { accounts, sessions, users, verifications } from "@/src/modules/shared/infrastructure/database/schema";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { runPrivateBrowserRequest } from "./private-browser-request";
import { ADMISSION_ENTRY_SAMPLE as SAMPLE, ADMISSION_ENTRY_SAMPLE_FAILURE as FAILURE } from "./constants/admission-entry-sample";

/** Private account identifiers are used only for independent-session and SQL effect checks. */
export type AdmissionEntrySampleIdentity = { userId: string; sessionId: string; email: string };

/**
 * Opens ten real development sign-ins through Better Auth's Node HTTP adapter.
 * Each instance admits its single configured email; no registration method is added to the application.
 * Cookies are accepted by Playwright's native jar and then verified by the real Next session endpoint.
 * @param environment - The exact isolated branch's private server environment.
 * @param applicationOrigin - The running production build on loopback.
 * @param secret - Its current, unpersisted signing secret.
 * @param contexts - One independent browser context for each account.
 * @returns Private native identity references after every application session has been confirmed.
 */
export async function prepareAdmissionEntrySampleSessions(
  environment: Readonly<{ DATABASE_URL: string }>,
  applicationOrigin: string,
  secret: string,
  contexts: readonly BrowserContext[],
): Promise<AdmissionEntrySampleIdentity[]> {
  if (contexts.length !== SAMPLE.accounts) throw new Error(FAILURE.invalidCohort);
  const pool = createPostgresPool({ connectionString: environment.DATABASE_URL, operation: SAMPLE.poolOperation });
  const schema = { account: accounts, session: sessions, user: users, verification: verifications };
  const database = drizzle(pool, { schema });
  let handler: ReturnType<typeof toNodeHandler> | null = null;
  let handlerFailed = false;
  const server = createServer((request, response) => {
    if (!handler) { response.writeHead(HTTP_STATUS.serviceUnavailable).end(); return; }
    void handler(request, response).catch(() => {
      handlerFailed = true;
      if (!response.headersSent) response.writeHead(HTTP_STATUS.serverError);
      response.end();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error(FAILURE.authUnavailable);
    const authOrigin = `http://127.0.0.1:${address.port}`;
    const identities: AdmissionEntrySampleIdentity[] = [];
    for (const [index, context] of contexts.entries()) {
      const email = `entry-${randomUUID()}@example.test`, password = randomBytes(SAMPLE.passwordBytes).toString("base64url");
      const auth = betterAuth(withDevSignIn({
        baseURL: authOrigin, secret,
        database: createPrivateAuthDatabaseAdapter(drizzleAdapter(database, { provider: BETTER_AUTH_PROVIDER.database, schema })),
        disabledPaths: [...BETTER_AUTH_SERVER_ONLY_HTTP_PATHS],
        session: BETTER_AUTH_SESSION_OPTIONS,
        logger: createBetterAuthLogger(),
      }, {
        NODE_ENV: DEV_SIGN_IN_NODE_ENVIRONMENT,
        [DEV_SIGN_IN_ENVIRONMENT_VARIABLE.flag]: "1",
        [DEV_SIGN_IN_ENVIRONMENT_VARIABLE.email]: email,
        [DEV_SIGN_IN_ENVIRONMENT_VARIABLE.password]: password,
        [DEV_SIGN_IN_ENVIRONMENT_VARIABLE.name]: `Cuenta de ensayo ${index + 1}`,
      }));
      handler = toNodeHandler(auth);
      const response = await runPrivateBrowserRequest("entry_sample_sign_in", () => context.request.post(`${authOrigin}${SAMPLE.authPrefix}${DEV_SIGN_IN_ENDPOINT_PATH}`, {
        headers: { origin: authOrigin }, data: { email, password }, timeout: SAMPLE.requestTimeoutMs,
      }));
      try { if (response.status() !== HTTP_STATUS.ok || handlerFailed) throw new Error(FAILURE.signInRejected); }
      finally { await response.dispose(); }
      const sessionResponse = await runPrivateBrowserRequest("entry_sample_application_session", () => context.request.get(`${applicationOrigin}${SAMPLE.sessionPath}`, { timeout: SAMPLE.requestTimeoutMs }));
      try {
        const result = publicAuthSessionResultSchema.safeParse(await sessionResponse.json());
        if (sessionResponse.status() !== HTTP_STATUS.ok || !result.success || !result.data || result.data.user.email !== email) throw new Error(FAILURE.sessionUnconfirmed);
        identities.push({ userId: result.data.user.id, sessionId: result.data.session.id, email });
      } finally { await sessionResponse.dispose(); }
    }
    if (new Set(identities.map((identity) => identity.userId)).size !== SAMPLE.accounts
      || new Set(identities.map((identity) => identity.sessionId)).size !== SAMPLE.accounts) throw new Error(FAILURE.identityReused);
    return identities;
  } finally {
    try {
      if (server.listening) await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    } finally { await pool.end(); }
  }
}
