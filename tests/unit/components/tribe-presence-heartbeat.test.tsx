import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

import { TribePresenceHeartbeat } from "@/components/tribes/tribe-presence-heartbeat";

const useParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

describe("TribePresenceHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("touches the presence endpoint of the route slug on mount and every minute", () => {
    useParamsMock.mockReturnValue({ slug: "matematica-pro" });

    render(<TribePresenceHeartbeat />);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/presence",
      expect.objectContaining({ method: "POST" })
    );

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("stays idle when the route has no tribe slug", () => {
    useParamsMock.mockReturnValue({});

    render(<TribePresenceHeartbeat />);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stops the heartbeat when unmounted", () => {
    useParamsMock.mockReturnValue({ slug: "matematica-pro" });

    const { unmount } = render(<TribePresenceHeartbeat />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(120000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
