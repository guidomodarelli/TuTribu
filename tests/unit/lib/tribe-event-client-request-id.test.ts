import { webcrypto } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTribeEventClientRequestId } from "@/lib/events/tribe-event-client-request-id";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createTribeEventClientRequestId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a distinct UUID v4 per send attempt", () => {
    const firstId = createTribeEventClientRequestId();
    const secondId = createTribeEventClientRequestId();

    expect(firstId).toMatch(UUID_V4_PATTERN);
    expect(secondId).toMatch(UUID_V4_PATTERN);
    expect(secondId).not.toBe(firstId);
  });

  it("builds a UUID v4 from random values where randomUUID is unavailable", () => {
    // jsdom always runs in a secure context, so the insecure-context /
    // older-WebKit path (no `randomUUID`) can only be reached by exposing a
    // crypto object that keeps the real `getRandomValues` and nothing else.
    vi.stubGlobal("crypto", {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    });

    expect(createTribeEventClientRequestId()).toMatch(UUID_V4_PATTERN);
  });
});
