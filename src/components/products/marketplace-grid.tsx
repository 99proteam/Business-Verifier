"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchPublicDigitalProducts,
  isProductFavorited,
  DigitalProductRecord,
  toggleDigitalProductFavorite,
} from "@/lib/firebase/repositories";
import { cn } from "@/lib/utils";

type FavoriteState = Record<string, boolean>;

export function MarketplaceGrid() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<DigitalProductRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const products = await fetchPublicDigitalProducts();
      setRows(products);

      if (user) {
        const favoritePairs = await Promise.all(
          products.map(async (item) => [item.id, await isProductFavorited(item.id, user.uid)]),
        );
        setFavorites(Object.fromEntries(favoritePairs));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load digital marketplace.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, [hasFirebaseConfig, user]);

  async function toggleFavorite(productId: string) {
    if (!user) {
      setError("Sign in to favorite products.");
      return;
    }
    try {
      const next = await toggleDigitalProductFavorite(productId, user.uid);
      setFavorites((prev) => ({ ...prev, [productId]: next }));
      setRows((prev) =>
        prev.map((item) =>
          item.id === productId
            ? {
                ...item,
                favoritesCount: next ? item.favoritesCount + 1 : item.favoritesCount - 1,
              }
            : item,
        ),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update favorite right now.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Digital Marketplace</h1>
        <p className="mt-2 text-sm text-muted">
          Discover verified business products, mark favorites, and use unique product links.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading products...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{row.title}</h2>
                <p className="mt-1 text-xs text-muted">by {row.ownerName}</p>
              </div>
              <button
                type="button"
                onClick={() => void toggleFavorite(row.id)}
                className={cn(
                  "rounded-xl border border-border p-2 transition",
                  favorites[row.id] && "border-brand/50 bg-brand/10 text-brand",
                )}
              >
                <Heart size={16} />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted">{row.description}</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">INR {row.price}</span> • {row.category}
            </p>
            <p className="mt-1 text-xs text-muted">
              Favorites {row.favoritesCount} | Sales {row.salesCount} | Refunds {row.refundCount}
            </p>
            <p className="mt-1 text-xs text-muted">
              Rating {row.averageRating}/5 ({row.reviewsCount}) | Owner trust {row.ownerTrustScore}
            </p>
            <p className="mt-1 text-xs text-muted">
              {row.ownerCertificateSerial
                ? `Certificate ${row.ownerCertificateSerial}`
                : "Certificate pending"}
            </p>

            {row.noRefund && (
              <p className="mt-3 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
                No Refund
              </p>
            )}

            <div className="mt-4 space-y-2 text-xs text-muted">
              <p>Product key: {row.uniqueLinkSlug}</p>
              <Link
                href={`/products/${row.uniqueLinkSlug}`}
                className="inline-flex rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
              >
                Open product page
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
