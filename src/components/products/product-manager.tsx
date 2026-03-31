"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessServiceDeliveryMode,
  BusinessServiceMode,
  BusinessServiceRecord,
  CatalogIntegrationProvider,
  CatalogIntegrationRecord,
  CatalogSyncRunRecord,
  createBusinessService,
  createDigitalProduct,
  DigitalProductPricingCycle,
  DigitalProductPricingPlanRecord,
  DigitalProductRecord,
  fetchCatalogIntegrationsByOwner,
  fetchCatalogSyncRunsByOwner,
  fetchBusinessServicesByOwner,
  fetchDigitalProductsByOwner,
  sendProductOfferToFavoriteCustomers,
  upsertCatalogIntegration,
} from "@/lib/firebase/repositories";

const schema = z.object({
  title: z.string().min(3, "Title is required."),
  category: z.string().min(2, "Category is required."),
  description: z.string().min(12, "Description should be at least 12 characters."),
  price: z.coerce.number().min(1, "Price must be greater than 0."),
  noRefund: z.boolean(),
});

type ProductInput = z.infer<typeof schema>;
type ProductFormInput = z.input<typeof schema>;
type ProductFormOutput = z.output<typeof schema>;

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function ProductManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<DigitalProductRecord[]>([]);
  const [serviceRows, setServiceRows] = useState<BusinessServiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offerProductId, setOfferProductId] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<DigitalProductPricingPlanRecord[]>([]);
  const [planName, setPlanName] = useState("");
  const [planCycle, setPlanCycle] = useState<DigitalProductPricingCycle>("one_time");
  const [planPrice, setPlanPrice] = useState("0");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [servicePrice, setServicePrice] = useState("0");
  const [serviceCurrency, setServiceCurrency] = useState<"INR" | "USD">("INR");
  const [serviceMode, setServiceMode] = useState<BusinessServiceMode>("online");
  const [serviceDeliveryMode, setServiceDeliveryMode] =
    useState<BusinessServiceDeliveryMode>("remote");
  const [serviceSubmitting, setServiceSubmitting] = useState(false);
  const [integrations, setIntegrations] = useState<CatalogIntegrationRecord[]>([]);
  const [syncRuns, setSyncRuns] = useState<CatalogSyncRunRecord[]>([]);
  const [integrationProvider, setIntegrationProvider] =
    useState<CatalogIntegrationProvider>("shopify");
  const [integrationLabel, setIntegrationLabel] = useState("");
  const [integrationStoreUrl, setIntegrationStoreUrl] = useState("");
  const [integrationSyncHours, setIntegrationSyncHours] = useState("24");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyVersion, setShopifyVersion] = useState("2024-10");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const [integrationBusy, setIntegrationBusy] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      noRefund: false,
    },
  });

  const loadProducts = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [products, services, integrationRows, runRows] = await Promise.all([
        fetchDigitalProductsByOwner(user.uid),
        fetchBusinessServicesByOwner(user.uid),
        fetchCatalogIntegrationsByOwner(user.uid),
        fetchCatalogSyncRunsByOwner(user.uid),
      ]);
      setRows(products);
      setServiceRows(services);
      setIntegrations(integrationRows);
      setSyncRuns(runRows.slice(0, 12));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load offerings.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!rows.length) {
      setOfferProductId("");
      return;
    }
    setOfferProductId((previous) => {
      if (previous && rows.some((row) => row.id === previous)) return previous;
      return rows[0].id;
    });
  }, [rows]);

  const onSubmit = async (value: ProductInput) => {
    if (!user) {
      setError("Please sign in first.");
      return;
    }

    if (!hasFirebaseConfig) {
      setError("Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* values.");
      return;
    }

    setError(null);
    setInfo(null);
    try {
      await createDigitalProduct({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title: value.title,
        description: value.description,
        price: value.price,
        noRefund: value.noRefund,
        category: value.category,
        pricingPlans: pricingPlans.length ? pricingPlans : undefined,
      });
      setInfo("Digital product created.");
      reset({ noRefund: false });
      setPricingPlans([]);
      setPlanName("");
      setPlanCycle("one_time");
      setPlanPrice("0");
      await loadProducts();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create product right now.",
      );
    }
  };

  async function onCreateService(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setError("Please sign in first.");
      return;
    }
    if (!hasFirebaseConfig) {
      setError("Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* values.");
      return;
    }
    const title = serviceTitle.trim();
    const category = serviceCategory.trim();
    const description = serviceDescription.trim();
    const price = Number(servicePrice);
    if (!title || !category || description.length < 12 || !Number.isFinite(price) || price <= 0) {
      setError("Service requires title, category, description, and valid price.");
      return;
    }

    setServiceSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await createBusinessService({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title,
        category,
        description,
        startingPrice: price,
        currency: serviceCurrency,
        serviceMode,
        deliveryMode: serviceDeliveryMode,
      });
      setInfo("Business service listed.");
      setServiceTitle("");
      setServiceCategory("");
      setServiceDescription("");
      setServicePrice("0");
      setServiceCurrency("INR");
      setServiceMode("online");
      setServiceDeliveryMode("remote");
      await loadProducts();
    } catch (serviceError) {
      setError(
        serviceError instanceof Error
          ? serviceError.message
          : "Unable to create service right now.",
      );
    } finally {
      setServiceSubmitting(false);
    }
  }

  function addPricingPlan() {
    const name = planName.trim();
    const price = Number(planPrice);
    if (!name || !Number.isFinite(price) || price <= 0) {
      setError("Pricing plan requires name and valid positive price.");
      return;
    }
    const key = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!key) {
      setError("Invalid pricing plan name.");
      return;
    }
    if (pricingPlans.some((row) => row.key === key)) {
      setError("Pricing plan with this name already exists.");
      return;
    }
    setError(null);
    setPricingPlans((previous) => [
      ...previous,
      {
        key,
        name,
        billingCycle: planCycle,
        price: Math.round(price),
      },
    ]);
    setPlanName("");
    setPlanCycle("one_time");
    setPlanPrice("0");
  }

  async function sendOffer(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setError("Please sign in first.");
      return;
    }
    if (!offerProductId) {
      setError("Select a product for the offer.");
      return;
    }
    if (!offerTitle.trim() || !offerMessage.trim()) {
      setError("Offer title and message are required.");
      return;
    }

    setOfferBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await sendProductOfferToFavoriteCustomers({
        productId: offerProductId,
        ownerUid: user.uid,
        title: offerTitle,
        message: offerMessage,
      });
      setInfo(
        result.totalFavorites > 0
          ? `Offer sent to ${result.delivered} favorite customer(s).`
          : "No favorite customers found for this product yet.",
      );
      setOfferTitle("");
      setOfferMessage("");
      await loadProducts();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send product offer.");
    } finally {
      setOfferBusy(false);
    }
  }

  async function testIntegrationConnection() {
    setIntegrationBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/catalog/integrations/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: integrationProvider,
          storeUrl: integrationStoreUrl,
          shopifyAccessToken: shopifyToken,
          shopifyApiVersion: shopifyVersion,
          wooConsumerKey: wooKey,
          wooConsumerSecret: wooSecret,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Integration test failed."));
      }
      const result = payload.result as Record<string, unknown>;
      setInfo(`Connection test successful. Fetched ${String(result.totalFetched ?? 0)} item(s).`);
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Unable to test integration connection.",
      );
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function saveIntegration() {
    if (!user) return;
    setIntegrationBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!integrationStoreUrl.trim()) {
        throw new Error("Store URL is required.");
      }
      if (integrationProvider === "shopify" && !shopifyToken.trim()) {
        throw new Error("Shopify access token is required.");
      }
      if (
        integrationProvider === "woocommerce" &&
        (!wooKey.trim() || !wooSecret.trim())
      ) {
        throw new Error("WooCommerce consumer key and secret are required.");
      }
      await upsertCatalogIntegration({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        provider: integrationProvider,
        label: integrationLabel || `${integrationProvider} catalog`,
        storeUrl: integrationStoreUrl,
        syncEveryHours: Number(integrationSyncHours),
        status: "active",
        shopifyAccessToken: integrationProvider === "shopify" ? shopifyToken : undefined,
        shopifyApiVersion: integrationProvider === "shopify" ? shopifyVersion : undefined,
        wooConsumerKey: integrationProvider === "woocommerce" ? wooKey : undefined,
        wooConsumerSecret: integrationProvider === "woocommerce" ? wooSecret : undefined,
      });
      setInfo("Integration saved. Auto sync will run every 24 hours via cron.");
      await loadProducts();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save integration.",
      );
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function syncIntegration(integrationId: string) {
    if (!user) return;
    setIntegrationBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/catalog/integrations/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ownerUid: user.uid,
          integrationId,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Sync failed."));
      }
      setInfo("Catalog sync completed.");
      await loadProducts();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync catalog.");
    } finally {
      setIntegrationBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Products and Services</h1>
        <p className="mt-2 text-sm text-muted">
          Manage sellable products/services, no-refund product tags, and public trust visibility.
        </p>
        <Link
          href="/dashboard/business/orders"
          className="mt-3 inline-flex rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
        >
          View sales and refunds
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create product</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm">Title</span>
            <input className={fieldClass} {...register("title")} />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </label>
          <label className="space-y-1">
            <span className="text-sm">Category</span>
            <input className={fieldClass} {...register("category")} />
            {errors.category && (
              <p className="text-xs text-danger">{errors.category.message}</p>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-sm">Price (INR)</span>
            <input type="number" className={fieldClass} {...register("price")} />
            {errors.price && <p className="text-xs text-danger">{errors.price.message}</p>}
          </label>
          <label className="flex items-center gap-2 text-sm md:pt-8">
            <input type="checkbox" {...register("noRefund")} />
            Mark as no-refund product
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Description</span>
            <textarea rows={4} className={fieldClass} {...register("description")} />
            {errors.description && (
              <p className="text-xs text-danger">{errors.description.message}</p>
            )}
          </label>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">Optional pricing plans</p>
          <p className="mt-1 text-xs text-muted">
            Add multiple plans (monthly/yearly/one-time). If none added, standard one-time plan uses base price.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input
              value={planName}
              onChange={(event) => setPlanName(event.target.value)}
              placeholder="Plan name"
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
            />
            <select
              value={planCycle}
              onChange={(event) => setPlanCycle(event.target.value as DigitalProductPricingCycle)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="one_time">One time</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <input
              type="number"
              value={planPrice}
              onChange={(event) => setPlanPrice(event.target.value)}
              placeholder="Price"
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={addPricingPlan}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Add plan
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!pricingPlans.length && (
              <span className="text-xs text-muted">No custom plans added yet.</span>
            )}
            {pricingPlans.map((plan) => (
              <span
                key={plan.key}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
              >
                {plan.name} | {plan.billingCycle} | INR {plan.price}
                <button
                  type="button"
                  onClick={() =>
                    setPricingPlans((previous) =>
                      previous.filter((row) => row.key !== plan.key),
                    )
                  }
                  className="text-danger"
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : "Create product"}
        </button>
      </form>

      <form onSubmit={onCreateService} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create service</h2>
        <p className="mt-1 text-xs text-muted">
          Publish offline/online services on your verified business profile.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm">Service title</span>
            <input
              value={serviceTitle}
              onChange={(event) => setServiceTitle(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Category</span>
            <input
              value={serviceCategory}
              onChange={(event) => setServiceCategory(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Starting price</span>
            <input
              type="number"
              value={servicePrice}
              onChange={(event) => setServicePrice(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Currency</span>
            <select
              value={serviceCurrency}
              onChange={(event) => setServiceCurrency(event.target.value as "INR" | "USD")}
              className={fieldClass}
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm">Service mode</span>
            <select
              value={serviceMode}
              onChange={(event) => setServiceMode(event.target.value as BusinessServiceMode)}
              className={fieldClass}
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm">Delivery</span>
            <select
              value={serviceDeliveryMode}
              onChange={(event) =>
                setServiceDeliveryMode(event.target.value as BusinessServiceDeliveryMode)
              }
              className={fieldClass}
            >
              <option value="remote">Remote</option>
              <option value="onsite">Onsite</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Description</span>
            <textarea
              rows={4}
              value={serviceDescription}
              onChange={(event) => setServiceDescription(event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={serviceSubmitting}
          className="mt-4 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {serviceSubmitting ? "Saving..." : "Create service"}
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Shopify and WooCommerce integration
        </h2>
        <p className="mt-1 text-xs text-muted">
          Connect store APIs, test connection, and auto-sync products/stock every 24 hours.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={integrationProvider}
            onChange={(event) => setIntegrationProvider(event.target.value as CatalogIntegrationProvider)}
            className={fieldClass}
          >
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce</option>
          </select>
          <input
            value={integrationLabel}
            onChange={(event) => setIntegrationLabel(event.target.value)}
            placeholder="Integration label"
            className={fieldClass}
          />
          <input
            value={integrationStoreUrl}
            onChange={(event) => setIntegrationStoreUrl(event.target.value)}
            placeholder="Store URL (https://example.com)"
            className={fieldClass}
          />
          <input
            type="number"
            value={integrationSyncHours}
            onChange={(event) => setIntegrationSyncHours(event.target.value)}
            placeholder="Sync every hours"
            className={fieldClass}
          />
          {integrationProvider === "shopify" ? (
            <>
              <input
                value={shopifyToken}
                onChange={(event) => setShopifyToken(event.target.value)}
                placeholder="Shopify access token"
                className={fieldClass}
              />
              <input
                value={shopifyVersion}
                onChange={(event) => setShopifyVersion(event.target.value)}
                placeholder="API version (2024-10)"
                className={fieldClass}
              />
            </>
          ) : (
            <>
              <input
                value={wooKey}
                onChange={(event) => setWooKey(event.target.value)}
                placeholder="Woo consumer key"
                className={fieldClass}
              />
              <input
                value={wooSecret}
                onChange={(event) => setWooSecret(event.target.value)}
                placeholder="Woo consumer secret"
                className={fieldClass}
              />
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void testIntegrationConnection()}
            disabled={integrationBusy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Test connection
          </button>
          <button
            type="button"
            onClick={() => void saveIntegration()}
            disabled={integrationBusy}
            className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Save integration
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {!integrations.length && (
            <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
              No integrations added yet.
            </p>
          )}
          {integrations.map((integration) => (
            <article key={integration.id} className="rounded-xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">
                {integration.label} | {integration.provider}
              </p>
              <p className="text-xs text-muted">{integration.storeUrl}</p>
              <p className="text-xs text-muted">
                Last sync: {integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString() : "Never"} |{" "}
                {integration.lastSyncStatus ?? "pending"}
              </p>
              <button
                type="button"
                onClick={() => void syncIntegration(integration.id)}
                disabled={integrationBusy}
                className="mt-2 rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40 disabled:opacity-70"
              >
                Sync now
              </button>
            </article>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Recent sync runs</p>
          <div className="mt-2 space-y-2">
            {!syncRuns.length && (
              <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
                No sync runs yet.
              </p>
            )}
            {syncRuns.map((row) => (
              <article key={row.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <p className="font-medium">
                  {row.provider} | {row.status} | trigger {row.trigger}
                </p>
                <p className="text-muted">
                  Products +{row.importedProducts}/{row.updatedProducts} | Services +{row.importedServices}/{row.updatedServices}
                </p>
                <p className="text-muted">{new Date(row.createdAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <form onSubmit={sendOffer} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Broadcast offer to favorites</h2>
        <p className="mt-1 text-xs text-muted">
          Send a targeted product offer notification to customers who favorited a product.
        </p>
        <div className="mt-4 grid gap-3">
          <select
            value={offerProductId}
            onChange={(event) => setOfferProductId(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            {!rows.length && <option value="">No products available</option>}
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title} ({row.favoritesCount} favorites)
              </option>
            ))}
          </select>
          <input
            value={offerTitle}
            onChange={(event) => setOfferTitle(event.target.value)}
            placeholder="Offer title"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={offerMessage}
            onChange={(event) => setOfferMessage(event.target.value)}
            rows={3}
            placeholder="Offer message for favorite customers"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={offerBusy || !rows.length}
          className="mt-4 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          {offerBusy ? "Sending..." : "Send offer broadcast"}
        </button>
      </form>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        {loading && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Loading offerings...
          </div>
        )}

        {!loading && !rows.length && !serviceRows.length && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No products/services created yet.
          </div>
        )}

        {rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{row.title}</h3>
              <span className="text-sm text-muted">INR {row.price}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {row.category} | Favorites {row.favoritesCount}
            </p>
            {typeof row.stockAvailable === "number" ? (
              <p className="mt-1 text-xs text-muted">Stock {row.stockAvailable}</p>
            ) : null}
            {row.noRefund && (
              <p className="mt-2 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
                No Refund
              </p>
            )}
            <p className="mt-2 text-xs text-muted">Product link key: {row.uniqueLinkSlug}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {row.pricingPlans.map((plan) => (
                <span key={`${row.id}_${plan.key}`} className="rounded-full border border-border px-2 py-1">
                  {plan.name} | {plan.billingCycle} | INR {plan.price}
                </span>
              ))}
            </div>
          </article>
        ))}

        {serviceRows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{row.title}</h3>
              <span className="text-sm text-muted">
                {row.currency} {row.startingPrice}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {row.category} | {row.serviceMode} | {row.deliveryMode}
            </p>
            {typeof row.stockAvailable === "number" ? (
              <p className="mt-1 text-xs text-muted">Stock {row.stockAvailable}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">Service link key: {row.uniqueLinkSlug}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

