"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createPartnershipDeal,
  fetchCurrentUserIdentityProfile,
  fetchPartnershipOpportunities,
  PartnershipOpportunityRecord,
  UserIdentityProfileRecord,
} from "@/lib/firebase/repositories";

export function PartnershipMarketplace({
  initialRows,
}: {
  initialRows: PartnershipOpportunityRecord[];
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PartnershipOpportunityRecord[]>(initialRows);
  const [identity, setIdentity] = useState<UserIdentityProfileRecord | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const opportunities = rows.length ? rows : await fetchPartnershipOpportunities();
        setRows(opportunities);
        if (user) {
          setIdentity(await fetchCurrentUserIdentityProfile(user.uid));
        } else {
          setIdentity(null);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load partnership marketplace.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hasFirebaseConfig, rows, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.businessName} ${row.category} ${row.city} ${row.partnershipCategory ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, rows]);

  async function startDeal(row: PartnershipOpportunityRecord) {
    if (!user) {
      setError("Sign in with Gmail to start partnership discussions.");
      return;
    }
    setBusyId(row.businessApplicationId);
    setError(null);
    setInfo(null);
    try {
      const dealId = await createPartnershipDeal({
        listingBusinessId: row.businessApplicationId,
        initiatorUid: user.uid,
        initiatorName: user.displayName ?? "User",
        initiatorEmail: user.email ?? "",
      });
      setInfo("Partnership deal chat opened.");
      router.push(`/dashboard/partnerships/${dealId}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to open partnership deal now.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Partnership Marketplace</h1>
        <p className="mt-2 text-sm text-muted">
          Explore businesses looking for collaboration and start a verified partnership chat.
          Platform fee is fixed at 2% when a deal is completed.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by business, category, city..."
          className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
        {user && identity && !identity.isIdentityVerified && (
          <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-100 p-3 text-xs text-amber-800">
            Your identity is not verified yet. Partnership chat is blocked until both
            participants are identity verified by admin.
          </p>
        )}
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading partnership opportunities...
        </div>
      )}

      {!loading && (
        <section className="grid gap-4 md:grid-cols-2">
          {!filtered.length && (
            <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted md:col-span-2">
              No partnership opportunities found yet.
            </article>
          )}

          {filtered.map((row) => (
            <article key={row.businessApplicationId} className="glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold tracking-tight">{row.businessName}</h2>
              <p className="mt-1 text-sm text-muted">
                {row.city}, {row.country} | {row.category}
              </p>
              <p className="mt-1 text-xs text-muted">
                Stage {row.stage} | Trust {row.trustScore} | {row.yearsInField} years in field
              </p>
              <p className="mt-2 text-xs text-muted">
                Partnership category: {row.partnershipCategory ?? "General collaboration"}
              </p>
              <p className="mt-1 text-xs text-muted">
                Amount range: INR {row.partnershipAmountMin ?? 0} - INR{" "}
                {row.partnershipAmountMax ?? 0}
              </p>
              <button
                type="button"
                disabled={busyId === row.businessApplicationId}
                onClick={() => void startDeal(row)}
                className="mt-4 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
              >
                {busyId === row.businessApplicationId
                  ? "Opening..."
                  : "Start partnership chat"}
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
