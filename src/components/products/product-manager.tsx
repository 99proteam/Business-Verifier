"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createDigitalProduct,
  DigitalProductRecord,
  fetchDigitalProductsByOwner,
} from "@/lib/firebase/repositories";

const schema = z.object({
  title: z.string().min(3, "Title is required."),
  category: z.string().min(2, "Category is required."),
  description: z.string().min(12, "Description should be at least 12 characters."),
  price: z.coerce.number().min(1, "Price must be greater than 0."),
  noRefund: z.boolean(),
});

type ProductInput = z.infer<typeof schema>;
type ProductFormInput = z.input<typeof schema>;
type ProductFormOutput = z.output<typeof schema>;

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function ProductManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<DigitalProductRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      noRefund: false,
    },
  });

  async function loadProducts() {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const products = await fetchDigitalProductsByOwner(user.uid);
      setRows(products);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load digital products.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, [hasFirebaseConfig, user]);

  const onSubmit = async (value: ProductInput) => {
    if (!user) {
      setError("Please sign in first.");
      return;
    }

    if (!hasFirebaseConfig) {
      setError("Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* values.");
      return;
    }

    setError(null);
    setInfo(null);
    try {
      await createDigitalProduct({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title: value.title,
        description: value.description,
        price: value.price,
        noRefund: value.noRefund,
        category: value.category,
      });
      setInfo("Digital product created.");
      reset({ noRefund: false });
      await loadProducts();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create product right now.",
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Digital Products</h1>
        <p className="mt-2 text-sm text-muted">
          Manage sellable digital products with no-refund highlighting and unique links.
        </p>
        <Link
          href="/dashboard/business/orders"
          className="mt-3 inline-flex rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
        >
          View sales and refunds
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create product</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm">Title</span>
            <input className={fieldClass} {...register("title")} />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </label>
          <label className="space-y-1">
            <span className="text-sm">Category</span>
            <input className={fieldClass} {...register("category")} />
            {errors.category && (
              <p className="text-xs text-danger">{errors.category.message}</p>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-sm">Price (INR)</span>
            <input type="number" className={fieldClass} {...register("price")} />
            {errors.price && <p className="text-xs text-danger">{errors.price.message}</p>}
          </label>
          <label className="flex items-center gap-2 text-sm md:pt-8">
            <input type="checkbox" {...register("noRefund")} />
            Mark as no-refund product
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Description</span>
            <textarea rows={4} className={fieldClass} {...register("description")} />
            {errors.description && (
              <p className="text-xs text-danger">{errors.description.message}</p>
            )}
          </label>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : "Create product"}
        </button>
      </form>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        {loading && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Loading products...
          </div>
        )}

        {!loading && !rows.length && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No products created yet.
          </div>
        )}

        {rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{row.title}</h3>
              <span className="text-sm text-muted">INR {row.price}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {row.category} • Favorites {row.favoritesCount}
            </p>
            {row.noRefund && (
              <p className="mt-2 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
                No Refund
              </p>
            )}
            <p className="mt-2 text-xs text-muted">Product link key: {row.uniqueLinkSlug}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
