"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BusinessApplicationRecord,
  fetchPublicBusinessDirectory,
} from "@/lib/firebase/repositories";

export function BusinessTabs() {
  const [active, setActive] = useState<"online" | "offline">("online");
  const [rows, setRows] = useState<BusinessApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchPublicBusinessDirectory();
        if (isMounted) setRows(list);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load businesses.",
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const businesses = useMemo(
    () =>
      rows.filter((item) =>
        active === "online"
          ? item.mode === "online" || item.mode === "hybrid"
          : item.mode === "offline" || item.mode === "hybrid",
      ),
    [active, rows],
  );

  return (
    <section className="glass rounded-3xl p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Verified businesses by type
          </h2>
          <p className="mt-1 text-sm text-muted">
            Public listing preview with separate online and offline tabs.
          </p>
        </div>

        <div className="rounded-2xl bg-brand/10 p-1">
          {(["online", "offline"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              className={`rounded-xl px-4 py-2 text-sm capitalize transition ${
                active === tab
                  ? "bg-brand text-white"
                  : "text-brand-strong hover:bg-brand/20"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading verified businesses...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          {!businesses.length && (
            <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted md:col-span-2">
              No verified businesses found for this tab yet.
            </article>
          )}

          {businesses.map((business) => (
            <article key={business.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">{business.businessName}</h3>
                <span className="rounded-full bg-brand/15 px-2 py-1 text-xs text-brand-strong">
                  Trust {business.trustScore}
                </span>
              </div>
              <p className="text-sm text-muted">
                {business.city}, {business.country} | {business.category}
              </p>
              <p className="mt-3 text-sm text-muted">
                {business.yearsInField} years in field | {business.followersCount} followers
              </p>
              <p className="mt-1 text-xs text-muted">
                Deposit locked INR {business.totalLockedDeposit ?? 0} | Cert{" "}
                {business.certificateSerial ?? "Pending"}
              </p>
              <Link
                href={`/business/${business.slug}`}
                className="mt-3 inline-flex rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
              >
                Open trust profile
              </Link>
            </article>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link
          href="/directory"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
        >
          Explore full directory
        </Link>
      </div>
    </section>
  );
}
