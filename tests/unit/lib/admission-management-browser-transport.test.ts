/** Exercises how the shared management transport classifies replies the hosting edge answered instead of the route. @module admission-management-browser-transport-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAdmissionManagementBrowserTransport } from "@/lib/academy-admissions/admission-management-browser-transport";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

const PATH = "/api/tribes/synthetic-academy/admissions/allowlist/imports";

/** @param status - Edge status. @param text - Plain body, never the own JSON contract. @returns A fetch that answers that reply. */
function edgeFetch(status: number, text: string) {
  return vi.fn<typeof globalThis.fetch>(async () => new Response(text, { status, headers: { "content-type": "text/plain" } }));
}

/** @param fetch - Fetch double. @returns The reply to one write with an original operation id. */
function write(fetch: typeof globalThis.fetch) {
  return createAdmissionManagementBrowserTransport(fetch).json(PATH, z.object({}), new AbortController().signal, { body: { operationId: randomUUID() } });
}

describe("admission management transport edge replies", () => {
  it("should treat a body over the platform limit as a definitive rejection, since the route never ran", async () => {
    await expect(write(edgeFetch(413, "Request Entity Too Large FUNCTION_PAYLOAD_TOO_LARGE"))).resolves.toEqual({ status: "failed", code: ADMISSION_ERROR_CODE.invalidInput, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.invalidInput], uncertain: false });
  });

  it("should treat another plain client error from the edge as definitive too", async () => {
    await expect(write(edgeFetch(400, "Bad Request"))).resolves.toMatchObject({ status: "failed", code: ADMISSION_ERROR_CODE.publicContractUnusable, uncertain: false });
  });

  it.each([408, 500, 504])("should keep a write uncertain after a plain %i, which may follow a committed effect", async (status) => {
    await expect(write(edgeFetch(status, "Gateway Timeout"))).resolves.toMatchObject({ status: "failed", code: ADMISSION_ERROR_CODE.publicContractUnusable, uncertain: true });
  });
});
