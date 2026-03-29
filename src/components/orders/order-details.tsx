"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchOrderById,
  OrderRecord,
  requestOrderRefund,
} from "@/lib/firebase/repositories";
import { OrderStatusPill } from "@/components/orders/order-status-pill";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";

export function OrderDetails({ orderId }: { orderId: string }) {
  const { user, hasFirebaseConfig } = useAuth();
  const [row, setRow] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const canRefund = useMemo(() => {
    if (!row) return false;
    if (row.noRefund) return false;
    if (row.status !== "paid") return false;
    return new Date() <= new Date(row.refundDeadlineAt);
  }, [row]);

  const loadOrder = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const order = await fetchOrderById(orderId);
      setRow(order);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load order.");
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function handleRefundRequest(event: FormEvent) {
    event.preventDefault();
    if (!user || !row) return;
    if (!refundReason.trim()) {
      setError("Refund reason is required.");
      return;
    }
    if (!files.length) {
      setError("Proof files are required for refund request.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const urls = await uploadEvidenceFiles(`order-refunds/${orderId}/${user.uid}`, files);
      const ticketId = await requestOrderRefund(orderId, {
        customerUid: user.uid,
        customerName: user.displayName ?? "Customer",
        customerEmail: user.email ?? "",
        reason: refundReason.trim(),
        evidenceUrls: urls,
      });
      setInfo(`Refund requested and support ticket created: ${ticketId}`);
      setRefundReason("");
      setFiles([]);
      await loadOrder();
    } catch (refundError) {
      setError(
        refundError instanceof Error
          ? refundError.message
          : "Unable to request refund right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing in `.env.local`.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading order...
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Order not found.
      </div>
    );
  }

  if (user && row.customerUid !== user.uid) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Access denied for this order.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <article className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{row.productTitle}</h1>
          <OrderStatusPill status={row.status} />
        </div>
        <p className="mt-2 text-sm text-muted">Order ID: {row.id}</p>
        <p className="mt-2 text-sm text-muted">
          Amount INR {row.amount} • Business {row.businessOwnerName}
        </p>
        <p className="mt-1 text-sm text-muted">
          Refund deadline {new Date(row.refundDeadlineAt).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-muted">
          Escrow release {new Date(row.escrowReleaseAt).toLocaleString()}
        </p>
        {row.noRefund && (
          <p className="mt-3 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
            No Refund Product
          </p>
        )}
        {row.refundTicketId && (
          <div className="mt-3">
            <Link
              href={`/dashboard/tickets/${row.refundTicketId}`}
              className="inline-flex rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
            >
              Open refund ticket thread
            </Link>
          </div>
        )}
      </article>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {canRefund && (
        <form onSubmit={handleRefundRequest} className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Request refund</h2>
          <p className="mt-1 text-sm text-muted">
            Provide clear reason and proof. This will create a ticket and alert admin.
          </p>
          <textarea
            value={refundReason}
            onChange={(event) => setRefundReason(event.target.value)}
            rows={4}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Explain why you need refund..."
          />
          <input
            type="file"
            multiple
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            {busy ? "Submitting..." : "Submit refund request"}
          </button>
        </form>
      )}
    </div>
  );
}
