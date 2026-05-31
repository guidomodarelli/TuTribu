/**
 * @jest-environment node
 */
import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  attachRequestContextToResponse,
  attachRequestIdToResponse,
  resolveRequestContext,
} from "@/src/modules/shared/infrastructure/observability/request-context";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";
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
      expect(context.traceId).toBe(context.requestId);
    });

    it("reuses the incoming trace id when the header is present", () => {
      const context = resolveRequestContext(
        new Headers({
          [REQUEST_ID_HEADER]: "req-existing",
          [TRACE_ID_HEADER]: "trace-existing",
        })
      );

      expect(context.requestId).toBe("req-existing");
      expect(context.traceId).toBe("trace-existing");
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

    it("adds request and trace headers to the response", () => {
      const response = new Response("ok", {
        status: 202,
      });

      const responseWithCorrelation = attachRequestContextToResponse(response, {
        requestId: "req-123",
        traceId: "trace-123",
      });

      expect(responseWithCorrelation.headers.get(REQUEST_ID_HEADER)).toBe("req-123");
      expect(responseWithCorrelation.headers.get(TRACE_ID_HEADER)).toBe("trace-123");
      expect(responseWithCorrelation.status).toBe(202);
    });

    it("adds the request id header to immutable redirect responses", () => {
      const redirectResponse = Response.redirect("https://tutribu.example.com", 303);

      const responseWithRequestId = attachRequestIdToResponse(
        redirectResponse,
        "req-redirect"
      );

      expect(responseWithRequestId.headers.get(REQUEST_ID_HEADER)).toBe("req-redirect");
      expect(responseWithRequestId.headers.get("Location")).toBe(
        "https://tutribu.example.com/"
      );
      expect(responseWithRequestId.status).toBe(303);
    });
  });

  describe("createRouteObservation", () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it("creates JSON responses with correlation headers and outcome logs", async () => {
      const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
      const observation = createRouteObservation({
        feature: "messages",
        operation: "list-tribe-channels",
        request: new Request("https://tutribu.example.com/api/tribes/test/channels", {
          headers: {
            [REQUEST_ID_HEADER]: "req-123",
            [TRACE_ID_HEADER]: "trace-123",
          },
        }),
      });

      const response = observation.createJsonResponse(
        { ok: true },
        200,
        {
          message: "Tribe channel listing completed",
          metadata: {
            tribeSlug: "test",
          },
          outcome: "success",
        }
      );

      expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req-123");
      expect(response.headers.get(TRACE_ID_HEADER)).toBe("trace-123");
      await expect(response.json()).resolves.toEqual({ ok: true });

      const [serializedEntry] = infoSpy.mock.calls[0];
      const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

      expect(entry).toEqual(
        expect.objectContaining({
          feature: "messages",
          operation: "list-tribe-channels",
          requestId: "req-123",
          traceId: "trace-123",
          metadata: expect.objectContaining({
            durationMs: expect.any(Number),
            outcome: "success",
            status: 200,
            tribeSlug: "test",
          }),
        })
      );
    });

    it("logs route errors with status, outcome, duration, and safe metadata", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const observation = createRouteObservation({
        feature: "subscriptions",
        operation: "mercado-pago-webhook",
        request: new Request("https://tutribu.example.com/api/mercado-pago/webhooks", {
          headers: {
            [REQUEST_ID_HEADER]: "req-456",
          },
        }),
      });

      observation.logRouteError({
        error: new Error("database_down"),
        message: "Mercado Pago webhook handling failed",
        metadata: {
          eventId: "event-1",
          topic: "subscription_preapproval",
        },
        outcome: "error",
        status: 500,
      });

      const [serializedEntry] = errorSpy.mock.calls[0];
      const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

      expect(entry).toEqual(
        expect.objectContaining({
          feature: "subscriptions",
          operation: "mercado-pago-webhook",
          requestId: "req-456",
          traceId: "req-456",
          metadata: expect.objectContaining({
            durationMs: expect.any(Number),
            eventId: "event-1",
            outcome: "error",
            status: 500,
            topic: "subscription_preapproval",
          }),
          error: expect.objectContaining({
            message: "database_down",
          }),
        })
      );
    });
  });

  describe("createServerLogger", () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it("writes structured JSON info logs", () => {
      const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
      const logger = createServerLogger({
        feature: "tribes",
        operation: "get-tribe-page",
        requestId: "req-123",
      });

      logger.info({
        message: "Tribe page resolved",
        metadata: {
          slug: "matematica-pro",
        },
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const [serializedEntry] = infoSpy.mock.calls[0];
      const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

      expect(entry).toEqual({
        level: "info",
        message: "Tribe page resolved",
        feature: "tribes",
        operation: "get-tribe-page",
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
