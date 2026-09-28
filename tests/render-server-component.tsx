import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { render } from "@testing-library/react";

/**
 * Renders async route components through React's server renderer before inspecting their HTML.
 * Render errors (such as the `redirect()` and `notFound()` signals) are collected instead of
 * logged by React's default handler, and the first one is rethrown so tests assert on it.
 */
export async function renderServerComponent(element: ReactNode) {
  const renderErrors: unknown[] = [];
  const stream = await renderToReadableStream(element, {
    onError: (error) => {
      renderErrors.push(error);
    },
  });
  await stream.allReady;
  if (renderErrors.length > 0) {
    throw renderErrors[0];
  }
  const markup = await new Response(stream).text();
  const view = render(<div dangerouslySetInnerHTML={{ __html: markup }} />);
  return view;
}
