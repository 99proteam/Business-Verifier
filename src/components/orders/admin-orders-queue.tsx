"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminApproveOrderRefund,
  adminReleaseEscrowOrder,
  fetchAdminOrders,
  OrderRecord,
} from "@/lib/firebase/repositories";
import { OrderStatusPill } from "@/components/orders/order-status-pill";

export function AdminOrdersQueue() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const orders = await fetchAdminOrders();
      setRows(orders);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin order queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function approveRefund(orderId: string) {
    if (!user) return;
    setBusyId(orderId);
    setError(null);
    setInfo(null);
    try {
      await adminApproveOrderRefund(
        orderId,
        user.uid,
        user.displayName ?? "Admin",
        "Refund approved after review",
      );
      setInfo(`Refund approved for order ${orderId}`);
      await loadOrders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to approve refund right now.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function releaseEscrow(orderId: string) {
    if (!user) return;
    setBusyId(orderId);
    setError(null);
    setInfo(null);
    try {
      await adminReleaseEscrowOrder(orderId, user.uid, user.displayName ?? "Admin");
      setInfo(`Escrow released for order ${orderId}`);
      await loadOrders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to release escrow right now.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Orders Queue</h1>
        <p className="mt-2 text-sm text-muted">
          Manage refunds and escrow release for platform orders.
        </p>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading orders...
        </div>
      )}

      {!loading &&
        rows.map((row) => {
          const canRelease =
            row.status === "paid" && new Date() >= new Date(row.escrowReleaseAt);
          return (
            <article key={row.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{row.productTitle}</h2>
                <OrderStatusPill status={row.status} />
              </div>
              <p className="mt-2 text-sm text-muted">
                Customer {row.customerEmail} • Amount INR {row.amount}
              </p>
              <p className="mt-1 text-sm text-muted">
                Refund deadline {new Date(row.refundDeadlineAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted">
                Escrow release {new Date(row.escrowReleaseAt).toLocaleString()}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {row.status === "refund_requested" && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void approveRefund(row.id)}
                    className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
                  >
                    {busyId === row.id ? "Processing..." : "Approve refund"}
                  </button>
                )}
                {canRelease && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void releaseEscrow(row.id)}
                    className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                  >
                    {busyId === row.id ? "Processing..." : "Release escrow"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
