"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchOrdersByCustomer, OrderRecord } from "@/lib/firebase/repositories";
import { OrderStatusPill } from "@/components/orders/order-status-pill";

export function OrdersList() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user || !hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const orders = await fetchOrdersByCustomer(user.uid);
        setRows(orders);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load orders.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hasFirebaseConfig, user]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
        <p className="mt-2 text-sm text-muted">
          Orders purchased through platform with escrow and refund timeline.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading orders...
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}
      {!loading && !error && !rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No orders yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.productTitle}</h2>
            <OrderStatusPill status={row.status} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Amount INR {row.amount} • Business {row.businessOwnerName}
          </p>
          <p className="mt-1 text-xs text-muted">
            Refund deadline {new Date(row.refundDeadlineAt).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted">
            Escrow release {new Date(row.escrowReleaseAt).toLocaleString()}
          </p>
          <Link
            href={`/dashboard/orders/${row.id}`}
            className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
          >
            Open order
          </Link>
        </article>
      ))}
    </div>
  );
}
