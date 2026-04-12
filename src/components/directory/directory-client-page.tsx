"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  Filter,
  Globe,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
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

  const getTrustColor = (score: number) => {
    if (score >= 80) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-rose-100 text-rose-700 border-rose-200";
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Page header */}
      <div className="border-b border-border bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Building2 size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Business Directory</h1>
              <p className="text-sm text-muted">
                Discover and verify trusted businesses worldwide
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4">
            {[
              { icon: BadgeCheck, label: `${rows.length} verified businesses` },
              { icon: Globe, label: `${countries.length} countries` },
              { icon: ShieldCheck, label: "Manually verified" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
                  <Icon size={13} className="text-brand" />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">

        {/* Firebase error */}
        {!hasFirebaseConfig && (
          <div className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            Firebase config missing in <code className="font-mono">.env.local</code>.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Filters bar */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm mb-6">
          {/* Tab switcher */}
          <div className="flex items-center gap-2 mb-4">
            <Filter size={15} className="text-muted" />
            <span className="text-sm font-medium text-muted">Filter by type:</span>
            <div className="flex items-center gap-1.5">
              {(["online", "offline"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTab(type)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition ${
                    tab === type
                      ? "bg-brand text-white shadow-sm"
                      : "border border-border text-muted hover:border-brand/40 hover:text-brand"
                  }`}
                >
                  {type === "online" ? "🌐 Online" : "🏪 Offline"}
                </button>
              ))}
            </div>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by business name, key, city, or category..."
              className="w-full rounded-xl border border-border bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
            />
          </div>

          {/* Search results dropdown */}
          {(searchLoading || searchHits.length > 0) && (
            <div className="mt-2 rounded-xl border border-border bg-white shadow-lg">
              {searchLoading && (
                <p className="px-4 py-3 text-xs text-muted">Searching across all modules...</p>
              )}
              {!searchLoading && searchHits.map((hit) => (
                <Link
                  key={`${hit.type}_${hit.id}`}
                  href={hit.href}
                  className="flex items-start gap-3 px-4 py-3 text-sm transition hover:bg-brand/5 border-b border-border last:border-0"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand text-[10px] font-bold uppercase">
                    {hit.type[0]}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{hit.title}</p>
                    <p className="text-xs text-muted">{hit.subtitle}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Country + city filters */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <select
                value={countryFilter}
                onChange={(event) => {
                  setCountryFilter(event.target.value);
                  setCityFilter("");
                }}
                className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-brand appearance-none"
              >
                <option value="">All Countries</option>
                {countries.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <select
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
                className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-brand appearance-none"
              >
                <option value="">All Cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ad banner */}
        <div className="mb-6">
          <PublicAdBanner placement="directory_banner" city={cityFilter || countryFilter} />
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">
            {loading ? "Loading..." : `${filteredRows.length} businesses found`}
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="rounded-2xl border border-border bg-white p-5 space-y-3">
                <div className="h-5 w-2/3 rounded-lg shimmer" />
                <div className="h-4 w-1/2 rounded-lg shimmer" />
                <div className="h-4 w-3/4 rounded-lg shimmer" />
                <div className="flex gap-2 mt-2">
                  <div className="h-9 w-24 rounded-xl shimmer" />
                  <div className="h-9 w-28 rounded-xl shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {!filteredRows.length && (
              <div className="md:col-span-2 rounded-2xl border border-border bg-white p-10 text-center">
                <Building2 size={32} className="mx-auto text-muted mb-3" />
                <p className="font-medium text-foreground">No businesses found</p>
                <p className="text-sm text-muted mt-1">Try adjusting your filters or search query</p>
              </div>
            )}

            {filteredRows.map((business) => {
              const followed = followedIds.includes(business.id);
              const trustScore = business.trustScore ?? 0;
              return (
                <article
                  key={business.id}
                  className="rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:shadow-md hover:border-brand/20 card-hover"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand font-bold text-sm">
                        {business.businessName[0]?.toUpperCase() ?? "B"}
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground truncate">{business.businessName}</h2>
                        <p className="text-xs text-muted mt-0.5">#{business.publicBusinessKey}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getTrustColor(trustScore)}`}>
                      <TrendingUp size={11} />
                      {trustScore}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <MapPin size={11} className="shrink-0" />
                      {business.city}, {business.country}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Star size={11} className="shrink-0" />
                      {business.category}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Globe size={11} className="shrink-0" />
                      {business.mode} • {business.yearsInField}y exp.
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Users size={11} className="shrink-0" />
                      {business.followersCount} followers
                    </div>
                  </div>

                  {/* Certificate & deposit */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {business.certificateSerial ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <BadgeCheck size={12} />
                        Cert: {business.certificateSerial}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Pending Verification
                      </span>
                    )}
                    {(business.totalLockedDeposit ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                        <ShieldCheck size={12} />
                        Deposit ₹{business.totalLockedDeposit}
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onToggleFollow(business)}
                      disabled={busyId === business.id}
                      className={`rounded-xl px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${
                        followed
                          ? "bg-brand/10 border border-brand/30 text-brand-strong hover:bg-brand/15"
                          : "border border-border text-muted hover:border-brand/40 hover:text-brand"
                      }`}
                    >
                      <Users size={12} className="inline mr-1" />
                      {busyId === business.id ? "..." : followed ? "Following" : "Follow"}
                    </button>

                    <Link
                      href={`/business/${business.slug}`}
                      className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong"
                    >
                      <ShieldCheck size={12} className="inline mr-1" />
                      Trust Profile
                    </Link>

                    <Link
                      href={`/business/${business.slug}#questions`}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted transition hover:border-brand/40 hover:text-brand"
                    >
                      Q&A
                    </Link>

                    <Link
                      href={`/dashboard/tickets/new?business=${encodeURIComponent(business.businessName)}`}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted transition hover:border-amber-300 hover:text-amber-700"
                    >
                      <Ticket size={12} className="inline mr-1" />
                      Raise Ticket
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
