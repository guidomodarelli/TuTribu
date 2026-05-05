/**
 * @jest-environment node
 */
import {
  REQUEST_ID_HEADER,
  attachRequestIdToResponse,
  resolveRequestContext,
} from "@/src/modules/shared/infrastructure/observability/request-context";
import {
  createServerLogger,
  type ServerLogEntry,
} from "@/src/modules/shared/infrastructure/observability/server-logger";

describe("server observability", () => {
  describe("resolveRequestContext", () => {
    it("reuses the incoming request id when the header is present", () => {
      const context = resolveRequestContext(
        new Headers({
          [REQUEST_ID_HEADER]: "req-existing",
        })
      );

      expect(context.requestId).toBe("req-existing");
    });

    it("generates a request id when the header is missing", () => {
      const context = resolveRequestContext(new Headers());

      expect(context.requestId).toEqual(expect.any(String));
      expect(context.requestId).not.toHaveLength(0);
    });
  });

  describe("attachRequestIdToResponse", () => {
    it("adds the request id header to the response", () => {
      const response = new Response("ok", {
        headers: {
          "Content-Type": "text/plain",
        },
        status: 201,
      });

      const responseWithRequestId = attachRequestIdToResponse(response, "req-123");

      expect(responseWithRequestId.headers.get(REQUEST_ID_HEADER)).toBe("req-123");
      expect(responseWithRequestId.headers.get("Content-Type")).toBe("text/plain");
      expect(responseWithRequestId.status).toBe(201);
    });

    it("adds the request id header to immutable redirect responses", () => {
      const redirectResponse = Response.redirect("https://latribu.example.com", 303);

      const responseWithRequestId = attachRequestIdToResponse(
        redirectResponse,
        "req-redirect"
      );

      expect(responseWithRequestId.headers.get(REQUEST_ID_HEADER)).toBe("req-redirect");
      expect(responseWithRequestId.headers.get("Location")).toBe(
        "https://latribu.example.com/"
      );
      expect(responseWithRequestId.status).toBe(303);
    });
  });

  describe("createServerLogger", () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it("writes structured JSON info logs", () => {
      const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
      const logger = createServerLogger({
        feature: "communities",
        operation: "get-community-page",
        requestId: "req-123",
      });

      logger.info({
        message: "Community page resolved",
        metadata: {
          slug: "matematica-pro",
        },
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const [serializedEntry] = infoSpy.mock.calls[0];
      const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

      expect(entry).toEqual({
        level: "info",
        message: "Community page resolved",
        feature: "communities",
        operation: "get-community-page",
        requestId: "req-123",
        metadata: {
          slug: "matematica-pro",
        },
      });
    });

    it("writes structured JSON error logs with error details", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const logger = createServerLogger({
        feature: "auth",
        operation: "sign-out",
        requestId: "req-456",
      });

      logger.error({
        message: "Sign out failed",
        error: new Error("boom"),
        metadata: {
          memberId: "member-1",
        },
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [serializedEntry] = errorSpy.mock.calls[0];
      const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

      expect(entry).toEqual(
        expect.objectContaining({
          level: "error",
          message: "Sign out failed",
          feature: "auth",
          operation: "sign-out",
          requestId: "req-456",
          metadata: {
            memberId: "member-1",
          },
          error: expect.objectContaining({
            message: "boom",
            name: "Error",
          }),
        })
      );
    });
  });
});
