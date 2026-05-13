import { Suspense } from "react";

import { AuthErrorContent, AuthErrorView } from "./auth-error-content";

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<AuthErrorView />}>
      <AuthErrorContent />
    </Suspense>
  );
}
