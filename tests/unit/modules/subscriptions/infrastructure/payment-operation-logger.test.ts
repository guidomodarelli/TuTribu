import { logPaymentOperation } from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";
import type { ServerLogEntry } from "@/src/modules/shared/infrastructure/observability/server-logger";

describe("payment operation logger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should write payment trace metadata with redacted provider identifiers", () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    logPaymentOperation({
      context: {
        operationKey: "operation-1",
        preapprovalId: "preapproval-secret-1234567890",
        priceId: "price-1",
        providerPlanId: "plan-secret-1234567890",
        requestId: "request-1",
        tribeSlug: "matematica-pro",
      },
      message: "Mercado Pago payment operation completed",
      operation: "create-mercado-pago-preapproval-plan",
      result: "success",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [serializedEntry] = infoSpy.mock.calls[0];
    const entry = JSON.parse(serializedEntry as string) as ServerLogEntry;

    expect(entry).toMatchObject({
      feature: "subscriptions",
      level: "info",
      message: "Mercado Pago payment operation completed",
      operation: "create-mercado-pago-preapproval-plan",
      requestId: "request-1",
    });
    expect(entry.metadata).toMatchObject({
      operation_key: "operation-1",
      priceId: "price-1",
      result: "success",
      tribeSlug: "matematica-pro",
    });
    expect(entry.metadata?.providerPlanId).toMatch(/^\[redacted:[a-f0-9]{12}\]$/);
    expect(entry.metadata?.preapprovalId).toMatch(/^\[redacted:[a-f0-9]{12}\]$/);
    expect(serializedEntry).not.toContain("plan-secret-1234567890");
    expect(serializedEntry).not.toContain("preapproval-secret-1234567890");
  });
});
