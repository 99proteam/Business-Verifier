"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, mfaRequired, isMfaVerified, roleSelectionCompleted } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/sign-in?returnUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isLoading && user && mfaRequired && !isMfaVerified && pathname !== "/verify-mfa") {
      router.replace(`/verify-mfa?returnUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isLoading && user && !roleSelectionCompleted && pathname !== "/onboarding/account-type") {
      router.replace(`/onboarding/account-type?returnUrl=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isMfaVerified, mfaRequired, pathname, roleSelectionCompleted, router, user]);

  if (
    isLoading ||
    !user ||
    (mfaRequired && !isMfaVerified && pathname !== "/verify-mfa") ||
    (!roleSelectionCompleted && pathname !== "/onboarding/account-type")
  ) {
    return (
      <div className="flex min-h-[42vh] items-center justify-center">
        <div className="glass rounded-2xl px-6 py-4 text-sm text-muted">
          Checking secure session...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
