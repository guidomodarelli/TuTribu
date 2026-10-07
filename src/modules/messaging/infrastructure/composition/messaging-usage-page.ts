/** Validates early usage page runtime input before native composition and safe own SSR projection. @module messaging-usage-page */
import "server-only";
import { z } from "zod";
import type { GetMessagingUsagePageUseCase } from "../../application/use-cases/get-messaging-usage-page-use-case";
import { messagingUsagePageStateSchema, type MessagingUsagePageState } from "../../application/results/messaging-usage-page-state";
import { messagingTribeParamsSchema } from "../api/messaging-request-schemas";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "../../constants/messaging-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Caller account, countries or channel readiness never enter SSR input. */
const pageInputSchema = z.strictObject({ params: messagingTribeParamsSchema, query: z.strictObject({}) });
/** @param input - Untrusted resolved runtime params/query. @param open - Server-selected inward use case. @returns A current safe leader snapshot or Spanish failure without partial private data. */
export async function loadMessagingUsagePageState(input: unknown, open: () => Promise<Pick<GetMessagingUsagePageUseCase, "execute">>): Promise<MessagingUsagePageState> {
  const failure = (code: typeof MESSAGING_ERROR_CODE[keyof typeof MESSAGING_ERROR_CODE]): MessagingUsagePageState => ({ kind: "unavailable", code, message: MESSAGING_ERROR_MESSAGE[code] });
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return failure(MESSAGING_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const page = await open(), result = await page.execute({ slug: parsed.data.params.slug, requestId: context.requestId });
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
