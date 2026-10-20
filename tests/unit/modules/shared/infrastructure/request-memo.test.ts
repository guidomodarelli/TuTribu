/** @vitest-environment node */
/** Outside a React server render the request memo must never share a read between calls. @module request-memo-tests */
import { describe, expect, it } from "vitest";
import { memoizeForRequest } from "@/src/modules/shared/infrastructure/request-scope/request-memo";

describe("memoizeForRequest outside a server render", () => {
  it("should run the read for every caller, so route handlers and separate requests never share a result", async () => {
    let reads = 0;
    const load = async () => ({ read: ++reads });
    const [first, second] = await Promise.all([memoizeForRequest("test:key", load), memoizeForRequest("test:key", load)]);
    expect([first, second]).toEqual([{ read: 1 }, { read: 2 }]);
    expect(await memoizeForRequest("test:key", load)).toEqual({ read: 3 });
  });

  it("should propagate the original rejection to its caller", async () => {
    const failure = new Error("synthetic read failure");
    await expect(memoizeForRequest("test:failure", async () => { throw failure; })).rejects.toBe(failure);
    expect(await memoizeForRequest("test:failure", async () => "recovered")).toBe("recovered");
  });
});
