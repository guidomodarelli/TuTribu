/** @jest-environment node */

describe("Better Auth server auth context", () => {
  const createServerLogger = jest.fn();
  const loggerWarn = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    createServerLogger.mockReset();
    loggerWarn.mockReset();
  });

  it("retries transient session lookup failures before returning the session", async () => {
    const session = {
      session: {
        id: "session-1",
        userId: "member-1",
      },
      user: {
        id: "member-1",
        email: "member@example.com",
        image: null,
        name: "Member Example",
      },
    };
    const sessionFailure = Object.assign(new Error("Failed to get session"), {
      body: {
        code: "FAILED_TO_GET_SESSION",
        message: "Failed to get session",
      },
      status: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    const getSession = jest
      .fn()
      .mockRejectedValueOnce(sessionFailure)
      .mockResolvedValueOnce(session);

    jest.doMock("next/headers", () => ({
      headers: jest.fn(async () => new Headers({ "x-request-id": "request-1" })),
    }));
    jest.doMock("@/src/modules/auth/infrastructure/better-auth/auth", () => ({
      auth: {
        api: {
          getSession,
        },
      },
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: createServerLogger.mockReturnValue({
          error: jest.fn(),
          info: jest.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { getServerBetterAuthSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/server-auth-context"
    );

    await expect(getServerBetterAuthSession()).resolves.toEqual(session);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(createServerLogger).toHaveBeenCalledWith({
      feature: "auth",
      operation: "better_auth_session_lookup",
      requestId: "request-1",
    });
    expect(loggerWarn).toHaveBeenCalledWith({
      message: "Better Auth session lookup failed transiently; retrying once.",
      metadata: {
        dependency: "better-auth",
        errorCode: "FAILED_TO_GET_SESSION",
        errorMessage: "Failed to get session",
        errorStatus: "INTERNAL_SERVER_ERROR",
        errorStatusCode: 500,
        operation: "get_session",
      },
      error: sessionFailure,
    });
  });

  it("does not retry when the failure was caused by a connection acquisition timeout", async () => {
    const sessionFailure = Object.assign(new Error("Failed to get session"), {
      body: {
        code: "FAILED_TO_GET_SESSION",
        message: "Failed to get session",
      },
      cause: new Error("timeout exceeded when trying to connect"),
      status: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    const getSession = jest.fn().mockRejectedValueOnce(sessionFailure);

    jest.doMock("next/headers", () => ({
      headers: jest.fn(async () => new Headers({ "x-request-id": "request-3" })),
    }));
    jest.doMock("@/src/modules/auth/infrastructure/better-auth/auth", () => ({
      auth: {
        api: {
          getSession,
        },
      },
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: createServerLogger.mockReturnValue({
          error: jest.fn(),
          info: jest.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { getServerBetterAuthSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/server-auth-context"
    );

    await expect(getServerBetterAuthSession()).rejects.toThrow(
      "Failed to get session"
    );
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("does not retry unrelated session lookup failures", async () => {
    const sessionFailure = new Error("Unexpected Better Auth failure");
    const getSession = jest.fn().mockRejectedValueOnce(sessionFailure);

    jest.doMock("next/headers", () => ({
      headers: jest.fn(async () => new Headers({ "x-request-id": "request-2" })),
    }));
    jest.doMock("@/src/modules/auth/infrastructure/better-auth/auth", () => ({
      auth: {
        api: {
          getSession,
        },
      },
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: createServerLogger.mockReturnValue({
          error: jest.fn(),
          info: jest.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { getServerBetterAuthSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/server-auth-context"
    );

    await expect(getServerBetterAuthSession()).rejects.toThrow(
      "Unexpected Better Auth failure"
    );
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
