import { vi, describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { SidebarMenuSkeleton } from "beez-ui";

describe("SidebarMenuSkeleton", () => {
  it("should hydrate without recoverable errors when browser randomness differs from the server", async () => {
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    const originalMathRandom = Math.random;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () {});
    let consoleErrorCalls: unknown[][] = [];

    try {
      Math.random = vi.fn(() => 0.1);
      container.innerHTML = renderToString(<SidebarMenuSkeleton showIcon />);

      Math.random = vi.fn(() => 0.9);

      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, <SidebarMenuSkeleton showIcon />, {
          onRecoverableError: (error) => {
            recoverableErrors.push(error);
          },
        });
      });

      await act(async () => {
        root.unmount();
      });
      consoleErrorCalls = consoleErrorSpy.mock.calls;
    } finally {
      Math.random = originalMathRandom;
      consoleErrorSpy.mockRestore();
    }

    expect(recoverableErrors).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);
  });
});
