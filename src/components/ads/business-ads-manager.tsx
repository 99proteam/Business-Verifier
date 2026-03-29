"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";
import {
  AdCampaignRecord,
  AdPlacement,
  createAdCampaign,
  fetchAdCampaignsByOwner,
  fetchAdPricingSettings,
} from "@/lib/firebase/repositories";

type PricingState = {
  homeBannerCpm: number;
  directoryBannerCpm: number;
  recommendedTagMonthly: number;
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
    cityTargetingSurchargePercent: 10,
  });

  const [title, setTitle] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("home_banner");
  const [cityTargets, setCityTargets] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

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
      totalUnbilled,
      estimated,
    };
  }, [pricing, rows]);

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

      const campaignId = await createAdCampaign({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title: title.trim(),
        imageUrl: resolvedImageUrl,
        destinationUrl: destinationUrl.trim(),
        placement,
        cityTargets: targets,
      });

      setInfo(`Campaign created: ${campaignId}. Admin review is required.`);
      setTitle("");
      setDestinationUrl("");
      setPlacement("home_banner");
      setCityTargets("");
      setImageUrl("");
      setImageFile(null);
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
            <p className="text-xs text-muted">{stats.totalUnbilled} unbilled</p>
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
        <h2 className="text-lg font-semibold tracking-tight">Your campaigns</h2>
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
                  Impressions {row.impressions} | Unbilled {unbilled}
                </p>
                <p className="mt-1 text-xs text-muted">Estimated unbilled fee INR {estimated}</p>
                {row.cityTargets.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    City targets: {row.cityTargets.join(", ")}
                  </p>
                )}
                {row.notes && (
                  <p className="mt-1 text-xs text-muted">Admin note: {row.notes}</p>
                )}
                <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                  <img
                    src={row.imageUrl}
                    alt={row.title}
                    className="h-24 w-full rounded-xl object-cover"
                    loading="lazy"
                  />
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
