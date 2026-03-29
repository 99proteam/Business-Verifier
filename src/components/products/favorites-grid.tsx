"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { DigitalProductRecord, fetchFavoritedProductsByUser } from "@/lib/firebase/repositories";

export function FavoritesGrid() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<DigitalProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user || !hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const products = await fetchFavoritedProductsByUser(user.uid);
        if (active) setRows(products);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load favorites.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [hasFirebaseConfig, user]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Favorite Products</h1>
        <p className="mt-2 text-sm text-muted">
          Products you marked as favorite. Businesses may send you offer notifications for these.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading favorites...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && !rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          You have not favorited any products yet.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-5">
            <h2 className="font-semibold">{row.title}</h2>
            <p className="mt-1 text-xs text-muted">by {row.ownerName}</p>
            <p className="mt-3 text-sm text-muted line-clamp-3">{row.description}</p>
            <p className="mt-3 text-sm font-semibold">INR {row.price}</p>
            <p className="mt-1 text-xs text-muted">
              Favorites {row.favoritesCount} | Sales {row.salesCount} | Refunds {row.refundCount}
            </p>
            <Link
              href={`/products/${row.uniqueLinkSlug}`}
              className="mt-4 inline-flex rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
            >
              Open product page
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
