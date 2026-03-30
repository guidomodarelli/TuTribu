describe("Better Auth API route", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("wires the Better Auth handler once and re-exports GET and POST", async () => {
    const mockToNextJsHandler = jest.fn();
    const getMock = jest.fn();
    const postMock = jest.fn();

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
      POST: postMock,
    });
    getMock.mockResolvedValue({ status: 204 });
    postMock.mockResolvedValue({ status: 201 });

    const { GET, POST } = await import("@/app/api/auth/[...all]/route");
    const request = {
      url: "https://academia.example.com/api/auth/get-session",
    } as Request;
    const getResponse = await GET(request);
    const postResponse = await POST(request);

    expect(mockToNextJsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: {},
      })
    );
    expect(getMock).toHaveBeenCalledWith(request);
    expect(postMock).toHaveBeenCalledWith(request);
    expect(getResponse.status).toBe(204);
    expect(postResponse.status).toBe(201);
  });
});
