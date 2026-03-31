"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchBusinessByPublicKey,
  requestEmployeeBusinessAccess,
  updateCurrentUserRoleSelection,
} from "@/lib/firebase/repositories";

type RoleChoice = "customer" | "employee" | "business_owner";

export function AccountTypeOnboardingPanel() {
  const { user, isLoading, hasFirebaseConfig, roleSelectionCompleted, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/dashboard";
  const [choice, setChoice] = useState<RoleChoice>("customer");
  const [businessKey, setBusinessKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [businessPreview, setBusinessPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/sign-in");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    let active = true;
    async function lookupBusiness() {
      const key = businessKey.trim().toUpperCase();
      if (choice !== "employee" || key.length < 6) {
        setBusinessPreview(null);
        return;
      }
      try {
        const row = await fetchBusinessByPublicKey(key);
        if (!active) return;
        setBusinessPreview(row ? `${row.businessName} (${row.city}, ${row.country})` : "Not found");
      } catch {
        if (!active) return;
        setBusinessPreview("Not found");
      }
    }
    void lookupBusiness();
    return () => {
      active = false;
    };
  }, [businessKey, choice]);

  const roleLabel = useMemo(() => {
    if (role === "business_owner") return "Business owner";
    if (role === "employee") return "Employee";
    return "Customer";
  }, [role]);

  if (isLoading || !user) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading account setup...
      </div>
    );
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing in `.env.local`.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Choose account type</h1>
        <p className="mt-2 text-sm text-muted">
          Select how you will use the platform: customer, employee, or business owner.
        </p>
        {roleSelectionCompleted && (
          <p className="mt-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-brand-strong">
            Current role: {roleLabel}. You can continue or switch role below.
          </p>
        )}
      </section>

      <section className="glass rounded-3xl p-6">
        <div className="grid gap-2 md:grid-cols-3">
          {([
            { id: "customer", label: "Customer" },
            { id: "employee", label: "Employee" },
            { id: "business_owner", label: "Business Owner" },
          ] as Array<{ id: RoleChoice; label: string }>).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChoice(item.id)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                choice === item.id
                  ? "border-brand bg-brand/10 text-brand-strong"
                  : "border-border bg-surface hover:border-brand/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {choice === "employee" && (
          <div className="mt-4 grid gap-3">
            <input
              value={businessKey}
              onChange={(event) => setBusinessKey(event.target.value.toUpperCase())}
              placeholder="Business public key (BVB-XXXX-XXXX)"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <input
              value={privateKey}
              onChange={(event) => setPrivateKey(event.target.value)}
              placeholder="Private business key (optional for auto approval)"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            {businessPreview ? (
              <p className="text-xs text-muted">Business search: {businessPreview}</p>
            ) : null}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-strong">
            {info}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setInfo(null);
              try {
                if (choice === "employee") {
                  if (!businessKey.trim()) {
                    throw new Error("Business public key is required for employee role.");
                  }
                  const result = await requestEmployeeBusinessAccess({
                    employeeUid: user.uid,
                    employeeName: user.displayName ?? "Employee",
                    employeeEmail: user.email ?? "",
                    businessPublicKey: businessKey.trim(),
                    privateJoinKey: privateKey.trim() || undefined,
                  });
                  setInfo(
                    result.status === "auto_approved"
                      ? "Employee access auto-approved. You can now open dashboard."
                      : "Employee request submitted. Wait for business owner approval.",
                  );
                } else {
                  await updateCurrentUserRoleSelection({
                    userUid: user.uid,
                    role: choice,
                  });
                  if (choice === "business_owner") {
                    setInfo("Role saved. Complete business onboarding next.");
                  } else {
                    setInfo("Role saved. You can continue as customer.");
                  }
                }
                setTimeout(() => {
                  window.location.href = returnUrl;
                }, 600);
              } catch (submitError) {
                setError(
                  submitError instanceof Error
                    ? submitError.message
                    : "Unable to save account type.",
                );
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            {busy ? "Saving..." : "Save and continue"}
          </button>
          <Link
            href={returnUrl}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40"
          >
            Skip for now
          </Link>
        </div>
      </section>
    </div>
  );
}
