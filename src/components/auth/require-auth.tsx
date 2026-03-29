"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, mfaRequired, isMfaVerified } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/sign-in?returnUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isLoading && user && mfaRequired && !isMfaVerified && pathname !== "/verify-mfa") {
      router.replace(`/verify-mfa?returnUrl=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isMfaVerified, mfaRequired, pathname, router, user]);

  if (isLoading || !user || (mfaRequired && !isMfaVerified && pathname !== "/verify-mfa")) {
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
