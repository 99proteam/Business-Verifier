"use client";

import { useEffect, useState } from "react";
import { CheckoutPanel } from "@/components/orders/checkout-panel";
import {
  DigitalProductRecord,
  fetchDigitalProductBySlug,
} from "@/lib/firebase/repositories";

export function CheckoutView({
  slug,
  selectedPlanKey,
}: {
  slug: string;
  selectedPlanKey?: string;
}) {
  const [product, setProduct] = useState<DigitalProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchDigitalProductBySlug(slug);
        setProduct(row);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load checkout details.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [slug]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading checkout...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Product not found.
      </div>
    );
  }

  return <CheckoutPanel product={product} initialPlanKey={selectedPlanKey} />;
}
