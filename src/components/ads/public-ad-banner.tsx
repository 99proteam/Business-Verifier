"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  AdCampaignRecord,
  AdPlacement,
  fetchPublicAds,
  registerAdImpression,
} from "@/lib/firebase/repositories";

type PublicAdBannerProps = {
  placement: AdPlacement;
  city?: string;
  className?: string;
};

export function PublicAdBanner({ placement, city, className }: PublicAdBannerProps) {
  const [ad, setAd] = useState<AdCampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const trackedImpressions = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const rows = await fetchPublicAds({
          placement,
          city: city?.trim() || undefined,
        });
        if (!active) return;

        if (!rows.length) {
          setAd(null);
          return;
        }

        const picked = rows[Math.floor(Math.random() * rows.length)];
        setAd(picked);

        if (!trackedImpressions.current.has(picked.id)) {
          trackedImpressions.current.add(picked.id);
          void registerAdImpression(picked.id);
        }
      } catch {
        if (active) setAd(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [placement, city]);

  if (loading || !ad) return null;

  return (
    <aside
      className={`glass overflow-hidden rounded-3xl border border-brand/20 ${
        className ?? ""
      }`}
    >
      <a
        href={`/api/ads/click?campaignId=${encodeURIComponent(ad.id)}&to=${encodeURIComponent(
          ad.destinationUrl,
        )}`}
        target="_blank"
        rel="noreferrer"
        className="block transition hover:opacity-95"
      >
        <div className="relative h-48 w-full overflow-hidden bg-surface">
          <Image
            src={ad.imageUrl}
            alt={ad.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-full w-full object-cover"
            unoptimized
          />
        </div>
        <div className="space-y-2 p-4">
          <p className="inline-flex rounded-full bg-brand/15 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-strong">
            Sponsored
          </p>
          <p className="text-base font-semibold tracking-tight">{ad.title}</p>
          <p className="text-xs text-muted">
            {ad.cityTargets.length
              ? `City targeted: ${ad.cityTargets.join(", ")}`
              : "Visible across all cities"}
          </p>
        </div>
      </a>
    </aside>
  );
}
