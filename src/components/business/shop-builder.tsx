"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessServiceRecord,
  BusinessShopSettingsRecord,
  BusinessShopThemeKey,
  DigitalProductRecord,
  fetchBusinessServicesByOwner,
  fetchBusinessShopSettingsByOwner,
  fetchDigitalProductsByOwner,
  updateBusinessShopSettings,
} from "@/lib/firebase/repositories";

type ThemeCard = {
  key: BusinessShopThemeKey;
  name: string;
  description: string;
  palette: string;
};

const themeCards: ThemeCard[] = [
  {
    key: "clean_modern",
    name: "Clean Modern",
    description: "Bright SaaS-style layout for trusted business stores.",
    palette: "from-slate-50 via-white to-blue-50",
  },
  {
    key: "classic_store",
    name: "Classic Store",
    description: "Traditional catalog style for product-heavy shops.",
    palette: "from-amber-50 via-orange-50 to-rose-50",
  },
  {
    key: "midnight_premium",
    name: "Midnight Premium",
    description: "Dark premium storefront for high-ticket services.",
    palette: "from-slate-900 via-slate-800 to-indigo-900",
  },
  {
    key: "sunrise_market",
    name: "Sunrise Market",
    description: "Warm marketplace style for hybrid online/offline sellers.",
    palette: "from-orange-100 via-yellow-50 to-emerald-100",
  },
  {
    key: "minimal_grid",
    name: "Minimal Grid",
    description: "Simple neutral layout focused on product conversion.",
    palette: "from-zinc-100 via-white to-zinc-200",
  },
];

