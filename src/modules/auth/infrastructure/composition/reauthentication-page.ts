/** Resolves validated query input to safe SSR props without redirecting an existing session. */
import "server-only";
import { z } from "zod";
import type { ReauthenticationIntentUseCaseResult, ReauthenticationFailure } from "@/src/modules/auth/application/results/reauthentication-intent-result";
import { reauthenticationPageStateSchema, type ReauthenticationPageState } from "@/src/modules/auth/application/results/reauthentication-page-result";
import { REAUTHENTICATION_ERROR_CODE, REAUTHENTICATION_ERROR_MESSAGE } from "@/src/modules/auth/constants/reauthentication-intents";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Strips provider-only query metadata; only the presence of an error is projected. */
const pageQuerySchema = z.object({ intentId: z.uuid(), error: z.string().optional() });
type PageModule = { useCases: { readIntent: { execute(command: { intentId: string }): Promise<ReauthenticationIntentUseCaseResult> } } };
type PageDiagnostic = { code: "public_contract_unusable" | "unexpected_failure"; stage: "load" };

/** Records closed diagnostics without serializing the exception, query or provider URL. */
function reportPageFailure(diagnostic: PageDiagnostic): void {
  createServerLogger({ feature: "auth", operation: "load_reauthentication_page", ...resolveRequestContext(new Headers()) }).error({ message: "Global reauthentication page could not load safe state", metadata: diagnostic });
}

/** Defers native auth configuration until input is usable and the page's error boundary owns it. */
async function createPageModule(): Promise<PageModule> {
  const { createRequestReauthenticationModule } = await import("@/src/modules/auth/reauthentication-setup");
  return createRequestReauthenticationModule();
}

/**
 * Reads the use case directly for the initial render instead of calling the app's own HTTP API.
 * @param query - Untrusted resolved Next.js search params.
 * @param createModule - Current request's application composition.
 * @param diagnose - Closed server diagnostic sink; never receives raw errors.
 * @returns A validated safe snapshot with a fixed Spanish failure when unavailable.
 */
export async function loadReauthenticationPageState(query: unknown, createModule: () => Promise<PageModule> = createPageModule, diagnose: (diagnostic: PageDiagnostic) => void = reportPageFailure): Promise<ReauthenticationPageState> {
  const parsed = pageQuerySchema.safeParse(query);
  const failure = (code: ReauthenticationFailure["code"]): ReauthenticationPageState => ({ kind: "unavailable", code, message: REAUTHENTICATION_ERROR_MESSAGE[code] });
  if (!parsed.success) return failure(REAUTHENTICATION_ERROR_CODE.invalidInput);
  try {
    const authModule = await createModule();
    const result = await authModule.useCases.readIntent.execute({ intentId: parsed.data.intentId });
    if (!result.ok) return failure(result.failure.code);
    const snapshot = reauthenticationPageStateSchema.safeParse({ kind: "ready", intent: result.value, oauthFailed: parsed.data.error !== undefined });
    if (snapshot.success) return snapshot.data;
    diagnose({ code: REAUTHENTICATION_ERROR_CODE.unusableContract, stage: "load" });
    return failure(REAUTHENTICATION_ERROR_CODE.unusableContract);
  } catch {
    diagnose({ code: REAUTHENTICATION_ERROR_CODE.unexpected, stage: "load" });
    return failure(REAUTHENTICATION_ERROR_CODE.unexpected);
  }
}
