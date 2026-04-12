"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessApplicationRecord,
  createSupportTicket,
  fetchPublicBusinessDirectory,
} from "@/lib/firebase/repositories";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";

const ticketSchema = z.object({
  businessId: z.string().optional(),
  businessSlug: z.string().optional(),
  businessName: z.string().min(2, "Business name is required."),
  orderReference: z.string().optional(),
  title: z.string().min(6, "Add a clear issue title."),
  description: z.string().min(20, "Please explain the issue in detail."),
  priority: z.enum(["low", "medium", "high", "critical"]),
  expectedOutcome: z.string().min(6, "Tell us what resolution you expect."),
});

type TicketInput = z.infer<typeof ticketSchema>;

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function TicketForm() {
  const { user, hasFirebaseConfig } = useAuth();
  const searchParams = useSearchParams();
  const prefilledBusinessName = searchParams.get("business")?.trim() ?? "";
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<TicketInput | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [businessRows, setBusinessRows] = useState<BusinessApplicationRecord[]>([]);
  const [businessQuery, setBusinessQuery] = useState(prefilledBusinessName);
  const [businessLoaded, setBusinessLoaded] = useState(false);
  const businessBusy = hasFirebaseConfig && !businessLoaded;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TicketInput>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      priority: "medium",
      businessName: prefilledBusinessName,
    },
  });

  useEffect(() => {
    if (!hasFirebaseConfig) return;
    let active = true;
    void fetchPublicBusinessDirectory()
      .then((rows) => {
        if (!active) return;
        setBusinessRows(rows);
      })
      .catch(() => {
        if (!active) return;
        setBusinessRows([]);
      })
      .finally(() => {
        if (!active) return;
        setBusinessLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [hasFirebaseConfig]);

  const filteredBusinesses = useMemo(() => {
    const query = businessQuery.trim().toLowerCase();
    if (!query) return businessRows.slice(0, 40);
    return businessRows
      .filter((row) => {
        const haystack = `${row.businessName} ${row.publicBusinessKey} ${row.city} ${row.country}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 40);
  }, [businessQuery, businessRows]);

  const onSubmit = async (value: TicketInput) => {
    if (!user) {
      setError("Please sign in first.");
      return;
    }

    if (!files.length) {
      setError("Proof documents are required to create a ticket.");
      return;
    }

    if (!hasFirebaseConfig) {
      setError("Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* values.");
      return;
    }

    setError(null);
    try {
      const evidenceUrls = await uploadEvidenceFiles(
        `support-evidence/${user.uid}`,
        files,
      );
      const id = await createSupportTicket({
        customerUid: user.uid,
        customerName: user.displayName ?? "Customer",
        customerEmail: user.email ?? "",
        businessId: value.businessId,
        businessSlug: value.businessSlug,
        businessName: value.businessName,
        orderReference: value.orderReference,
        title: value.title,
        description: value.description,
        priority: value.priority,
        expectedOutcome: value.expectedOutcome,
        evidenceUrls,
      });
      setTicketId(id);
      setSubmitted(value);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create ticket right now.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="glass rounded-3xl p-6 md:p-8"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Create support ticket</h1>
        <p className="mt-1 text-sm text-muted">
          Customer, business owner, and admin workflow starts from this ticket. Evidence
          is mandatory to prevent fake or low-context disputes.
        </p>

        {!hasFirebaseConfig && (
          <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            Firebase environment variables are missing. Configure `.env.local` first.
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">Select listed business</span>
              <span className="text-xs text-muted">
                {businessBusy
                  ? "Loading businesses..."
                  : `${businessRows.length} business listings available`}
              </span>
            </div>
            <input
              value={businessQuery}
              onChange={(event) => setBusinessQuery(event.target.value)}
              placeholder="Search by business name, key, city, country..."
              className={fieldClass}
            />
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-surface p-2">
              {!filteredBusinesses.length && (
                <p className="px-2 py-1 text-xs text-muted">No matching business found.</p>
              )}
              {filteredBusinesses.map((business) => (
                <button
                  key={business.id}
                  type="button"
                  onClick={() => {
                    setValue("businessId", business.id);
                    setValue("businessSlug", business.slug);
                    setValue("businessName", business.businessName, {
                      shouldValidate: true,
                    });
                    setBusinessQuery(business.businessName);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs transition hover:bg-brand/10"
                >
                  <span>
                    <span className="block font-medium text-foreground">
                      {business.businessName}
                    </span>
                    <span className="text-muted">
                      {business.city}, {business.country} | {business.publicBusinessKey}
                    </span>
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                    Trust {business.trustScore}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Selected business</span>
            <input
              className={fieldClass}
              {...register("businessName")}
              placeholder="Pick from search list above"
            />
            {errors.businessName && (
              <p className="text-xs text-danger">{errors.businessName.message}</p>
            )}
          </label>
          <input type="hidden" {...register("businessId")} />
          <input type="hidden" {...register("businessSlug")} />

          <label className="space-y-1">
            <span className="text-sm">Order reference (optional)</span>
            <input className={fieldClass} {...register("orderReference")} />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Issue title</span>
            <input className={fieldClass} {...register("title")} />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Issue details</span>
            <textarea rows={4} className={fieldClass} {...register("description")} />
            {errors.description && (
              <p className="text-xs text-danger">{errors.description.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">Priority</span>
            <select className={fieldClass} {...register("priority")}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm">Expected outcome</span>
            <input
              placeholder="Replacement, fix, refund, clarification..."
              className={fieldClass}
              {...register("expectedOutcome")}
            />
            {errors.expectedOutcome && (
              <p className="text-xs text-danger">{errors.expectedOutcome.message}</p>
            )}
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Proof documents (required)</span>
            <input
              type="file"
              multiple
              className={fieldClass}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
              }}
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Submitting..." : "Create ticket"}
        </button>
      </form>

      {submitted && (
        <div className="rounded-2xl border border-brand/35 bg-brand/10 p-4 text-sm">
          Ticket created for <b>{submitted.businessName}</b> with {files.length} proof
          file(s). Ticket ID: <b>{ticketId}</b>
          <div className="mt-3">
            <Link
              href={`/dashboard/tickets/${ticketId}`}
              className="inline-flex rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-strong"
            >
              Open ticket thread
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
