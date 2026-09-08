import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { SidebarMenuSkeleton } from "beez-ui";

describe("SidebarMenuSkeleton", () => {
  it("should hydrate without recoverable errors when browser randomness differs from the server", async () => {
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    const originalMathRandom = Math.random;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let consoleErrorCalls: unknown[][] = [];

    try {
      Math.random = jest.fn(() => 0.1);
      container.innerHTML = renderToString(<SidebarMenuSkeleton showIcon />);

      Math.random = jest.fn(() => 0.9);

      const root = hydrateRoot(container, <SidebarMenuSkeleton showIcon />, {
        onRecoverableError: (error) => {
          recoverableErrors.push(error);
        },
      });

      await act(async () => {
        await Promise.resolve();
      });

      root.unmount();
      consoleErrorCalls = consoleErrorSpy.mock.calls;
    } finally {
      Math.random = originalMathRandom;
      consoleErrorSpy.mockRestore();
    }

    expect(recoverableErrors).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);
  });
});
