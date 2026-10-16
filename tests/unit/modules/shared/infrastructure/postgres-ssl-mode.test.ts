/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import { normalizePostgresSslMode } from "@/src/modules/shared/infrastructure/database/postgres-ssl-mode";

describe("normalizePostgresSslMode", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites sslmode=%s to verify-full and keeps the other parameters",
    (sslMode) => {
      const normalized = normalizePostgresSslMode(
        `postgresql://user:secret@ep-demo.neon.tech/neondb?channel_binding=require&sslmode=${sslMode}`
      );

      const normalizedUrl = new URL(normalized);
      expect(normalizedUrl.searchParams.get("sslmode")).toBe("verify-full");
      expect(normalizedUrl.searchParams.get("channel_binding")).toBe("require");
      expect(normalizedUrl.username).toBe("user");
      expect(normalizedUrl.password).toBe("secret");
      expect(normalizedUrl.hostname).toBe("ep-demo.neon.tech");
      expect(normalizedUrl.pathname).toBe("/neondb");
    }
  );

  it.each(["uselibpqcompat=false", "uselibpqcompat=", "uselibpqcompat=true&uselibpqcompat=false"])(
    "rewrites the alias when libpq compatibility is not enabled (%s)",
    (libpqCompatQuery) => {
      const normalized = normalizePostgresSslMode(
        `postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=require&${libpqCompatQuery}`
      );

      expect(new URL(normalized).searchParams.getAll("sslmode")).toEqual(["verify-full"]);
    }
  );

  it("rewrites duplicated sslmode values to a single verify-full when the last one is an alias", () => {
    const normalized = normalizePostgresSslMode(
      "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=disable&sslmode=require"
    );

    expect(new URL(normalized).searchParams.getAll("sslmode")).toEqual(["verify-full"]);
  });

  it.each([
    "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=require&sslmode=disable",
    "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=require&uselibpqcompat=false&uselibpqcompat=true",
    "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=verify-full",
    "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=disable",
    "postgresql://user:secret@ep-demo.neon.tech/neondb?sslmode=require&uselibpqcompat=true",
    "postgres://user:secret@database.example.com/db",
    "not a url",
  ])("returns %s unchanged", (connectionString) => {
    expect(normalizePostgresSslMode(connectionString)).toBe(connectionString);
  });
});
