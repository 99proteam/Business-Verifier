"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";
import {
  AdTagPlanRecord,
  AdCampaignRecord,
  AdPlacement,
  buildAdPerformanceCsv,
  createAdCampaign,
  fetchAdCampaignsByOwner,
  fetchAdPricingSettings,
} from "@/lib/firebase/repositories";

type PricingState = {
  homeBannerCpm: number;
  directoryBannerCpm: number;
  recommendedTagMonthly: number;
  recommendedTagYearly: number;
  customTagPlans: AdTagPlanRecord[];
  cityTargetingSurchargePercent: number;
};

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function estimateCampaignFee(campaign: AdCampaignRecord, pricing: PricingState) {
  const unbilledImpressions = Math.max(
    campaign.impressions - campaign.billedImpressions,
    0,
  );
  if (unbilledImpressions === 0) return 0;

  const cpm =
    campaign.placement === "home_banner"
      ? pricing.homeBannerCpm
      : pricing.directoryBannerCpm;
  const cityMultiplier =
    campaign.cityTargets.length > 0
      ? 1 + pricing.cityTargetingSurchargePercent / 100
      : 1;
  return Math.round(Math.ceil(unbilledImpressions / 1000) * cpm * cityMultiplier);
}

export function BusinessAdsManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<AdCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PricingState>({
    homeBannerCpm: 120,
    directoryBannerCpm: 80,
    recommendedTagMonthly: 499,
    recommendedTagYearly: 4990,
    customTagPlans: [],
    cityTargetingSurchargePercent: 10,
  });

  const [title, setTitle] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("home_banner");
  const [cityTargets, setCityTargets] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedTagPlanName, setSelectedTagPlanName] = useState("");
  const [selectedTagPlanCycle, setSelectedTagPlanCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  const tagPlans = useMemo(() => {
    const rows = [...pricing.customTagPlans];
    if (!rows.some((row) => row.name.toLowerCase() === "recommended")) {
      rows.unshift({
        name: "recommended",
        monthlyPrice: pricing.recommendedTagMonthly,
        yearlyPrice: pricing.recommendedTagYearly,
      });
    }
    return rows;
  }, [pricing.customTagPlans, pricing.recommendedTagMonthly, pricing.recommendedTagYearly]);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [campaigns, adPricing] = await Promise.all([
        fetchAdCampaignsByOwner(user.uid),
        fetchAdPricingSettings(),
      ]);
      setRows(campaigns);
      setPricing(adPricing);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load ads manager.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.status === "active");
    const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const totalClicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const totalUnbilled = rows.reduce(
      (sum, row) => sum + Math.max(row.impressions - row.billedImpressions, 0),
      0,
    );
    const estimated = rows.reduce(
      (sum, row) => sum + estimateCampaignFee(row, pricing),
      0,
    );
    return {
      activeCount: active.length,
      totalCount: rows.length,
      totalImpressions,
      totalClicks,
      totalUnbilled,
      estimated,
    };
  }, [pricing, rows]);

  async function exportPerformanceCsv() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const csv = await buildAdPerformanceCsv({
        ownerUid: user.uid,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ad-performance-business.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setInfo("Ad performance CSV downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export report.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!title.trim() || !destinationUrl.trim()) {
      setError("Title and destination URL are required.");
      return;
    }
    if (!isHttpUrl(destinationUrl.trim())) {
      setError("Destination URL must start with http:// or https://");
      return;
    }
    if (!imageFile && !imageUrl.trim()) {
      setError("Upload an image or provide image URL.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      let resolvedImageUrl = imageUrl.trim();
      if (imageFile) {
        const [uploadedUrl] = await uploadEvidenceFiles(`ads/${user.uid}`, [imageFile]);
        resolvedImageUrl = uploadedUrl;
      }
      if (!isHttpUrl(resolvedImageUrl)) {
        setError("Image URL must start with http:// or https://");
        return;
      }

      const targets = cityTargets
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index);
      const selectedTagPlan = selectedTagPlanName
        ? tagPlans.find((row) => row.name === selectedTagPlanName)
        : undefined;

      const campaignId = await createAdCampaign({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title: title.trim(),
        imageUrl: resolvedImageUrl,
        destinationUrl: destinationUrl.trim(),
        placement,
        cityTargets: targets,
        tagPlanName: selectedTagPlan?.name,
        tagPlanCycle: selectedTagPlan ? selectedTagPlanCycle : undefined,
        tagPlanMonthlyPrice: selectedTagPlan?.monthlyPrice,
        tagPlanYearlyPrice: selectedTagPlan?.yearlyPrice,
      });

      setInfo(`Campaign created: ${campaignId}. Admin review is required.`);
      setTitle("");
      setDestinationUrl("");
      setPlacement("home_banner");
      setCityTargets("");
      setImageUrl("");
      setImageFile(null);
      setSelectedTagPlanName("");
      setSelectedTagPlanCycle("monthly");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create ad campaign right now.",
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
        Loading ads manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Ads Manager</h1>
        <p className="mt-2 text-sm text-muted">
          Launch banner campaigns for home and directory placements with city targeting.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Campaigns</p>
            <p className="mt-1 text-xl font-semibold">{stats.totalCount}</p>
            <p className="text-xs text-muted">{stats.activeCount} active</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Impressions</p>
            <p className="mt-1 text-xl font-semibold">{stats.totalImpressions}</p>
            <p className="text-xs text-muted">
              {stats.totalClicks} clicks | {stats.totalUnbilled} unbilled
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Estimated unbilled</p>
            <p className="mt-1 text-xl font-semibold">INR {stats.estimated}</p>
            <p className="text-xs text-muted">Across all campaigns</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Pricing baseline</p>
            <p className="mt-1 text-sm">Home CPM INR {pricing.homeBannerCpm}</p>
            <p className="text-xs text-muted">Directory CPM INR {pricing.directoryBannerCpm}</p>
            <p className="text-xs text-muted">
              Recommended tag INR {pricing.recommendedTagMonthly}/month or INR {pricing.recommendedTagYearly}/year
            </p>
          </div>
        </div>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={onCreate} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create ad campaign</h2>
        <p className="mt-1 text-xs text-muted">
          Optional tag plans configured by admin:
          {" "}
          {tagPlans.length
            ? tagPlans
                .map((plan) => `${plan.name} (${plan.monthlyPrice}/mo, ${plan.yearlyPrice}/yr)`)
                .join(" | ")
            : "No custom tag plans configured"}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Campaign title"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={destinationUrl}
            onChange={(event) => setDestinationUrl(event.target.value)}
            placeholder="Destination URL"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <select
            value={placement}
            onChange={(event) => setPlacement(event.target.value as AdPlacement)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="home_banner">Home banner</option>
            <option value="directory_banner">Directory banner</option>
          </select>
          <input
            value={cityTargets}
            onChange={(event) => setCityTargets(event.target.value)}
            placeholder="City targets (comma separated, optional)"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="Image URL (optional if uploading file)"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-strong"
          />
          <select
            value={selectedTagPlanName}
            onChange={(event) => setSelectedTagPlanName(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="">No tag plan</option>
            {tagPlans.map((plan) => (
              <option key={plan.name} value={plan.name}>
                {plan.name}
              </option>
            ))}
          </select>
          <select
            value={selectedTagPlanCycle}
            onChange={(event) => setSelectedTagPlanCycle(event.target.value as "monthly" | "yearly")}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="monthly">Tag plan monthly</option>
            <option value="yearly">Tag plan yearly</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {busy ? "Creating..." : "Create campaign"}
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Your campaigns</h2>
          <button
            type="button"
            onClick={() => void exportPerformanceCsv()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
          >
            Export performance CSV
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {!rows.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No campaigns yet.
            </p>
          )}
          {rows.map((row) => {
            const unbilled = Math.max(row.impressions - row.billedImpressions, 0);
            const estimated = estimateCampaignFee(row, pricing);
            return (
              <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.title}</p>
                  <span className="rounded-full border border-border px-2 py-1 text-xs capitalize">
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Placement{" "}
                  {row.placement === "home_banner" ? "Home banner" : "Directory banner"} |
                  Impressions {row.impressions} | Clicks {row.clicks} | Unbilled {unbilled}
                </p>
                <p className="mt-1 text-xs text-muted">
                  CTR{" "}
                  {row.impressions > 0
                    ? `${Math.round((row.clicks / row.impressions) * 10000) / 100}%`
                    : "0%"}
                </p>
                <p className="mt-1 text-xs text-muted">Estimated unbilled fee INR {estimated}</p>
                {row.tagPlanName && (
                  <p className="mt-1 text-xs text-muted">
                    Tag plan {row.tagPlanName} | {row.tagPlanCycle} | INR{" "}
                    {row.tagPlanCycle === "yearly"
                      ? row.tagPlanYearlyPrice ?? 0
                      : row.tagPlanMonthlyPrice ?? 0}
                  </p>
                )}
                {row.cityTargets.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    City targets: {row.cityTargets.join(", ")}
                  </p>
                )}
                {row.notes && (
                  <p className="mt-1 text-xs text-muted">Admin note: {row.notes}</p>
                )}
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
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
