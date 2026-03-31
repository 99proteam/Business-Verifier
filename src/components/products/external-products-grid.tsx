"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ExternalProduct = {
  id: string;
  title: string;
  price: number;
  source: string;
  url?: string;
  imageUrl?: string;
  rating?: number;
};

export function ExternalProductsGrid({ initialRows }: { initialRows: ExternalProduct[] }) {
  const [rows, setRows] = useState<ExternalProduct[]>(initialRows);
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rows.length > 0) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/products/external?limit=12");
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok || !payload.ok) {
          throw new Error(String(payload.error ?? "Unable to load external products."));
        }
        if (mounted) {
          setRows((payload.items as ExternalProduct[]) ?? []);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load external products.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [rows.length]);

  return (
    <section className="glass rounded-3xl p-6">
      <h2 className="text-xl font-semibold tracking-tight">External Product Feeds</h2>
      <p className="mt-1 text-xs text-muted">
        Aggregated from configured external APIs to support cross-platform buying discovery.
      </p>
      {loading && <p className="mt-3 text-sm text-muted">Loading external products...</p>}
      {error && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {!loading && !error && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {!rows.length && <p className="text-sm text-muted">No external feed items returned.</p>}
          {rows.map((row) => (
            <article key={`${row.source}_${row.id}`} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="mt-1 text-xs text-muted">{row.source}</p>
              <p className="mt-1 text-sm">INR {row.price}</p>
              {row.rating && <p className="text-xs text-muted">Rating {row.rating}/5</p>}
              {row.imageUrl && (
                <div className="relative mt-2 h-24 w-full overflow-hidden rounded-lg">
                  <Image
                    src={row.imageUrl}
                    alt={row.title}
                    fill
                    sizes="(max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              {row.url && (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
                >
                  Open source product
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
