"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, Briefcase, Building2, CheckCircle2, UserCheck, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchBusinessByPublicKey,
  requestEmployeeBusinessAccess,
  updateCurrentUserRoleSelection,
} from "@/lib/firebase/repositories";

type RoleChoice = "customer" | "employee" | "business_owner";

const roleOptions: {
  id: RoleChoice;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    id: "customer",
    label: "Customer",
    description: "Browse verified businesses, buy products/services, and track orders.",
    icon: UserCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    id: "employee",
    label: "Employee",
    description: "Join a business team and access assigned employee workspace.",
    icon: Briefcase,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "business_owner",
    label: "Business Owner",
    description: "Verify your business, list products, manage orders and reviews.",
    icon: Building2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
];

const roleCapabilities: Record<RoleChoice, string[]> = {
  customer: [
    "Browse verified business profiles and trust scores",
    "Buy products/services, track orders, and request refunds",
    "Create support tickets with proof documents",
    "Follow businesses, join groups, and manage favorites",
  ],
  employee: [
    "Request employment access to a registered business",
    "Work in assigned business workspace after approval",
    "Handle support and group workflows for your assignment",
    "Use security controls and track performance reviews",
  ],
  business_owner: [
    "Verify business profile and obtain trust certificate",
    "List products/services, connect Shopify/Woo feeds, and sell",
    "Manage orders, reviews, tickets, deposits, and billing",
    "Manage employees, ads, notifications API, and storefront tools",
  ],
};

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
        setBusinessPreview(row ? `${row.businessName} (${row.city}, ${row.country})` : "Business not found");
      } catch {
        if (!active) return;
        setBusinessPreview("Business not found");
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
      <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <div className="h-5 w-40 rounded-lg shimmer mx-auto mb-3" />
        <div className="h-4 w-64 rounded-lg shimmer mx-auto" />
      </div>
    );
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <XCircle size={18} className="shrink-0 text-danger mt-0.5" />
        <p className="text-sm text-danger">Firebase config missing in <code className="font-mono">.env.local</code>.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Header card */}
      <div className="rounded-2xl bg-white border border-border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <BadgeCheck size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Choose Account Type</h1>
            <p className="text-xs text-muted">Select how you&apos;ll use BusinessVerifier</p>
          </div>
        </div>

        {roleSelectionCompleted && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2">
            <CheckCircle2 size={14} className="text-brand shrink-0" />
            <p className="text-xs text-brand-strong">Current role: <strong>{roleLabel}</strong> — you can switch below.</p>
          </div>
        )}
      </div>

      {/* Role selection */}
      <div className="rounded-2xl bg-white border border-border shadow-sm p-6">
        <p className="text-sm font-semibold text-foreground mb-4">Select your account type</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {roleOptions.map((option) => {
            const Icon = option.icon;
            const selected = choice === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setChoice(option.id)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                  selected
                    ? `${option.border} ${option.bg} ring-2 ring-offset-1 ring-brand/20`
                    : "border-border hover:border-brand/30"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${selected ? `${option.bg} ${option.color}` : "bg-slate-100 text-slate-400"}`}>
                  <Icon size={18} />
                </span>
                <p className={`font-semibold text-sm ${selected ? option.color : "text-foreground"}`}>
                  {option.label}
                </p>
                <p className="text-xs text-muted leading-relaxed">{option.description}</p>
                {selected && (
                  <CheckCircle2 size={14} className="text-brand self-end" />
                )}
              </button>
            );
          })}
        </div>

        {/* Employee fields */}
        {choice === "employee" && (
          <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700">Enter your business details to request access</p>
            <input
              value={businessKey}
              onChange={(event) => setBusinessKey(event.target.value.toUpperCase())}
              placeholder="Business public key (e.g. BVB-XXXX-XXXX)"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
            <input
              value={privateKey}
              onChange={(event) => setPrivateKey(event.target.value)}
              placeholder="Private join key (optional — for auto-approval)"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
            {businessPreview && (
              <p className={`text-xs font-medium ${businessPreview.includes("not found") ? "text-danger" : "text-brand-strong"}`}>
                {businessPreview.includes("not found") ? "⚠ " : "✓ "}
                {businessPreview}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-muted">
            What this account type can do
          </p>
          <div className="mt-2 grid gap-2">
            {roleCapabilities[choice].map((item) => (
              <p key={item} className="text-xs text-foreground">
                - {item}
              </p>
            ))}
          </div>
        </div>

        {/* Error / info messages */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
            <XCircle size={14} className="shrink-0 text-danger mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        {info && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2.5">
            <CheckCircle2 size={14} className="shrink-0 text-brand mt-0.5" />
            <p className="text-sm text-brand-strong">{info}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
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
                }, 800);
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
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {busy ? "Saving..." : "Save & Continue"}
            {!busy && <ArrowRight size={14} />}
          </button>
          <Link
            href={returnUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:border-brand/30 hover:text-brand"
          >
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}