const toggleFields: Array<{
  key:
    | "allowGuestCheckout"
    | "autoAcceptOrders"
    | "enableCod"
    | "enableWallet"
    | "publishProducts"
    | "publishServices"
    | "showStock"
    | "showTrustBadge";
  label: string;
}> = [
  { key: "allowGuestCheckout", label: "Allow guest checkout" },
  { key: "autoAcceptOrders", label: "Auto-accept orders" },
  { key: "enableCod", label: "Enable cash on delivery" },
  { key: "enableWallet", label: "Enable wallet payments" },
  { key: "publishProducts", label: "Publish products on storefront" },
  { key: "publishServices", label: "Publish services on storefront" },
  { key: "showStock", label: "Show stock publicly" },
  { key: "showTrustBadge", label: "Show trust badge and score" },
];

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function ShopBuilder() {
  const { user, hasFirebaseConfig } = useAuth();
  const [settings, setSettings] = useState<BusinessShopSettingsRecord | null>(null);
  const [products, setProducts] = useState<DigitalProductRecord[]>([]);
  const [services, setServices] = useState<BusinessServiceRecord[]>([]);
  const [seoKeywordsText, setSeoKeywordsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [shopSettings, productRows, serviceRows] = await Promise.all([
        fetchBusinessShopSettingsByOwner(user.uid),
        fetchDigitalProductsByOwner(user.uid),
        fetchBusinessServicesByOwner(user.uid),
      ]);
      setSettings(shopSettings);
      setProducts(productRows);
      setServices(serviceRows);
      setSeoKeywordsText(shopSettings.seoKeywords.join(", "));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load shop builder settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const storefrontUrl = useMemo(() => {
    if (!settings) return null;
    return `/business/${settings.businessSlug}`;
  }, [settings]);

  function setSetting<Key extends keyof BusinessShopSettingsRecord>(
    key: Key,
    value: BusinessShopSettingsRecord[Key],
  ) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !settings) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateBusinessShopSettings({
        ownerUid: user.uid,
        settings: {
          storeTitle: settings.storeTitle,
          storeTagline: settings.storeTagline,
          storeDescription: settings.storeDescription,
          supportEmail: settings.supportEmail,
          supportPhone: settings.supportPhone,
          currencyMode: settings.currencyMode,
          themeKey: settings.themeKey,
          themeAccent: settings.themeAccent,
          customDomain: settings.customDomain,
          seoTitle: settings.seoTitle,
          seoDescription: settings.seoDescription,
          seoKeywords: seoKeywordsText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          allowGuestCheckout: settings.allowGuestCheckout,
          autoAcceptOrders: settings.autoAcceptOrders,
          enableCod: settings.enableCod,
          enableWallet: settings.enableWallet,
          publishProducts: settings.publishProducts,
          publishServices: settings.publishServices,
          showStock: settings.showStock,
          showTrustBadge: settings.showTrustBadge,
          lowStockThreshold: settings.lowStockThreshold,
          orderNotificationEmail: settings.orderNotificationEmail,
          shippingPolicy: settings.shippingPolicy,
          returnPolicy: settings.returnPolicy,
        },
        publishNow: true,
      });
      setSettings(updated);
      setSeoKeywordsText(updated.seoKeywords.join(", "));
      setInfo("Shop settings saved and published.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save shop settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing. Add `NEXT_PUBLIC_FIREBASE_*` values first.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading shop builder...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Shop settings unavailable. Complete business onboarding first.
      </div>
    );
  }

  return (
    <div id="shop-builder" className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Shop Website Builder</h1>
        <p className="mt-2 text-sm text-muted">
          Build your own business storefront with themes, SEO, custom domain setup,
          and order settings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {storefrontUrl && (
            <Link
              href={storefrontUrl}
              className="rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-strong"
            >
              Open storefront
            </Link>
          )}
          <Link
            href="/dashboard/business/products"
            className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
          >
            Manage products/services
          </Link>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Choose a theme</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {themeCards.map((theme) => (
            <button
              key={theme.key}
              type="button"
              onClick={() => setSetting("themeKey", theme.key)}
              className={`rounded-2xl border p-3 text-left transition ${
                settings.themeKey === theme.key
                  ? "border-brand bg-brand/5"
                  : "border-border hover:border-brand/40"
              }`}
            >
              <div className={`h-20 rounded-xl bg-gradient-to-br ${theme.palette}`} />
              <p className="mt-3 text-sm font-semibold">{theme.name}</p>
              <p className="mt-1 text-xs text-muted">{theme.description}</p>
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={save} className="space-y-4">
        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Store profile</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm">Store title</span>
              <input
                value={settings.storeTitle}
                onChange={(event) => setSetting("storeTitle", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Store tagline</span>
              <input
                value={settings.storeTagline}
                onChange={(event) => setSetting("storeTagline", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Store description</span>
              <textarea
                rows={3}
                value={settings.storeDescription}
                onChange={(event) => setSetting("storeDescription", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Support email</span>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(event) => setSetting("supportEmail", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Support phone</span>
              <input
                value={settings.supportPhone}
                onChange={(event) => setSetting("supportPhone", event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
        </section>

        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Domain and SEO</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm">Custom domain</span>
              <input
                value={settings.customDomain}
                onChange={(event) => setSetting("customDomain", event.target.value)}
                className={fieldClass}
                placeholder="shop.yourdomain.com"
              />
              <span className="text-xs text-muted">
                Status: {settings.customDomainStatus}
              </span>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Theme accent color</span>
              <input
                type="color"
                value={settings.themeAccent}
                onChange={(event) => setSetting("themeAccent", event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-2 py-1"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">SEO title</span>
              <input
                value={settings.seoTitle}
                onChange={(event) => setSetting("seoTitle", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">SEO description</span>
              <textarea
                rows={2}
                value={settings.seoDescription}
                onChange={(event) => setSetting("seoDescription", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">SEO keywords (comma separated)</span>
              <input
                value={seoKeywordsText}
                onChange={(event) => setSeoKeywordsText(event.target.value)}
                className={fieldClass}
                placeholder="verified business, digital store, secure shopping"
              />
            </label>
          </div>
        </section>

        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Orders and checkout</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {toggleFields.map((row) => (
              <label
                key={row.key}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={settings[row.key]}
                  onChange={(event) => setSetting(row.key, event.target.checked)}
                />
                {row.label}
              </label>
            ))}
            <label className="space-y-1">
              <span className="text-sm">Currency mode</span>
              <select
                value={settings.currencyMode}
                onChange={(event) =>
                  setSetting("currencyMode", event.target.value as BusinessShopSettingsRecord["currencyMode"])
                }
                className={fieldClass}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="BOTH">INR + USD</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Low stock alert threshold</span>
              <input
                type="number"
                min={0}
                value={settings.lowStockThreshold}
                onChange={(event) =>
                  setSetting("lowStockThreshold", Number(event.target.value) || 0)
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Order notification email</span>
              <input
                type="email"
                value={settings.orderNotificationEmail}
                onChange={(event) =>
                  setSetting("orderNotificationEmail", event.target.value)
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Shipping policy</span>
              <textarea
                rows={2}
                value={settings.shippingPolicy}
                onChange={(event) => setSetting("shippingPolicy", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Return policy</span>
              <textarea
                rows={2}
                value={settings.returnPolicy}
                onChange={(event) => setSetting("returnPolicy", event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-muted">
            Variable product pricing is managed from Products and Services using pricing plans.
          </p>
        </section>

        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Catalog status</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              Products ready: <b>{products.length}</b>
            </p>
            <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              Services ready: <b>{services.length}</b>
            </p>
          </div>
        </section>

        {info && (
          <p className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">
            {info}
          </p>
        )}
        {error && (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {busy ? "Saving..." : "Save shop settings"}
        </button>
      </form>
    </div>
  );
}
