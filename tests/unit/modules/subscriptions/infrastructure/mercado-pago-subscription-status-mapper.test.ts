import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { mapMercadoPagoSubscriptionStatus } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";

describe("mapMercadoPagoSubscriptionStatus", () => {
  it.each([
    [
      "authorized",
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none,
      true,
    ],
    [
      "pending",
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
      true,
    ],
    [
      "paused",
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      true,
    ],
    [
      "canceled",
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      false,
    ],
    [
      "cancelled",
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      false,
    ],
    [
      null,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
      TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      false,
    ],
  ])(
    "should map %s provider status when Mercado Pago reports it",
    (
      providerStatus,
      expectedStatus,
      expectedStatusReason,
      expectedProviderPlanAttachment
    ) => {
      // Act
      const mappedStatus = mapMercadoPagoSubscriptionStatus(providerStatus);

      // Assert
      expect(mappedStatus).toEqual({
        isAttachedToProviderPlan: expectedProviderPlanAttachment,
        status: expectedStatus,
        statusReason: expectedStatusReason,
      });
    }
  );

  it("should keep unknown provider statuses pending when Mercado Pago adds a new attached lifecycle", () => {
    // Act
    const mappedStatus = mapMercadoPagoSubscriptionStatus("in_process");

    // Assert
    expect(mappedStatus).toEqual({
      isAttachedToProviderPlan: true,
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
    });
  });
});
