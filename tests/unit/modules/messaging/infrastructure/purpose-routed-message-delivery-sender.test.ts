/** @vitest-environment node */
/** Exercises private sender selection without treating source metadata as authority to open material. @module purpose-routed-message-delivery-sender-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDelivery } from "@/src/modules/messaging/domain/entities/message-delivery";
import { PurposeRoutedMessageDeliverySender } from "@/src/modules/messaging/infrastructure/purpose-routed-message-delivery-sender";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";

/** @param purpose - Original native purpose hint. @param groupId - Explicit native group provenance. @returns Own port observations and one transient context without real credentials. */
function routingFixture(purpose: MessageDelivery["purpose"], groupId: string | null) {
  const context: AuthorizedDeliveryMessagingContext = { authorizationPurpose: MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery, contributingLeaderUserId: randomUUID(), tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, environment: "synthetic", securityEpoch: randomUUID(), requestId: randomUUID(), secretRef: randomUUID(), deliveryId: randomUUID(), attemptId: randomUUID(), attemptVersion: 1, leaseToken: randomUUID(), sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 1, operation: MESSAGING_SECRET_DELIVERY_SCOPE.operation, deliveryPurpose: purpose, notificationGroupId: groupId };
  const receipt = { outcome: MESSAGE_ATTEMPT_STATE.accepted, providerMessageId: randomUUID(), correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted };
  const verificationOperation = { send: vi.fn(async () => receipt) }, notificationOperation = { send: vi.fn(async () => receipt) };
  const verification = { prepare: vi.fn(async () => verificationOperation) }, notification = { prepare: vi.fn(async () => notificationOperation) };
  return { context, verification, notification, verificationOperation, notificationOperation, sender: new PurposeRoutedMessageDeliverySender(verification, notification) };
}

describe("private native-purpose sender routing", () => {
  it("should report missing global notification composition before checkout, authority, keys or sender creation", () => {
    const fixture = routingFixture(NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, randomUUID());
    const checkout = vi.fn(), authorize = vi.fn(async () => true), readSecurityConfig = vi.fn(async () => { throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied); });
    const createSender = vi.fn(() => fixture.verification);
    expect(() => buildMessagingWorkModule({ execute: async () => { checkout(); throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied); }, authorize, readSecurityConfig, createSender, runtime: { now: Date.now, createId: randomUUID, report: vi.fn(), defer: vi.fn() } })).toThrow(expect.objectContaining({ code: MESSAGING_ERROR_CODE.connectionIncomplete }));
    expect(checkout).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(readSecurityConfig).not.toHaveBeenCalled();
    expect(createSender).not.toHaveBeenCalled();
  });

  it.each([ADMISSION_VERIFICATION_PURPOSE.admission, ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic])("should retain the original verification operation and cancellation when the native purpose is %s", async (purpose) => {
    const fixture = routingFixture(purpose, null), signal = new AbortController().signal;
    expect(await fixture.sender.prepare(fixture.context, signal)).toBe(fixture.verificationOperation);
    expect(fixture.verification.prepare).toHaveBeenCalledExactlyOnceWith(fixture.context, signal);
    expect(fixture.notification.prepare).not.toHaveBeenCalled();
    expect(fixture.verificationOperation.send).not.toHaveBeenCalled();
    expect(fixture.notificationOperation.send).not.toHaveBeenCalled();
  });

  it("should select the complete-group owner without starting or preparing a verification request when explicit native group provenance is present", async () => {
    const fixture = routingFixture(NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, randomUUID()), signal = new AbortController().signal;
    expect(await fixture.sender.prepare(fixture.context, signal)).toBe(fixture.notificationOperation);
    expect(fixture.notification.prepare).toHaveBeenCalledExactlyOnceWith(fixture.context, signal);
    expect(fixture.verification.prepare).not.toHaveBeenCalled();
    expect(fixture.notificationOperation.send).not.toHaveBeenCalled();
  });

  it.each([
    { purpose: NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, groupId: null },
    { purpose: ADMISSION_VERIFICATION_PURPOSE.admission, groupId: randomUUID() },
    { purpose: ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic, groupId: randomUUID() },
  ] as const)("should close before either material owner when native provenance is incompatible, $purpose / $groupId", async ({ purpose, groupId }) => {
    const fixture = routingFixture(purpose, groupId);
    await expect(fixture.sender.prepare(fixture.context, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
    expect(fixture.verification.prepare).not.toHaveBeenCalled();
    expect(fixture.notification.prepare).not.toHaveBeenCalled();
  });

  it("should close an unregistered grouped purpose without falling back to verification", async () => {
    const fixture = routingFixture(NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, randomUUID());
    await expect(new PurposeRoutedMessageDeliverySender(fixture.verification).prepare(fixture.context, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
    expect(fixture.verification.prepare).not.toHaveBeenCalled();
  });

  it("should retain the exact original cancellation without entering either preparation when the run is already aborted", async () => {
    const fixture = routingFixture(NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, randomUUID()), controller = new AbortController();
    const cancellation = new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    controller.abort(cancellation);
    await expect(fixture.sender.prepare(fixture.context, controller.signal)).rejects.toBe(cancellation);
    expect(fixture.verification.prepare).not.toHaveBeenCalled();
    expect(fixture.notification.prepare).not.toHaveBeenCalled();
  });

  it("should preserve the original notification denial without retrying or substituting verification", async () => {
    const fixture = routingFixture(NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, randomUUID());
    const denial = new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    fixture.notification.prepare.mockRejectedValueOnce(denial);
    await expect(fixture.sender.prepare(fixture.context, new AbortController().signal)).rejects.toBe(denial);
    expect(fixture.notification.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.verification.prepare).not.toHaveBeenCalled();
  });
});
