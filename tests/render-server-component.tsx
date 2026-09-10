import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { render } from "@testing-library/react";

/** Renders async route components through React's server renderer before inspecting their HTML. */
export async function renderServerComponent(element: ReactNode) {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  const markup = await new Response(stream).text();
  const view = render(<div dangerouslySetInnerHTML={{ __html: markup }} />);
  return view;
}
