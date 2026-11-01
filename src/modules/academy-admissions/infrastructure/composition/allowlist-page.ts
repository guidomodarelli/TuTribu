/** Validates list page runtime input before native composition and safe current SSR projection. @module allowlist-page */
import "server-only";
import { z } from "zod";
import type { GetAllowlistPageUseCase } from "../../application/use-cases/get-allowlist-page-use-case";
import { allowlistPageStateSchema, type AllowlistPageState } from "../../application/results/allowlist-page-state";
import { admissionTribeParamsSchema, admissionAllowlistQuerySchema } from "../api/admission-request-schemas";
import { loadAdmissionLeaderPageState } from "./admission-page-loading";

const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionAllowlistQuerySchema });
/** @param input - Untrusted resolved framework values. @param open - Server-selected inward loader. @param requestHeaders - Incoming request headers, for native correlation. @returns Current leader state or safe Spanish failure without raw diagnostics. */
export async function loadAllowlistPageState(input: unknown, open: () => Promise<Pick<GetAllowlistPageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<AllowlistPageState> {
  return loadAdmissionLeaderPageState({
    input, inputSchema: pageInputSchema, open, stateSchema: allowlistPageStateSchema, requestHeaders,
    read: (page, { params, query }, requestId) => page.execute({ slug: params.slug, filters: query, requestId }),
    diagnostic: { operation: "load_allowlist_page", readFailed: "Allowlist page read failed", contractRejected: "Allowlist page returned an unusable own state", loadFailed: "Allowlist page could not load safe current state" },
  });
}
