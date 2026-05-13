import { Suspense } from "react";

import {
  SignInContent,
  SignInPendingView,
  type SignInSearchParams,
} from "./sign-in-content";

export default function SignInPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<SignInSearchParams>;
}) {
  return (
    <Suspense fallback={<SignInPendingView />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}
