"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  AbandonedCheckoutRecord,
  DigitalProductRecord,
  fetchAbandonedCheckoutsByBusinessOwner,
  fetchBusinessServicesByOwner,
  fetchDigitalProductsByOwner,
  fetchShopCouponsByOwner,
  fetchShopInventoryLogsByOwner,
  fetchShopShippingZonesByOwner,
  fetchShopTaxRulesByOwner,
  removeShopCoupon,
  removeShopShippingZone,
  removeShopTaxRule,
  ShopCouponRecord,
  ShopInventoryLogRecord,
  ShopShippingZoneRecord,
  ShopTaxRuleRecord,
  upsertShopCoupon,
  upsertShopShippingZone,
  upsertShopTaxRule,
  updateShopInventoryStock,
} from "@/lib/firebase/repositories";

type ServiceLite = { id: string; title: string; stockAvailable?: number };

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function ShopCommerceControls() {
  const { user, hasFirebaseConfig } = useAuth();
  const [coupons, setCoupons] = useState<ShopCouponRecord[]>([]);
  const [taxRules, setTaxRules] = useState<ShopTaxRuleRecord[]>([]);
  const [shippingZones, setShippingZones] = useState<ShopShippingZoneRecord[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<ShopInventoryLogRecord[]>([]);
  const [abandonedRows, setAbandonedRows] = useState<AbandonedCheckoutRecord[]>([]);
  const [products, setProducts] = useState<DigitalProductRecord[]>([]);
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponLabel, setCouponLabel] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("10");
  const [couponMinOrder, setCouponMinOrder] = useState("0");
  const [couponMaxDiscount, setCouponMaxDiscount] = useState("");
  const [couponUsageLimit, setCouponUsageLimit] = useState("");
  const [couponStartsAt, setCouponStartsAt] = useState("");
  const [couponEndsAt, setCouponEndsAt] = useState("");

  const [taxLabel, setTaxLabel] = useState("Default tax");
  const [taxScope, setTaxScope] = useState<"global" | "country" | "city">("global");
  const [taxCountry, setTaxCountry] = useState("");
  const [taxCity, setTaxCity] = useState("");
  const [taxRate, setTaxRate] = useState("18");

  const [shippingLabel, setShippingLabel] = useState("Standard shipping");
  const [shippingCountries, setShippingCountries] = useState("");
  const [shippingCities, setShippingCities] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [shippingFreeAbove, setShippingFreeAbove] = useState("");

  const [stockItemType, setStockItemType] = useState<"product" | "service">("product");
  const [stockItemId, setStockItemId] = useState("");
  const [stockNextValue, setStockNextValue] = useState("0");
  const [stockNote, setStockNote] = useState("");

  const stockItems = useMemo(
    () =>
      stockItemType === "product"
        ? products.map((row) => ({ id: row.id, title: row.title, stockAvailable: row.stockAvailable }))
        : services,
    [products, services, stockItemType],
  );

  useEffect(() => {
    if (!stockItems.length) {
      setStockItemId("");
      return;
    }
    setStockItemId((previous) =>
      previous && stockItems.some((row) => row.id === previous) ? previous : stockItems[0].id,
    );
  }, [stockItems]);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [couponRows, taxRows, shippingRows, logRows, abandoned, productRows, serviceRows] =
        await Promise.all([
          fetchShopCouponsByOwner(user.uid),
          fetchShopTaxRulesByOwner(user.uid),
          fetchShopShippingZonesByOwner(user.uid),
          fetchShopInventoryLogsByOwner(user.uid, 120),
          fetchAbandonedCheckoutsByBusinessOwner(user.uid, 120),
          fetchDigitalProductsByOwner(user.uid),
          fetchBusinessServicesByOwner(user.uid),
        ]);
      setCoupons(couponRows);
      setTaxRules(taxRows);
      setShippingZones(shippingRows);
      setInventoryLogs(logRows);
      setAbandonedRows(abandoned);
      setProducts(productRows);
      setServices(serviceRows.map((row) => ({ id: row.id, title: row.title, stockAvailable: row.stockAvailable })));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load advanced shop controls.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCoupon(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await upsertShopCoupon({
        ownerUid: user.uid,
        coupon: {
          code: couponCode,
          label: couponLabel || couponCode,
          discountType: couponType,
          discountValue: Number(couponValue),
          minOrderAmountInr: Number(couponMinOrder),
          maxDiscountAmountInr: couponMaxDiscount ? Number(couponMaxDiscount) : undefined,
          usageLimitTotal: couponUsageLimit ? Number(couponUsageLimit) : undefined,
          appliesToPlanKeys: [],
          startsAt: couponStartsAt || undefined,
          endsAt: couponEndsAt || undefined,
          active: true,
        },
      });
      setInfo("Coupon saved.");
      setCouponCode("");
      setCouponLabel("");
      setCouponValue("10");
      setCouponMinOrder("0");
      setCouponMaxDiscount("");
      setCouponUsageLimit("");
      setCouponStartsAt("");
      setCouponEndsAt("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save coupon.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTaxRule(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await upsertShopTaxRule({
        ownerUid: user.uid,
        taxRule: {
          label: taxLabel,
          scope: taxScope,
          countryCode: taxScope === "country" || taxScope === "city" ? taxCountry : undefined,
          city: taxScope === "city" ? taxCity : undefined,
          ratePercent: Number(taxRate),
          active: true,
        },
      });
      setInfo("Tax rule saved.");
      setTaxLabel("Default tax");
      setTaxScope("global");
      setTaxCountry("");
      setTaxCity("");
      setTaxRate("18");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save tax rule.");
    } finally {
      setBusy(false);
    }
  }

  async function saveShippingZone(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await upsertShopShippingZone({
        ownerUid: user.uid,
        shippingZone: {
          label: shippingLabel,
          countries: shippingCountries
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          cities: shippingCities
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          feeInr: Number(shippingFee),
          freeShippingMinOrderInr: shippingFreeAbove ? Number(shippingFreeAbove) : undefined,
          active: true,
        },
      });
      setInfo("Shipping zone saved.");
      setShippingLabel("Standard shipping");
      setShippingCountries("");
      setShippingCities("");
      setShippingFee("0");
      setShippingFreeAbove("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save shipping zone.");
    } finally {
      setBusy(false);
    }
  }

  async function adjustStock(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!stockItemId) {
      setError("Select item to update stock.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateShopInventoryStock({
        ownerUid: user.uid,
        itemType: stockItemType,
        itemId: stockItemId,
        nextStock: Number(stockNextValue),
        note: stockNote || undefined,
      });
      setInfo("Stock updated.");
      setStockNextValue("0");
      setStockNote("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update stock.");
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

  return (
    <section id="commerce-engine" className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h2 className="text-xl font-semibold tracking-tight">Advanced Commerce Engine</h2>
        <p className="mt-1 text-xs text-muted">
          Configure coupons, tax, shipping, stock audit logs, and abandoned checkout recovery.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={saveCoupon} className="glass rounded-3xl p-6 space-y-3">
          <h3 className="text-sm font-semibold">Coupons</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="Code"
              className={fieldClass}
            />
            <input
              value={couponLabel}
              onChange={(event) => setCouponLabel(event.target.value)}
              placeholder="Label"
              className={fieldClass}
            />
            <select
              value={couponType}
              onChange={(event) => setCouponType(event.target.value as "percent" | "fixed")}
              className={fieldClass}
            >
              <option value="percent">Percent discount</option>
              <option value="fixed">Fixed discount (INR)</option>
            </select>
            <input
              value={couponValue}
              onChange={(event) => setCouponValue(event.target.value)}
              type="number"
              min={0}
              placeholder="Discount value"
              className={fieldClass}
            />
            <input
              value={couponMinOrder}
              onChange={(event) => setCouponMinOrder(event.target.value)}
              type="number"
              min={0}
              placeholder="Minimum order INR"
              className={fieldClass}
            />
            <input
              value={couponMaxDiscount}
              onChange={(event) => setCouponMaxDiscount(event.target.value)}
              type="number"
              min={0}
              placeholder="Max discount INR (optional)"
              className={fieldClass}
            />
            <input
              value={couponUsageLimit}
              onChange={(event) => setCouponUsageLimit(event.target.value)}
              type="number"
              min={0}
              placeholder="Usage limit total (optional)"
              className={fieldClass}
            />
            <input
              value={couponStartsAt}
              onChange={(event) => setCouponStartsAt(event.target.value)}
              type="datetime-local"
              className={fieldClass}
            />
            <input
              value={couponEndsAt}
              onChange={(event) => setCouponEndsAt(event.target.value)}
              type="datetime-local"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Save coupon
          </button>
          <div className="space-y-2">
            {coupons.slice(0, 8).map((coupon) => (
              <div key={coupon.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <p className="font-semibold">
                  {coupon.code} | {coupon.discountType === "percent" ? `${coupon.discountValue}%` : `INR ${coupon.discountValue}`}
                </p>
                <p className="text-muted">
                  Used {coupon.usedCount}
                  {coupon.usageLimitTotal ? `/${coupon.usageLimitTotal}` : ""} | Min order INR {coupon.minOrderAmountInr}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void upsertShopCoupon({
                        ownerUid: user?.uid ?? "",
                        couponId: coupon.id,
                        coupon: { ...coupon, code: coupon.code, label: coupon.label, active: !coupon.active },
                      }).then(load)
                    }
                    className="rounded-lg border border-border px-2 py-1"
                  >
                    {coupon.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) return;
                      void removeShopCoupon({ ownerUid: user.uid, couponId: coupon.id }).then(load);
                    }}
                    className="rounded-lg border border-danger/40 px-2 py-1 text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!coupons.length && (
              <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
                No coupons created yet.
              </p>
            )}
          </div>
        </form>

        <form onSubmit={saveTaxRule} className="glass rounded-3xl p-6 space-y-3">
          <h3 className="text-sm font-semibold">Tax Rules</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={taxLabel}
              onChange={(event) => setTaxLabel(event.target.value)}
              placeholder="Rule label"
              className={fieldClass}
            />
            <select
              value={taxScope}
              onChange={(event) => setTaxScope(event.target.value as "global" | "country" | "city")}
              className={fieldClass}
            >
              <option value="global">Global</option>
              <option value="country">Country</option>
              <option value="city">City</option>
            </select>
            {(taxScope === "country" || taxScope === "city") && (
              <input
                value={taxCountry}
                onChange={(event) => setTaxCountry(event.target.value.toUpperCase())}
                placeholder="Country code"
                className={fieldClass}
              />
            )}
            {taxScope === "city" && (
              <input
                value={taxCity}
                onChange={(event) => setTaxCity(event.target.value)}
                placeholder="City"
                className={fieldClass}
              />
            )}
            <input
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              type="number"
              min={0}
              step="0.01"
              placeholder="Tax %"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Save tax rule
          </button>
          <div className="space-y-2">
            {taxRules.slice(0, 8).map((rule) => (
              <div key={rule.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <p className="font-semibold">
                  {rule.label} | {rule.ratePercent}% | {rule.scope}
                </p>
                <p className="text-muted">
                  {rule.countryCode || "-"} {rule.city || ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void upsertShopTaxRule({
                        ownerUid: user?.uid ?? "",
                        taxRuleId: rule.id,
                        taxRule: { ...rule, active: !rule.active },
                      }).then(load)
                    }
                    className="rounded-lg border border-border px-2 py-1"
                  >
                    {rule.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) return;
                      void removeShopTaxRule({ ownerUid: user.uid, taxRuleId: rule.id }).then(load);
                    }}
                    className="rounded-lg border border-danger/40 px-2 py-1 text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!taxRules.length && (
              <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
                No tax rules configured.
              </p>
            )}
          </div>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={saveShippingZone} className="glass rounded-3xl p-6 space-y-3">
          <h3 className="text-sm font-semibold">Shipping Zones</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={shippingLabel}
              onChange={(event) => setShippingLabel(event.target.value)}
              placeholder="Zone label"
              className={fieldClass}
            />
            <input
              value={shippingFee}
              onChange={(event) => setShippingFee(event.target.value)}
              type="number"
              min={0}
              placeholder="Shipping fee INR"
              className={fieldClass}
            />
            <input
              value={shippingCountries}
              onChange={(event) => setShippingCountries(event.target.value)}
              placeholder="Countries (comma-separated)"
              className={fieldClass}
            />
            <input
              value={shippingCities}
              onChange={(event) => setShippingCities(event.target.value)}
              placeholder="Cities (comma-separated)"
              className={fieldClass}
            />
            <input
              value={shippingFreeAbove}
              onChange={(event) => setShippingFreeAbove(event.target.value)}
              type="number"
              min={0}
              placeholder="Free shipping above INR"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Save shipping zone
          </button>
          <div className="space-y-2">
            {shippingZones.slice(0, 8).map((zone) => (
              <div key={zone.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <p className="font-semibold">
                  {zone.label} | INR {zone.feeInr}
                </p>
                <p className="text-muted">
                  Countries {zone.countries.length ? zone.countries.join(", ") : "all"} | Cities{" "}
                  {zone.cities.length ? zone.cities.join(", ") : "all"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void upsertShopShippingZone({
                        ownerUid: user?.uid ?? "",
                        shippingZoneId: zone.id,
                        shippingZone: { ...zone, active: !zone.active },
                      }).then(load)
                    }
                    className="rounded-lg border border-border px-2 py-1"
                  >
                    {zone.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) return;
                      void removeShopShippingZone({ ownerUid: user.uid, shippingZoneId: zone.id }).then(load);
                    }}
                    className="rounded-lg border border-danger/40 px-2 py-1 text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!shippingZones.length && (
              <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
                No shipping zones configured.
              </p>
            )}
          </div>
        </form>

        <form onSubmit={adjustStock} className="glass rounded-3xl p-6 space-y-3">
          <h3 className="text-sm font-semibold">Inventory Adjustment</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={stockItemType}
              onChange={(event) => setStockItemType(event.target.value as "product" | "service")}
              className={fieldClass}
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
            <select
              value={stockItemId}
              onChange={(event) => setStockItemId(event.target.value)}
              className={fieldClass}
            >
              {!stockItems.length && <option value="">No items available</option>}
              {stockItems.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} | stock {row.stockAvailable ?? 0}
                </option>
              ))}
            </select>
            <input
              value={stockNextValue}
              onChange={(event) => setStockNextValue(event.target.value)}
              type="number"
              min={0}
              placeholder="Next stock"
              className={fieldClass}
            />
            <input
              value={stockNote}
              onChange={(event) => setStockNote(event.target.value)}
              placeholder="Reason / note"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !stockItems.length}
            className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Update stock
          </button>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {inventoryLogs.slice(0, 16).map((log) => (
              <div key={log.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <p className="font-semibold">
                  {log.itemType} | {log.itemTitle}
                </p>
                <p className="text-muted">
                  {log.previousStock ?? "-"} {"->"} {log.nextStock ?? "-"} ({log.change ?? 0})
                </p>
                <p className="text-muted">{new Date(log.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {!inventoryLogs.length && (
              <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
                No inventory logs yet.
              </p>
            )}
          </div>
        </form>
      </div>

      <div className="glass rounded-3xl p-6">
        <h3 className="text-sm font-semibold">Abandoned Checkout Recovery</h3>
        <p className="mt-1 text-xs text-muted">
          Open checkouts can be retargeted manually with offers or support outreach.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {loading && (
            <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
              Loading checkout recovery data...
            </p>
          )}
          {!loading && !abandonedRows.length && (
            <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
              No checkout sessions found yet.
            </p>
          )}
          {abandonedRows.slice(0, 12).map((row) => (
            <article key={row.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
              <p className="font-semibold">{row.productTitle}</p>
              <p className="text-muted">
                {row.ownerEmail} | {row.status} | INR {row.pricingBreakdown.finalAmountInr}
              </p>
              <p className="text-muted">{new Date(row.createdAt).toLocaleString()}</p>
              {row.pricingBreakdown.appliedCouponCode && (
                <p className="text-muted">Coupon {row.pricingBreakdown.appliedCouponCode}</p>
              )}
            </article>
          ))}
        </div>
      </div>

      {info && (
        <p className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</p>
      )}
      {error && (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
