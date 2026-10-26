/** @vitest-environment node */
/** Checks public diagnostics and privacy at the own CLI boundary without mocking the CLI or any SDK. */
import { describe, expect, it } from "vitest";
import { createOwnedMessagingCommandFailure, createOwnedMessagingOutputFailure } from "@/tests/support/owned-messaging-command-failure";
import { summarizeMessagingNodeHostFailure } from "@/tests/support/messaging-node-host-failure";

describe("owned messaging CLI failure diagnostics", () => {
  it("preserves the operation and numeric exit through the native owner", () => {
    const cause = Object.assign(new Error("private command and environment"), { code: 1, stdout: "private output", stderr: "private provider response" });
    const failure = createOwnedMessagingCommandFailure("deploy", cause);
    expect(failure.cause).toBe(cause);
    expect(summarizeMessagingNodeHostFailure(new Error("private owner", { cause: failure })).code).toBe("owned_cli_deploy_exit_1");
    expect(JSON.stringify(summarizeMessagingNodeHostFailure(failure))).not.toContain("private");
  });

  it.each([
    [{ code: "ETIMEDOUT" }, "owned_cli_deploy_timeout"],
    [{ code: null, killed: true, signal: "SIGTERM" }, "owned_cli_deploy_timeout"],
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, "owned_cli_deploy_output_limit"],
    [{ code: "ENOENT" }, "owned_cli_deploy_unavailable"],
    [{ code: 999 }, "owned_cli_deploy_unavailable"],
    [{ code: 1.5 }, "owned_cli_deploy_unavailable"],
    [{ code: -1 }, "owned_cli_deploy_unavailable"],
  ])("classifies child-process metadata safely: %j", (details, expected) => {
    expect(createOwnedMessagingCommandFailure("deploy", Object.assign(new Error("private"), details)).code).toBe(expected);
  });

  it("does not trust external operation names or arbitrary error properties", () => {
    expect(createOwnedMessagingCommandFailure("private operation", { code: 1 }).code).toBe("owned_cli_unknown_unavailable");
    expect(createOwnedMessagingOutputFailure("functions", new SyntaxError("private JSON")).code).toBe("owned_cli_functions_invalid_output");
    expect(createOwnedMessagingOutputFailure("private operation", null).code).toBe("owned_cli_unknown_invalid_output");
  });
});
