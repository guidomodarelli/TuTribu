import { Suspense } from "react";

import {
  HomePageContent,
  HomePageView,
  type HomePageSearchParams,
} from "./home-page-content";

export default function HomePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<HomePageSearchParams>;
} = {}) {
  return (
    <Suspense fallback={<HomePageView isAuthenticated={null} />}>
      <HomePageContent searchParams={searchParams} />
    </Suspense>
  );
}
