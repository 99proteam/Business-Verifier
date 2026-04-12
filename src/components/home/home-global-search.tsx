"use client";

import Link from "next/link";
import { ArrowRight, Building2, Package, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SearchHit = {
  id: string;
  type: "business" | "product" | "service" | "group" | "partnership";
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

type SearchTab = "all" | "business" | "product" | "service";

const typeIcons: Record<string, React.ElementType> = {
  business: Building2,
  product: Package,
  service: Wrench,
  group: Building2,
  partnership: Building2,
};

const typeColors: Record<string, string> = {
  business: "bg-emerald-100 text-emerald-600",
  product: "bg-blue-100 text-blue-600",
  service: "bg-purple-100 text-purple-600",
  group: "bg-amber-100 text-amber-600",
  partnership: "bg-rose-100 text-rose-600",
};

export function HomeGlobalSearch() {
  const [tab, setTab] = useState<SearchTab>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    let active = true;
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search/global?q=${encodeURIComponent(text)}&limit=24`);
          const payload = (await response.json()) as Record<string, unknown>;
          if (!response.ok || !payload.ok) {
            throw new Error(String(payload.error ?? "Search failed."));
          }
          if (!active) return;
          setHits((payload.hits as SearchHit[]) ?? []);
        } catch {
          if (active) setHits([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const filteredHits = useMemo(() => {
    if (tab === "all") return hits;
    return hits.filter((row) => row.type === tab);
  }, [hits, tab]);

  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      {/* Search input */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by business name, city, category, product or service..."
          className="w-full rounded-xl border border-border bg-slate-50 py-4 pl-12 pr-4 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10 placeholder:text-muted/60"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        )}
      </div>

      {/* Tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted font-medium">Filter:</span>
        {([
          ["all", "All Results"],
          ["business", "Businesses"],
          ["product", "Products"],
          ["service", "Services"],
        ] as Array<[SearchTab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === id
                ? "bg-brand text-white shadow-sm"
                : "border border-border text-muted hover:border-brand/40 hover:text-brand"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results */}
      {query.trim().length >= 2 && (
        <div className="mt-4">
          {!loading && !filteredHits.length && (
            <div className="rounded-xl border border-border bg-slate-50 p-6 text-center">
              <Search size={24} className="mx-auto text-muted mb-2" />
              <p className="text-sm text-muted">No results found for &quot;{query}&quot;</p>
              <p className="text-xs text-muted mt-1">Try a different search term or browse the directory</p>
            </div>
          )}

          {!loading && filteredHits.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              {filteredHits.map((hit, index) => {
                const Icon = typeIcons[hit.type] ?? Building2;
                const colorClass = typeColors[hit.type] ?? "bg-slate-100 text-slate-600";
                return (
                  <Link
                    key={`${hit.type}_${hit.id}`}
                    href={hit.href}
                    className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-brand/5 ${
                      index < filteredHits.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
                      <Icon size={14} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{hit.title}</p>
                      <p className="text-xs text-muted truncate">{hit.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${colorClass}`}>
                        {hit.type}
                      </span>
                      <ArrowRight size={13} className="text-muted" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {!loading && filteredHits.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted">
              Showing {filteredHits.length} result{filteredHits.length !== 1 ? "s" : ""}
              {tab !== "all" ? ` in ${tab}s` : ""} —{" "}
              <Link href="/directory" className="text-brand hover:underline underline-offset-2">
                Browse full directory
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Empty state - quick links */}
      {query.trim().length < 2 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-muted">Quick links:</span>
          {[
            { label: "View Directory", href: "/directory" },
            { label: "Products", href: "/products" },
            { label: "Groups", href: "/groups" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:border-brand/40 hover:text-brand"
            >
              {link.label}
              <ArrowRight size={10} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
