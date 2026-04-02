"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PublicAdBanner } from "@/components/ads/public-ad-banner";
import { SiteHeader } from "@/components/layout/site-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessApplicationRecord,
  fetchGeoCatalogCitiesByCountry,
  fetchGeoCatalogCountries,
  fetchFollowedBusinessIds,
  fetchPublicBusinessDirectory,
  toggleBusinessFollow,
} from "@/lib/firebase/repositories";

type SearchHit = {
  id: string;
  type: "business" | "product" | "service" | "group" | "partnership";
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

export function DirectoryClientPage({
  initialRows,
  initialCountries,
}: {
  initialRows: BusinessApplicationRecord[];
  initialCountries: string[];
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const [tab, setTab] = useState<"online" | "offline">("online");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [rows, setRows] = useState<BusinessApplicationRecord[]>(initialRows);
  const [countries, setCountries] = useState<string[]>(initialCountries);
  const [countryCities, setCountryCities] = useState<string[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const cityOptions = useMemo(() => {
    if (countryFilter) return countryCities;
    return [...new Set(rows.map((item) => item.city).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [countryCities, countryFilter, rows]);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    let active = true;
    async function loadBootstrap() {
      if (rows.length > 0 && countries.length > 0) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [list, geoCountries] = await Promise.all([
          rows.length ? Promise.resolve(rows) : fetchPublicBusinessDirectory(),
          countries.length ? Promise.resolve(countries) : fetchGeoCatalogCountries(),
        ]);
        if (!active) return;
        setRows(list);
        setCountries(geoCountries);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load directory.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadBootstrap();
    return () => {
      active = false;
    };
  }, [countries, hasFirebaseConfig, rows]);

  useEffect(() => {
    let active = true;
    async function loadFollowed() {
      if (!user || !hasFirebaseConfig) {
        setFollowedIds([]);
        return;
      }
      try {
        const ids = await fetchFollowedBusinessIds(user.uid);
        if (active) setFollowedIds(ids);
      } catch {
        if (active) setFollowedIds([]);
      }
    }
    void loadFollowed();
    return () => {
      active = false;
    };
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    let active = true;
    async function loadCountryCities() {
      if (!countryFilter) {
        setCountryCities([]);
        return;
      }
      try {
        const cities = await fetchGeoCatalogCitiesByCountry(countryFilter);
        if (active) setCountryCities(cities);
      } catch {
        if (active) setCountryCities([]);
      }
    }
    void loadCountryCities();
    return () => {
      active = false;
    };
  }, [countryFilter]);

  useEffect(() => {
    let active = true;
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return () => {
        active = false;
      };
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search/global?q=${encodeURIComponent(q)}&limit=15`);
          const payload = (await response.json()) as Record<string, unknown>;
          if (!response.ok || !payload.ok) {
            throw new Error(String(payload.error ?? "Search failed."));
          }
          if (!active) return;
          setSearchHits((payload.hits as SearchHit[]) ?? []);
        } catch {
          if (active) setSearchHits([]);
        } finally {
          if (active) setSearchLoading(false);
        }
      })();
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const filteredRows = useMemo(() => {
    const textQuery = query.trim().toLowerCase();
    return rows.filter((item) => {
      const matchTab =
        tab === "online"
          ? item.mode === "online" || item.mode === "hybrid"
          : item.mode === "offline" || item.mode === "hybrid";
      const matchText =
        !textQuery ||
        `${item.businessName} ${item.publicBusinessKey} ${item.city} ${item.category}`
          .toLowerCase()
          .includes(textQuery);
      const matchCountry = !countryFilter || item.country === countryFilter;
      const matchCity = !cityFilter || item.city === cityFilter;
      return matchTab && matchText && matchCountry && matchCity;
    });
  }, [cityFilter, countryFilter, query, rows, tab]);

  async function onToggleFollow(row: BusinessApplicationRecord) {
    if (!user) {
      setError("Sign in with Gmail to follow businesses.");
      return;
    }

    setBusyId(row.id);
    setError(null);
    try {
      const next = await toggleBusinessFollow({
        applicationId: row.id,
        followerUid: user.uid,
        followerName: user.displayName ?? "User",
        followerEmail: user.email ?? "",
      });
      setFollowedIds((prev) =>
        next ? [...new Set([...prev, row.id])] : prev.filter((id) => id !== row.id),
      );
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                followersCount: next
                  ? item.followersCount + 1
                  : Math.max(0, item.followersCount - 1),
              }
            : item,
        ),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update follow status right now.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <section className="glass rounded-3xl p-6 md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Business Directory</h1>
          <p className="mt-2 text-sm text-muted">
            Search verified online and offline businesses, review trust signals, follow
            businesses, and initiate support tickets when needed.
          </p>

          {!hasFirebaseConfig && (
            <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              Firebase config missing in `.env.local`.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {(["online", "offline"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTab(type)}
                className={`rounded-xl px-4 py-2 text-sm capitalize transition ${
                  tab === type
                    ? "bg-brand text-white"
                    : "border border-border bg-surface text-foreground hover:border-brand/40"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by business key, name, city, or category..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {(searchLoading || searchHits.length > 0) && (
            <div className="mt-2 rounded-xl border border-border bg-surface p-2">
              {searchLoading && (
                <p className="px-2 py-1 text-xs text-muted">Searching across modules...</p>
              )}
              {!searchLoading && !searchHits.length && (
                <p className="px-2 py-1 text-xs text-muted">No cross-module matches found.</p>
              )}
              {!searchLoading &&
                searchHits.map((hit) => (
                  <Link
                    key={`${hit.type}_${hit.id}`}
                    href={hit.href}
                    className="block rounded-lg px-2 py-2 text-sm transition hover:bg-brand/10"
                  >
                    <p className="font-medium capitalize">
                      {hit.title} <span className="text-xs text-muted">({hit.type})</span>
                    </p>
                    <p className="text-xs text-muted">{hit.subtitle}</p>
                  </Link>
                ))}
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select
              value={countryFilter}
              onChange={(event) => {
                setCountryFilter(event.target.value);
                setCityFilter("");
              }}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            >
              <option value="">All countries</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
            <select
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            >
              <option value="">All cities</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <PublicAdBanner placement="directory_banner" city={cityFilter || countryFilter} />
          </div>

          {loading && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
              Loading business directory...
            </div>
          )}

          {!loading && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {!filteredRows.length && (
                <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted md:col-span-2">
                  No businesses found for your filters yet.
                </article>
              )}

              {filteredRows.map((business) => {
                const followed = followedIds.includes(business.id);
                return (
                  <article key={business.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">{business.businessName}</h2>
                      <span className="rounded-full bg-brand/15 px-2 py-1 text-xs text-brand-strong">
                        Trust {business.trustScore}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-muted">
                      {business.city}, {business.country} | {business.category}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {business.mode} | {business.yearsInField} years | Followers{" "}
                      {business.followersCount}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Business key {business.publicBusinessKey}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Locked deposit INR {business.totalLockedDeposit ?? 0} | Available INR{" "}
                      {business.totalAvailableDeposit ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {business.certificateSerial
                        ? `Certificate ${business.certificateSerial}`
                        : "Certificate available after admin approval"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void onToggleFollow(business)}
                        disabled={busyId === business.id}
                        className={`rounded-xl px-3 py-2 text-sm transition disabled:opacity-70 ${
                          followed
                            ? "border border-brand/50 bg-brand/10 text-brand-strong hover:bg-brand/15"
                            : "border border-border hover:border-brand/40"
                        }`}
                      >
                        {busyId === business.id
                          ? "Updating..."
                          : followed
                            ? "Following"
                            : "Follow business"}
                      </button>

                      <Link
                        href={`/business/${business.slug}`}
                        className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                      >
                        View trust profile
                      </Link>

                      <Link
                        href={`/business/${business.slug}#questions`}
                        className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                      >
                        Questions
                      </Link>

                      <Link
                        href={`/dashboard/tickets/new?business=${encodeURIComponent(
                          business.businessName,
                        )}`}
                        className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                      >
                        Raise ticket
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
