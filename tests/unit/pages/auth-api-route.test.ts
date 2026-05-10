describe("Better Auth API route", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("wires the Better Auth handler once and re-exports GET and POST", async () => {
    const mockToNextJsHandler = jest.fn();
    const getMock = jest.fn();
    const messageMock = jest.fn();

    jest.doMock("@/src/modules/auth/infrastructure/better-auth/auth", () => ({
      auth: {
        handler: {},
      },
    }));

    jest.doMock("better-auth/next-js", () => ({
      toNextJsHandler: (...args: unknown[]) => mockToNextJsHandler(...args),
    }));

    mockToNextJsHandler.mockReturnValue({
      GET: getMock,
      POST: messageMock,
    });
    getMock.mockResolvedValue({ status: 204 });
    messageMock.mockResolvedValue({ status: 201 });

    const { GET, POST } = await import("@/app/api/auth/[...all]/route");
    const request = {
      url: "https://tutribu.example.com/api/auth/get-session",
    } as Request;
    const [getResponse, messageResponse] = await Promise.all([
      GET(request),
      POST(request),
    ]);

    expect(mockToNextJsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: {},
      })
    );
    expect(getMock).toHaveBeenCalledWith(request);
    expect(messageMock).toHaveBeenCalledWith(request);
    expect(getResponse.status).toBe(204);
    expect(messageResponse.status).toBe(201);
  });
});
