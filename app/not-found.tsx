import { Suspense } from "react";

import {
  NotFoundSessionAction,
  NotFoundView,
} from "./not-found-content";

export default function NotFoundPage() {
  return (
    <NotFoundView
      sessionAction={
        <Suspense fallback={null}>
          <NotFoundSessionAction />
        </Suspense>
      }
    />
  );
}
