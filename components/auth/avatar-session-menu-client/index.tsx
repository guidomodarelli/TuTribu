"use client";

import { useRouter } from "next/navigation";

import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import styles from "./styles.module.scss";

type AvatarSessionMenuClientProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  signInPath: string;
  signOutCallbackUrl: string;
};

export function AvatarSessionMenuClient({
  authenticatedMember,
  signInPath,
  signOutCallbackUrl,
}: AvatarSessionMenuClientProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const response = await fetch("/auth/signout", {
      method: "POST",
    });

    if (!response.ok) {
      router.push("/auth/error");
      return;
    }

    router.push(signOutCallbackUrl);
  };

  return (
    <div className={styles.AvatarSessionMenuClient}>
      <AvatarSessionMenu
        authenticatedMember={authenticatedMember}
        signInPath={signInPath}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
