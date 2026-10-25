/** Mounts a route `error.tsx` the way App Router does, so tests exercise the props contract the framework really passes. @module app-router-error-boundary */
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { vi } from "vitest";
import { ErrorBoundary, type ErrorComponent } from "next/dist/client/components/error-boundary";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** The props a route `error.tsx` reads from App Router, which also passes `reset`. */
export type RouteErrorBoundaryProps = { error: Error & { digest?: string }; retry: () => void };

/** Text the segment renders once it stops failing, proving the boundary re-rendered its children. */
export const RECOVERED_SEGMENT_TEXT = "Segmento recuperado";

/**
 * Renders `Boundary` inside the framework's own error boundary, around a segment that throws `failure` until `recover`
 * is called. The framework `retry` refreshes the router and re-renders the segment; a plain `reset` only re-renders it.
 *
 * @param Boundary - The route `error.tsx` default export.
 * @param failure - What the segment throws while it fails.
 * @returns The router `refresh` the framework retry calls, and a switch that lets the segment render again.
 */
export function renderThroughAppRouter(Boundary: ComponentType<RouteErrorBoundaryProps>, failure: Error) {
  const refresh = vi.fn();
  const router = { back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh, replace: vi.fn() } as unknown as AppRouterInstance;
  const segment = { failing: true };

  function FailingSegment() {
    if (segment.failing) throw failure;
    return <p>{RECOVERED_SEGMENT_TEXT}</p>;
  }

  render(
    <AppRouterContext.Provider value={router}>
      <ErrorBoundary errorComponent={Boundary as ErrorComponent}>
        <FailingSegment />
      </ErrorBoundary>
    </AppRouterContext.Provider>
  );

  return { refresh, recover: () => { segment.failing = false; } };
}
