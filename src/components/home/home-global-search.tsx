"use client";

import Link from "next/link";
import { Search } from "lucide-react";
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
    <section className="rounded-3xl border border-border bg-white p-6">
      <h2 className="text-xl font-semibold tracking-tight">Search businesses, products, and services</h2>
      <p className="mt-1 text-sm text-muted">
        Use business name, city, category, or business key to find trusted listings quickly.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <Search size={18} className="text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search business key, business name, products or services..."
          className="w-full bg-transparent text-base outline-none"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["business", "Businesses"],
          ["product", "Products"],
          ["service", "Services"],
        ] as Array<[SearchTab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              tab === id ? "bg-brand text-white" : "border border-border hover:border-brand/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-2">
          {loading && <p className="px-2 py-1 text-xs text-muted">Searching...</p>}
          {!loading && !filteredHits.length && (
            <p className="px-2 py-1 text-xs text-muted">No matches found.</p>
          )}
          {!loading &&
            filteredHits.map((hit) => (
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
    </section>
  );
}

