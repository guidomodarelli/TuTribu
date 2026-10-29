/** Validates early usage page runtime input before native composition and safe own SSR projection. @module messaging-usage-page */
import "server-only";
import type { GetMessagingUsagePageUseCase } from "../../application/use-cases/get-messaging-usage-page-use-case";
import { messagingUsagePageStateSchema, type MessagingUsagePageState } from "../../application/results/messaging-usage-page-state";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { messagingPageUnavailable as failure, readMessagingPageSlug } from "./messaging-page-input";

/** @param input - Untrusted resolved runtime params/query. @param open - Server-selected inward use case. @returns A current safe leader snapshot or Spanish failure without partial private data. */
export async function loadMessagingUsagePageState(input: unknown, open: () => Promise<Pick<GetMessagingUsagePageUseCase, "execute">>): Promise<MessagingUsagePageState> {
  const slug = readMessagingPageSlug(input);
  if (slug === null) return failure(MESSAGING_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const page = await open(), result = await page.execute({ slug, requestId: context.requestId });
    if (!result.ok) {
      if (result.failure.code === MESSAGING_ERROR_CODE.unexpectedFailure || result.failure.code === MESSAGING_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: "messaging", operation: "load_messaging_usage_page", ...context }).error({ message: "Early usage page read failed", metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const projected = messagingUsagePageStateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    throw new Error("Early usage page returned an unusable own state");
  } catch {
    createServerLogger({ feature: "messaging", operation: "load_messaging_usage_page", ...context }).error({ message: "Early messaging usage page could not load safe state", metadata: { code: MESSAGING_ERROR_CODE.unexpectedFailure } });
    return failure(MESSAGING_ERROR_CODE.unexpectedFailure);
  }
}
