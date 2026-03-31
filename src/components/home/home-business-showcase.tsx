"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  HomeMediaItemRecord,
} from "@/lib/firebase/repositories";

export type HomeShowcaseData = {
  settings: {
    businessMode: "new" | "recommended" | "both";
    businessLimit: number;
    newBusinessWindowDays: number;
    enabledModules: Array<
      "new_business_sidebar" | "recommended_business" | "images_redirect" | "videos_url"
    >;
    imageItems: HomeMediaItemRecord[];
    videoItems: HomeMediaItemRecord[];
    updatedAt?: string;
  };
  businesses: Array<{
    id: string;
    businessName: string;
    mode: "online" | "offline" | "hybrid";
    city: string;
    country: string;
    category: string;
    slug: string;
    trustScore: number;
    yearsInField: number;
    isRecommended?: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  offeringsByBusiness: Record<
    string,
    Array<{
      id: string;
      kind: "product" | "service";
      title: string;
      category: string;
      priceLabel: string;
      href: string;
    }>
  >;
};

function toEmbedVideoUrl(rawUrl: string) {
  const url = rawUrl.trim();
  if (!url) return "";
  if (url.includes("youtube.com/watch?v=")) {
    const id = url.split("watch?v=")[1]?.split("&")[0] ?? "";
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1]?.split("?")[0] ?? "";
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }
  if (url.includes("vimeo.com/")) {
    const id = url.split("vimeo.com/")[1]?.split("?")[0] ?? "";
    return id ? `https://player.vimeo.com/video/${id}` : "";
  }
  return url;
}

