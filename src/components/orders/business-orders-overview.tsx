"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchOrdersByBusinessOwner, OrderRecord } from "@/lib/firebase/repositories";
import { OrderStatusPill } from "@/components/orders/order-status-pill";

export function BusinessOrdersOverview() {
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
        const orders = await fetchOrdersByBusinessOwner(user.uid);
        setRows(orders);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load business orders.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hasFirebaseConfig, user]);

  const stats = useMemo(() => {
    const sales = rows.filter((item) => item.status === "paid" || item.status === "released");
    const refunds = rows.filter((item) => item.status === "refunded");
    const refundRequested = rows.filter((item) => item.status === "refund_requested");
    return {
      salesCount: sales.length,
      grossSales: sales.reduce((sum, item) => sum + item.amount, 0),
      refundedCount: refunds.length,
      refundedAmount: refunds.reduce((sum, item) => sum + item.amount, 0),
      pendingRefundCount: refundRequested.length,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Order Analytics</h1>
        <p className="mt-2 text-sm text-muted">
          Sales and refund snapshot for your digital products.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Sales</p>
            <p className="mt-1 text-xl font-semibold">{stats.salesCount}</p>
            <p className="text-xs text-muted">INR {stats.grossSales}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Refunded</p>
            <p className="mt-1 text-xl font-semibold">{stats.refundedCount}</p>
            <p className="text-xs text-muted">INR {stats.refundedAmount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Refund pending</p>
            <p className="mt-1 text-xl font-semibold">{stats.pendingRefundCount}</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading business orders...
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{row.productTitle}</h2>
              <OrderStatusPill status={row.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              Customer {row.customerEmail} • INR {row.amount}
            </p>
            <p className="mt-1 text-xs text-muted">
              Ordered {new Date(row.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
    </div>
  );
}
