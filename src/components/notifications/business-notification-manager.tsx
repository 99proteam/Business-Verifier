"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createNotificationEndpoint,
  fetchNotificationDeliveryLogsByOwner,
  fetchNotificationApiCharges,
  fetchNotificationEndpointsByOwner,
  NotificationCategory,
  NotificationDeliveryLogRecord,
  NotificationEndpointRecord,
  NotificationEndpointIdentifierType,
  ownerDisconnectNotificationEndpoint,
  sendNotificationViaEndpoint,
} from "@/lib/firebase/repositories";

export function BusinessNotificationManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<NotificationEndpointRecord[]>([]);
  const [logs, setLogs] = useState<NotificationDeliveryLogRecord[]>([]);
  const [monthlyBaseFee, setMonthlyBaseFee] = useState(99);
  const [per1000MessagesFee, setPer1000MessagesFee] = useState(25);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [endpointLabel, setEndpointLabel] = useState("Primary Notification API");
  const [identifierType, setIdentifierType] =
    useState<NotificationEndpointIdentifierType>("permanent");
  const [temporaryDurationDays, setTemporaryDurationDays] = useState("30");
  const [selectedEndpointId, setSelectedEndpointId] = useState("");
  const [endpointSecret, setEndpointSecret] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("offers");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientPublicIds, setRecipientPublicIds] = useState("");

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [endpoints, charges] = await Promise.all([
        fetchNotificationEndpointsByOwner(user.uid),
        fetchNotificationApiCharges(),
      ]);
      const deliveryLogs = await fetchNotificationDeliveryLogsByOwner(user.uid);
      setRows(endpoints);
      setLogs(deliveryLogs);
      setMonthlyBaseFee(charges.monthlyBaseFee);
      setPer1000MessagesFee(charges.per1000MessagesFee);
      if (endpoints.length && !selectedEndpointId) {
        setSelectedEndpointId(endpoints[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notification manager.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, selectedEndpointId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateEndpoint(event: FormEvent) {
    event.preventDefault();
    if (!user || !endpointLabel.trim()) return;

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const endpoint = await createNotificationEndpoint({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        label: endpointLabel.trim(),
        identifierType,
        temporaryDurationDays: Number(temporaryDurationDays),
      });
      setInfo(
        `Endpoint created: ${endpoint.endpointId}. Save secret now: ${endpoint.endpointSecret}`,
      );
      setEndpointLabel("Primary Notification API");
      setIdentifierType("permanent");
      setTemporaryDurationDays("30");
      await load();
      setSelectedEndpointId(endpoint.endpointId);
      setEndpointSecret(endpoint.endpointSecret);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create endpoint.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnectEndpoint(endpointId: string) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await ownerDisconnectNotificationEndpoint({
        endpointId,
        ownerUid: user.uid,
      });
      setInfo("Endpoint disconnected.");
      await load();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Unable to disconnect endpoint.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendNotification(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!selectedEndpointId || !endpointSecret.trim()) {
      setError("Endpoint and secret are required.");
      return;
    }
    if (!title.trim() || !message.trim() || !recipientPublicIds.trim()) {
      setError("Title, message, and recipient IDs are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const delivered = await sendNotificationViaEndpoint({
        endpointId: selectedEndpointId,
        ownerUid: user.uid,
        endpointSecret: endpointSecret.trim(),
        category,
        title: title.trim(),
        message: message.trim(),
        recipientPublicIds: recipientPublicIds.split(","),
      });
      setInfo(`Notification delivered to ${delivered} user(s).`);
      setTitle("");
      setMessage("");
      setRecipientPublicIds("");
      await load();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send notification.",
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
        Loading notification manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notification API</h1>
        <p className="mt-2 text-sm text-muted">
          Create endpoint, send notifications by public ID, and monitor usage.
        </p>
        <p className="mt-2 text-xs text-muted">
          Charges: monthly INR {monthlyBaseFee} + INR {per1000MessagesFee} per 1000 messages.
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

      <form onSubmit={handleCreateEndpoint} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create endpoint</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={endpointLabel}
            onChange={(event) => setEndpointLabel(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Endpoint label"
          />
          <select
            value={identifierType}
            onChange={(event) =>
              setIdentifierType(event.target.value as NotificationEndpointIdentifierType)
            }
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="permanent">Permanent ID</option>
            <option value="temporary">Temporary ID</option>
          </select>
          {identifierType === "temporary" && (
            <input
              type="number"
              value={temporaryDurationDays}
              onChange={(event) => setTemporaryDurationDays(event.target.value)}
              placeholder="Valid for days"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Create endpoint
          </button>
        </div>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Your endpoints</h2>
        <div className="mt-3 space-y-2">
          {!rows.length && <p className="text-sm text-muted">No endpoints yet.</p>}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium">{row.label}</p>
              <p className="text-xs text-muted">
                Status {row.status} | Sent {row.sentCount} | Spam reports {row.spamReports}
              </p>
              <p className="text-xs text-muted">
                ID type {row.identifierType}
                {row.expiresAt ? ` | Expires ${new Date(row.expiresAt).toLocaleString()}` : ""}
                {row.disconnectedAt
                  ? ` | Disconnected ${new Date(row.disconnectedAt).toLocaleString()}`
                  : ""}
              </p>
              <p className="text-xs text-muted">
                Delivered {row.deliveredCount} | Failed {row.failedCount} | Abuse score {row.abuseScore}
              </p>
              {row.blockedUntil && (
                <p className="text-xs text-danger">Blocked until {new Date(row.blockedUntil).toLocaleString()}</p>
              )}
              <p className="mt-1 text-xs text-muted">Endpoint ID: {row.id}</p>
              <p className="text-xs text-muted">Secret: {row.endpointSecret}</p>
              <button
                type="button"
                disabled={busy || Boolean(row.disconnectedAt)}
                onClick={() => void disconnectEndpoint(row.id)}
                className="mt-2 rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
              >
                {row.disconnectedAt ? "Disconnected" : "Disconnect endpoint"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Delivery analytics</h2>
        <div className="mt-3 space-y-2">
          {!logs.length && <p className="text-sm text-muted">No delivery logs yet.</p>}
          {logs.slice(0, 50).map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {row.category} | Attempted {row.attempted} | Delivered {row.delivered}
              </p>
              <p className="text-xs text-muted">
                Failed {row.failed} | Window count {row.windowCount} | {row.status}
              </p>
              <p className="text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      </section>

      <form onSubmit={handleSendNotification} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Send notification</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            value={selectedEndpointId}
            onChange={(event) => setSelectedEndpointId(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="">Select endpoint</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label} ({row.status})
              </option>
            ))}
          </select>
          <input
            value={endpointSecret}
            onChange={(event) => setEndpointSecret(event.target.value)}
            placeholder="Endpoint secret"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as NotificationCategory)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="offers">Offers</option>
            <option value="updates">Updates</option>
            <option value="general">General</option>
            <option value="emergency">Emergency</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Message"
            rows={3}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none md:col-span-2"
          />
          <textarea
            value={recipientPublicIds}
            onChange={(event) => setRecipientPublicIds(event.target.value)}
            placeholder="Recipient public IDs (comma separated)"
            rows={3}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none md:col-span-2"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Send notification
        </button>
      </form>
    </div>
  );
}
