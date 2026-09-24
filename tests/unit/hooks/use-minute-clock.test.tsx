import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { advanceMinuteClockTo, useMinuteClock } from "@/hooks/use-minute-clock";

const MID_MINUTE_START = "2026-05-06T18:59:30.000Z";
const NEXT_MINUTE_BOUNDARY = "2026-05-06T19:00:00.000Z";

type MinuteClockProbeProps = {
  wakeUpTimes?: readonly number[];
};

function MinuteClockProbe({ wakeUpTimes }: MinuteClockProbeProps) {
  const nowTime = useMinuteClock(wakeUpTimes);

  return <output>{nowTime === null ? "server" : new Date(nowTime).toISOString()}</output>;
}

function readClock(): string | null {
  return screen.getByRole("status").textContent;
}

describe("useMinuteClock", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date(MID_MINUTE_START));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders no time on the server so hydration markup is stable", () => {
    expect(renderToString(<MinuteClockProbe />)).toContain("server");
  });

  it("ticks on the minute boundary even when it mounts mid-minute", () => {
    render(<MinuteClockProbe />);

    expect(readClock()).toBe("2026-05-06T18:59:00.000Z");

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(readClock()).toBe("2026-05-06T18:59:00.000Z");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readClock()).toBe(NEXT_MINUTE_BOUNDARY);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(readClock()).toBe("2026-05-06T19:01:00.000Z");
  });

  it("wakes up at the exact instant of a wake-up time inside the current minute", () => {
    const wakeUpTime = Date.parse("2026-05-06T18:59:45.000Z");

    render(<MinuteClockProbe wakeUpTimes={[wakeUpTime]} />);

    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(readClock()).toBe("2026-05-06T18:59:00.000Z");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readClock()).toBe("2026-05-06T18:59:45.000Z");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(readClock()).toBe(NEXT_MINUTE_BOUNDARY);
  });

  it("settles right away on a wake-up time that already passed inside the minute", () => {
    const wakeUpTime = Date.parse("2026-05-06T18:59:10.000Z");

    render(<MinuteClockProbe wakeUpTimes={[wakeUpTime]} />);

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(readClock()).toBe("2026-05-06T18:59:10.000Z");
  });

  it("moves forward to a confirmed instant and never goes back", () => {
    render(<MinuteClockProbe />);

    act(() => {
      advanceMinuteClockTo(Date.parse("2026-05-06T19:05:00.000Z"));
    });
    expect(readClock()).toBe("2026-05-06T19:05:00.000Z");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(readClock()).toBe("2026-05-06T19:05:00.000Z");
  });

  it("clears every pending timer when it unmounts", () => {
    const wakeUpTime = Date.parse("2026-05-06T18:59:45.000Z");
    const { unmount } = render(<MinuteClockProbe wakeUpTimes={[wakeUpTime]} />);

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("forgets an advanced instant once nobody observes the clock", () => {
    const { unmount } = render(<MinuteClockProbe />);

    act(() => {
      advanceMinuteClockTo(Date.parse("2026-05-07T12:00:00.000Z"));
    });
    unmount();
    render(<MinuteClockProbe />);

    expect(readClock()).toBe("2026-05-06T18:59:00.000Z");
  });
});