function MediaStrip({
  rows,
  kind,
}: {
  rows: HomeMediaItemRecord[];
  kind: "image" | "video";
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.slice(0, 6).map((row, index) => (
        <a
          key={`${kind}_${index}_${row.redirectUrl}`}
          href={row.redirectUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-border bg-white p-3 transition hover:border-brand/40"
        >
          {kind === "image" ? (
            <div className="relative h-40 w-full overflow-hidden rounded-lg">
              <Image
                src={row.mediaUrl}
                alt={row.title}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <iframe
              src={toEmbedVideoUrl(row.mediaUrl)}
              title={row.title}
              className="h-40 w-full rounded-lg"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          <p className="mt-2 text-sm font-medium">{row.title}</p>
        </a>
      ))}
    </div>
  );
}

export function HomeBusinessShowcase({
  initialData,
}: {
  initialData: HomeShowcaseData;
}) {
  const [active, setActive] = useState<"online" | "offline">("online");
  const [streamIndex, setStreamIndex] = useState(0);
  const settings = initialData.settings;
  const rows = initialData.businesses;
  const offeringsByBusiness = initialData.offeringsByBusiness ?? {};
  const newestCreatedAtMs = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((maxValue, row) => {
      const rowTime = Date.parse(row.createdAt);
      return Number.isFinite(rowTime) ? Math.max(maxValue, rowTime) : maxValue;
    }, 0);
  }, [rows]);

  const filteredBusinesses = useMemo(
    () =>
      rows.filter((item) =>
        active === "online"
          ? item.mode === "online" || item.mode === "hybrid"
          : item.mode === "offline" || item.mode === "hybrid",
      ),
    [active, rows],
  );

  const newBusinesses = useMemo(() => {
    const cutoff = newestCreatedAtMs - settings.newBusinessWindowDays * 24 * 60 * 60 * 1000;
    return rows.filter((item) => Date.parse(item.createdAt) >= cutoff).slice(0, 8);
  }, [newestCreatedAtMs, rows, settings.newBusinessWindowDays]);

  const recommendedBusinesses = useMemo(
    () => rows.filter((item) => Boolean(item.isRecommended)).slice(0, 8),
    [rows],
  );

  const streamBlocks = useMemo(() => {
    const blocks: Array<{ key: string; title: string; node: ReactNode }> = [];
    for (const moduleKey of settings.enabledModules) {
      if (moduleKey === "new_business_sidebar" && newBusinesses.length > 0) {
        blocks.push({
          key: moduleKey,
          title: "New businesses",
          node: (
            <div className="grid gap-2">
              {newBusinesses.map((item) => (
                <Link
                  key={item.id}
                  href={`/business/${item.slug}`}
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm transition hover:border-brand/40"
                >
                  {item.businessName} | {item.city}
                </Link>
              ))}
            </div>
          ),
        });
      }
      if (moduleKey === "recommended_business" && recommendedBusinesses.length > 0) {
        blocks.push({
          key: moduleKey,
          title: "Recommended by admin",
          node: (
            <div className="grid gap-2">
              {recommendedBusinesses.map((item) => (
                <Link
                  key={item.id}
                  href={`/business/${item.slug}`}
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm transition hover:border-brand/40"
                >
                  {item.businessName} | Trust {item.trustScore}
                </Link>
              ))}
            </div>
          ),
        });
      }
      if (moduleKey === "images_redirect" && settings.imageItems.length > 0) {
        blocks.push({
          key: moduleKey,
          title: "Image highlights",
          node: <MediaStrip rows={settings.imageItems} kind="image" />,
        });
      }
      if (moduleKey === "videos_url" && settings.videoItems.length > 0) {
        blocks.push({
          key: moduleKey,
          title: "Video highlights",
          node: <MediaStrip rows={settings.videoItems} kind="video" />,
        });
      }
    }
    return blocks;
  }, [newBusinesses, recommendedBusinesses, settings.enabledModules, settings.imageItems, settings.videoItems]);

  useEffect(() => {
    if (streamBlocks.length <= 1) return;
    const timer = window.setInterval(() => {
      setStreamIndex((index) => (index + 1) % streamBlocks.length);
    }, 4500);
    return () => {
      window.clearInterval(timer);
    };
  }, [streamBlocks.length]);

  const currentStreamIndex =
    streamBlocks.length > 0 ? streamIndex % streamBlocks.length : 0;

  return (
    <section className="space-y-6">
      {streamBlocks.length > 0 ? (
        <section className="rounded-3xl border border-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {streamBlocks[currentStreamIndex]?.title}
            </h2>
            {streamBlocks.length > 1 ? (
              <p className="text-xs text-muted">
                Auto-scroll {currentStreamIndex + 1}/{streamBlocks.length}
              </p>
            ) : null}
          </div>
          {streamBlocks[currentStreamIndex]?.node}
        </section>
      ) : null}

      <section className="rounded-3xl border border-border bg-white p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Listed businesses</h2>
            <p className="mt-1 text-sm text-muted">
              Showing up to {settings.businessLimit} records from admin-selected mode (
              {settings.businessMode}).
            </p>
          </div>
          <div className="rounded-xl border border-border p-1">
            {(["online", "offline"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActive(tab)}
                className={`rounded-lg px-3 py-2 text-sm capitalize transition ${
                  active === tab
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-accent"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {!filteredBusinesses.length ? (
            <article className="rounded-xl border border-border bg-surface p-4 text-sm text-muted md:col-span-2">
              No businesses available in this tab right now.
            </article>
          ) : null}
          {filteredBusinesses.map((business) => {
            const isNew =
              Date.parse(business.createdAt) >=
              newestCreatedAtMs - settings.newBusinessWindowDays * 24 * 60 * 60 * 1000;
            const offerings = offeringsByBusiness[business.id] ?? [];
            return (
              <article key={business.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{business.businessName}</h3>
                  <div className="flex items-center gap-1">
                    {business.isRecommended ? (
                      <span className="rounded-full bg-accent px-2 py-1 text-[11px] font-medium text-brand-strong">
                        Recommended
                      </span>
                    ) : null}
                    {isNew ? (
                      <span className="rounded-full bg-brand/10 px-2 py-1 text-[11px] font-medium text-brand-strong">
                        New
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {business.city}, {business.country} | {business.category}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Trust {business.trustScore} | {business.yearsInField} years
                </p>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted">Products and services</p>
                  {!offerings.length ? (
                    <p className="text-xs text-muted">No listed products/services yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {offerings.slice(0, 3).map((offering) => (
                        <Link
                          key={`${business.id}_${offering.kind}_${offering.id}`}
                          href={offering.href}
                          className="block rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
                        >
                          <span className="font-medium">
                            {offering.kind === "product" ? "Product" : "Service"}:{" "}
                            {offering.title}
                          </span>
                          <span className="text-muted"> | {offering.priceLabel}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href={`/business/${business.slug}`}
                  className="mt-3 inline-flex rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
                >
                  Open profile
                </Link>
              </article>
            );
          })}
        </div>
        <div className="mt-5">
          <Link
            href="/directory"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Explore full directory
          </Link>
        </div>
      </section>
    </section>
  );
}
