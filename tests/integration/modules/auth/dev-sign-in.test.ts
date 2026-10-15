// @vitest-environment node
/**
 * Runs the development sign-in through a real Better Auth instance. Only the
 * storage differs from the app: Better Auth's in-memory adapter replaces
 * Postgres, so the endpoints, hooks, password hashing and cookies are the
 * library's own.
 */
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

import { withDevSignIn } from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-auth-options";

const BASE_URL = "https://dev.tutribu.example";
const DEV_EMAIL = "dev@tutribu.example";
const DEV_PASSWORD = "dev-password-123";
const DEV_ENVIRONMENT = {
  DEV_SIGN_IN: "1",
  DEV_SIGN_IN_EMAIL: DEV_EMAIL,
  DEV_SIGN_IN_NAME: "Dev Tribu",
  DEV_SIGN_IN_PASSWORD: DEV_PASSWORD,
  NODE_ENV: "development",
};

type MemoryDatabase = Record<string, Record<string, unknown>[]>;

function createMemoryDatabase(): MemoryDatabase {
  return { account: [], session: [], user: [], verification: [] };
}

function createAuth(
  environment: Record<string, string>,
  database: MemoryDatabase = createMemoryDatabase()
) {
  return betterAuth(
    withDevSignIn(
      {
        baseURL: BASE_URL,
        database: memoryAdapter(database),
        secret: "integration-test-secret-with-enough-entropy",
      },
      environment
    )
  );
}

function postAuth(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body: Record<string, string>
) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: BASE_URL },
      method: "POST",
    })
  );
}

function readSessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("development sign-in", () => {
  it("provisions the dev member on first sign-in and opens a session", async () => {
    const database = createMemoryDatabase();
    const auth = createAuth(DEV_ENVIRONMENT, database);

    const response = await postAuth(auth, "/sign-in/email", {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });

    expect(response.status).toBe(200);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: readSessionCookie(response) }),
    });
    expect(session?.user).toMatchObject({
      email: DEV_EMAIL,
      emailVerified: true,
      name: "Dev Tribu",
    });
    expect(database.user).toHaveLength(1);
  });

  it("reuses the dev member on later sign-ins and follows a password change", async () => {
    const database = createMemoryDatabase();
    await postAuth(createAuth(DEV_ENVIRONMENT, database), "/sign-in/email", {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    const rotatedAuth = createAuth(
      { ...DEV_ENVIRONMENT, DEV_SIGN_IN_PASSWORD: "rotated-password-456" },
      database
    );

    const oldPasswordResponse = await postAuth(rotatedAuth, "/sign-in/email", {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    const newPasswordResponse = await postAuth(rotatedAuth, "/sign-in/email", {
      email: DEV_EMAIL,
      password: "rotated-password-456",
    });

    expect(oldPasswordResponse.status).toBe(401);
    expect(newPasswordResponse.status).toBe(200);
    expect(database.user).toHaveLength(1);
    expect(database.account).toHaveLength(1);
  });

  it("links the credential to an existing member with the same email", async () => {
    const database = createMemoryDatabase();
    const now = new Date();
    database.user.push({
      createdAt: now,
      email: DEV_EMAIL,
      emailVerified: true,
      id: "google-member",
      name: "Miembro de Google",
      updatedAt: now,
    });

    const response = await postAuth(createAuth(DEV_ENVIRONMENT, database), "/sign-in/email", {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(database.user).toHaveLength(1);
    expect(database.account).toEqual([
      expect.objectContaining({ providerId: "credential", userId: "google-member" }),
    ]);
  });

  it("signs in with the longest password the startup check allows", async () => {
    const longestPassword = "x".repeat(128);
    const auth = createAuth({ ...DEV_ENVIRONMENT, DEV_SIGN_IN_PASSWORD: longestPassword });

    const response = await postAuth(auth, "/sign-in/email", {
      email: DEV_EMAIL,
      password: longestPassword,
    });

    expect(response.status).toBe(200);
  });

  it("rejects any email other than the dev member without creating it", async () => {
    const database = createMemoryDatabase();

    const response = await postAuth(createAuth(DEV_ENVIRONMENT, database), "/sign-in/email", {
      email: "someone@tutribu.example",
      password: DEV_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(database.user).toHaveLength(0);
  });

  it("keeps public email sign-up closed", async () => {
    const response = await postAuth(createAuth(DEV_ENVIRONMENT), "/sign-up/email", {
      email: "new@tutribu.example",
      name: "Nuevo",
      password: DEV_PASSWORD,
    });

    expect(response.status).toBe(400);
  });

  it("does not register email sign-in in a production build even with the flag set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const database = createMemoryDatabase();

    const response = await postAuth(
      createAuth({ ...DEV_ENVIRONMENT, NODE_ENV: "production" }, database),
      "/sign-in/email",
      { email: DEV_EMAIL, password: DEV_PASSWORD }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_PASSWORD_DISABLED",
    });
    expect(database.user).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
