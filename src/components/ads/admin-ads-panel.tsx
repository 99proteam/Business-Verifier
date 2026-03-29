"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  AdTagPlanRecord,
  AdCampaignRecord,
  AdCampaignStatus,
  adminReviewAdCampaign,
  buildAdPerformanceCsv,
  buildAdPerformanceReport,
  fetchAdPricingSettings,
  fetchAdminAdCampaigns,
  updateAdPricingSettings,
} from "@/lib/firebase/repositories";

export function AdminAdsPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<AdCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [homeBannerCpm, setHomeBannerCpm] = useState("120");
  const [directoryBannerCpm, setDirectoryBannerCpm] = useState("80");
  const [recommendedTagMonthly, setRecommendedTagMonthly] = useState("499");
  const [recommendedTagYearly, setRecommendedTagYearly] = useState("4990");
  const [customTagPlansText, setCustomTagPlansText] = useState("[]");
  const [cityTargetingSurchargePercent, setCityTargetingSurchargePercent] =
    useState("10");
  const [reportSummary, setReportSummary] = useState<{
    campaigns: number;
    impressions: number;
    clicks: number;
    estimatedCost: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [campaigns, settings] = await Promise.all([
        fetchAdminAdCampaigns(),
        fetchAdPricingSettings(),
      ]);
      const report = await buildAdPerformanceReport();
      setRows(campaigns);
      setReportSummary(report.summary);
      setHomeBannerCpm(String(settings.homeBannerCpm));
      setDirectoryBannerCpm(String(settings.directoryBannerCpm));
      setRecommendedTagMonthly(String(settings.recommendedTagMonthly));
      setRecommendedTagYearly(String(settings.recommendedTagYearly));
      setCustomTagPlansText(JSON.stringify(settings.customTagPlans ?? [], null, 2));
      setCityTargetingSurchargePercent(String(settings.cityTargetingSurchargePercent));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin ads panel.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePricing(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      let customTagPlans: AdTagPlanRecord[] = [];
      try {
        const parsed = JSON.parse(customTagPlansText) as unknown;
        customTagPlans = Array.isArray(parsed) ? (parsed as AdTagPlanRecord[]) : [];
      } catch {
        setError(
          "Custom tag plans must be valid JSON array. Example: [{\"name\":\"featured\",\"monthlyPrice\":799,\"yearlyPrice\":7990}]",
        );
        setBusy(false);
        return;
      }
      await updateAdPricingSettings({
        adminUid: user.uid,
        homeBannerCpm: Number(homeBannerCpm),
        directoryBannerCpm: Number(directoryBannerCpm),
        recommendedTagMonthly: Number(recommendedTagMonthly),
        recommendedTagYearly: Number(recommendedTagYearly),
        customTagPlans,
        cityTargetingSurchargePercent: Number(cityTargetingSurchargePercent),
      });
      setInfo("Ad pricing settings updated.");
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save ad pricing.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewCampaign(campaignId: string, status: AdCampaignStatus) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await adminReviewAdCampaign({
        campaignId,
        adminUid: user.uid,
        status,
        notes: reviewNotes[campaignId]?.trim() ?? "",
      });
      setInfo(`Campaign updated to ${status}.`);
      await load();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to review campaign.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportReportCsv() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const csv = await buildAdPerformanceCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ad-performance-admin.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setInfo("Admin ad performance CSV downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export ad report.");
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
        Loading admin ads panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Ads Controls</h1>
        <p className="mt-2 text-sm text-muted">
          Review campaigns, control ad status, and manage pricing inputs used in billing.
        </p>
        {reportSummary && (
          <p className="mt-2 text-xs text-muted">
            Campaigns {reportSummary.campaigns} | Impressions {reportSummary.impressions} |
            Clicks {reportSummary.clicks} | Estimated unbilled INR {reportSummary.estimatedCost}
          </p>
        )}
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={savePricing} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Ad pricing settings</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={homeBannerCpm}
            onChange={(event) => setHomeBannerCpm(event.target.value)}
            type="number"
            placeholder="Home banner CPM"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={directoryBannerCpm}
            onChange={(event) => setDirectoryBannerCpm(event.target.value)}
            type="number"
            placeholder="Directory banner CPM"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={recommendedTagMonthly}
            onChange={(event) => setRecommendedTagMonthly(event.target.value)}
            type="number"
            placeholder="Recommended tag monthly price"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={recommendedTagYearly}
            onChange={(event) => setRecommendedTagYearly(event.target.value)}
            type="number"
            placeholder="Recommended tag yearly price"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={cityTargetingSurchargePercent}
            onChange={(event) => setCityTargetingSurchargePercent(event.target.value)}
            type="number"
            placeholder="City targeting surcharge %"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={customTagPlansText}
            onChange={(event) => setCustomTagPlansText(event.target.value)}
            rows={5}
            placeholder='[{"name":"recommended_plus","monthlyPrice":899,"yearlyPrice":8990}]'
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none md:col-span-2"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Save ad pricing
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Campaign review queue</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportReportCsv()}
            className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
          >
            Export report CSV
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {!rows.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No campaigns found.
            </p>
          )}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {row.title} | {row.ownerName}
                </p>
                <span className="rounded-full border border-border px-2 py-1 text-xs capitalize">
                  {row.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Placement{" "}
                {row.placement === "home_banner" ? "Home banner" : "Directory banner"} |
                Impressions {row.impressions} | Clicks {row.clicks} | Billed {row.billedImpressions}
              </p>
              {row.tagPlanName && (
                <p className="mt-1 text-xs text-muted">
                  Tag plan {row.tagPlanName} | {row.tagPlanCycle} | INR{" "}
                  {row.tagPlanCycle === "yearly"
                    ? row.tagPlanYearlyPrice ?? 0
                    : row.tagPlanMonthlyPrice ?? 0}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                CTR{" "}
                {row.impressions > 0
                  ? `${Math.round((row.clicks / row.impressions) * 10000) / 100}%`
                  : "0%"}
              </p>
              {row.cityTargets.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  City targets: {row.cityTargets.join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                Created {new Date(row.createdAt).toLocaleString()}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                <div className="relative h-24 w-full overflow-hidden rounded-xl">
                  <Image
                    src={row.imageUrl}
                    alt={row.title}
                    fill
                    sizes="180px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <a
                  href={row.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
                >
                  {row.destinationUrl}
                </a>
              </div>
              <textarea
                value={reviewNotes[row.id] ?? row.notes ?? ""}
                onChange={(event) =>
                  setReviewNotes((prev) => ({ ...prev, [row.id]: event.target.value }))
                }
                rows={2}
                placeholder="Admin review notes..."
                className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewCampaign(row.id, "active")}
                  className="rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
                >
                  Approve active
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewCampaign(row.id, "paused")}
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewCampaign(row.id, "draft")}
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  Move draft
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewCampaign(row.id, "rejected")}
                  className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
