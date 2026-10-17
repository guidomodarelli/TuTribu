/** @vitest-environment node */
/** Exercises original sender forwarding/cancellation without mocking a platform or provider SDK. @module maintenance-message-delivery-sender-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { guardMaintenanceMessageDeliverySender } from "@/src/modules/messaging/infrastructure/composition/maintenance-message-delivery-sender";
import { createAdmissionMaintenanceDeliveryContextFixture } from "@/tests/support/admission-messaging-maintenance-fixture";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import { MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS } from "@/tests/support/constants/admission-messaging-maintenance";

/** @returns Only own prepared-effect ports and real standard abort controllers. */
function fixture() {
  const controller = new AbortController(), context = createAdmissionMaintenanceDeliveryContextFixture(), now = Date.now();
  let current = now;
  const send = vi.fn<PreparedMessageDeliverySender["send"]>().mockResolvedValue({ outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted });
  const sender = { prepare: vi.fn<MessageDeliverySender["prepare"]>().mockResolvedValue({ send }) };
  const guarded = guardMaintenanceMessageDeliverySender(sender, controller.signal, now + ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS, () => current);
  return { controller, context, send, sender, guarded, expire: () => { current = now + ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS; } };
}

describe("original maintenance sender lifetime", () => {
  it("should forward the exact original context and enter the prepared sender only once", async () => {
    const test = fixture(), prepareSignal = new AbortController(), requestSignal = new AbortController();
    const prepared = await test.guarded.prepare(test.context, prepareSignal.signal);
    expect(await prepared.send(requestSignal.signal)).toMatchObject({ outcome: "accepted" });
    expect(test.sender.prepare).toHaveBeenCalledExactlyOnceWith(test.context, expect.any(AbortSignal));
    expect(test.send).toHaveBeenCalledTimes(1);
  });

  it("should keep an aborted shared workflow from starting private preparation", async () => {
    const test = fixture();
    test.controller.abort();
    await expect(test.guarded.prepare(test.context, new AbortController().signal)).rejects.toMatchObject({ reason: "deadline_reached" });
    expect(test.sender.prepare).not.toHaveBeenCalled();
    expect(test.send).not.toHaveBeenCalled();
  });

  it("should stop before the request when the original shared deadline expires after current preparation", async () => {
    const test = fixture(), prepared = await test.guarded.prepare(test.context, new AbortController().signal);
    test.expire();
    await expect(prepared.send(new AbortController().signal)).rejects.toMatchObject({ reason: "deadline_reached" });
    expect(test.send).not.toHaveBeenCalled();
  });

  it("should propagate shared cancellation to the same already-started original request without retrying it", async () => {
    const test = fixture(), prepared = await test.guarded.prepare(test.context, new AbortController().signal);
    await prepared.send(new AbortController().signal);
    const originalSignal = test.send.mock.calls[0][0];
    expect(originalSignal.aborted).toBe(false);
    test.controller.abort();
    expect(originalSignal.aborted).toBe(true);
    expect(test.send).toHaveBeenCalledTimes(1);
  });
});
