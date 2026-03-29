"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  fetchHomePageShowcase,
  HomeMediaItemRecord,
  HomePageSettingsRecord,
} from "@/lib/firebase/repositories";

type HomeShowcaseData = Awaited<ReturnType<typeof fetchHomePageShowcase>>;

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

export function HomeBusinessShowcase() {
  const [active, setActive] = useState<"online" | "offline">("online");
  const [data, setData] = useState<HomeShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamIndex, setStreamIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchHomePageShowcase();
        if (isMounted) setData(row);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load home listings.",
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const settings = useMemo<HomePageSettingsRecord | null>(
    () => data?.settings ?? null,
    [data],
  );
  const rows = useMemo(() => data?.businesses ?? [], [data]);

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
    if (!settings) return [];
    const cutoff = Date.now() - settings.newBusinessWindowDays * 24 * 60 * 60 * 1000;
    return rows.filter((item) => Date.parse(item.createdAt) >= cutoff).slice(0, 8);
  }, [rows, settings]);

  const recommendedBusinesses = useMemo(
    () => rows.filter((item) => Boolean(item.isRecommended)).slice(0, 8),
    [rows],
  );

  const streamBlocks = useMemo(() => {
    if (!settings) return [] as Array<{ key: string; title: string; node: ReactNode }>;
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
  }, [newBusinesses, recommendedBusinesses, settings]);

  useEffect(() => {
    if (streamBlocks.length <= 1) return;
    const timer = window.setInterval(() => {
      setStreamIndex((index) => (index + 1) % streamBlocks.length);
    }, 4500);
    return () => {
      window.clearInterval(timer);
    };
  }, [streamBlocks.length]);

  useEffect(() => {
    setStreamIndex(0);
  }, [streamBlocks.length]);

  return (
    <section className="space-y-6">
      {loading ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading home data...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!loading && !error && streamBlocks.length > 0 ? (
        <section className="rounded-3xl border border-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {streamBlocks[streamIndex]?.title}
            </h2>
            {streamBlocks.length > 1 ? (
              <p className="text-xs text-muted">
                Auto-scroll {streamIndex + 1}/{streamBlocks.length}
              </p>
            ) : null}
          </div>
          {streamBlocks[streamIndex]?.node}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="rounded-3xl border border-border bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Listed businesses</h2>
              <p className="mt-1 text-sm text-muted">
                Showing up to {settings?.businessLimit ?? 20} records from admin-selected
                mode ({settings?.businessMode ?? "both"}).
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
                settings &&
                Date.parse(business.createdAt) >=
                  Date.now() - settings.newBusinessWindowDays * 24 * 60 * 60 * 1000;
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
      ) : null}
    </section>
  );
}
