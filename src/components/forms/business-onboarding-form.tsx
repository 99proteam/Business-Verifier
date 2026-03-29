"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createBusinessApplication,
  fetchGeoCatalogCitiesByCountry,
  fetchGeoCatalogCountries,
} from "@/lib/firebase/repositories";

const businessSchema = z
  .object({
    businessName: z.string().min(2, "Business name is required."),
    mode: z.enum(["online", "offline", "hybrid"]),
    stage: z.enum(["idea", "running"]),
    category: z.string().min(2, "Category is required."),
    yearsInField: z.coerce.number().min(0).max(90),
    supportEmail: z.email("Enter a valid support email."),
    supportPhone: z.string().min(8, "Enter a valid mobile/contact number."),
    address: z.string().min(6, "Business address is required."),
    city: z.string().min(2, "City is required."),
    country: z.string().min(2, "Country is required."),
    website: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (value) => {
          if (!value) return true;
          return /^https?:\/\/.+/i.test(value);
        },
        { message: "Website must start with http:// or https://" },
      ),
    bankAccountLast4: z
      .string()
      .regex(/^\d{4}$/, "Enter only the last 4 digits of bank account."),
    publicDocumentsSummary: z
      .string()
      .min(12, "List the public verification documents."),
    lookingForPartnership: z.boolean(),
    partnershipCategory: z.string().optional(),
    partnershipAmountMin: z.coerce.number().optional(),
    partnershipAmountMax: z.coerce.number().optional(),
    wantsProPlan: z.boolean(),
    proDepositAmount: z.coerce.number().optional(),
    proDepositLockMonths: z.coerce.number().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.lookingForPartnership && !value.partnershipCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Partnership category is required when partnership is enabled.",
        path: ["partnershipCategory"],
      });
    }

    if (
      value.lookingForPartnership &&
      value.partnershipAmountMin &&
      value.partnershipAmountMax &&
      value.partnershipAmountMin > value.partnershipAmountMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Max partnership amount must be greater than min amount.",
        path: ["partnershipAmountMax"],
      });
    }

    if (value.wantsProPlan && (!value.proDepositAmount || value.proDepositAmount <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a deposit amount to continue with Pro verification.",
        path: ["proDepositAmount"],
      });
    }
    if (
      value.wantsProPlan &&
      value.proDepositLockMonths &&
      (value.proDepositLockMonths < 1 || value.proDepositLockMonths > 60)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deposit lock months must be between 1 and 60.",
        path: ["proDepositLockMonths"],
      });
    }
  });

type BusinessInput = z.infer<typeof businessSchema>;
type BusinessFormInput = z.input<typeof businessSchema>;
type BusinessFormOutput = z.output<typeof businessSchema>;

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function BusinessOnboardingForm() {
  const { user, hasFirebaseConfig } = useAuth();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<BusinessInput | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [countryCities, setCountryCities] = useState<string[]>([]);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BusinessFormInput, unknown, BusinessFormOutput>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      mode: "online",
      stage: "running",
      yearsInField: 0,
      lookingForPartnership: false,
      wantsProPlan: false,
      proDepositLockMonths: 6,
    },
  });

  const lookingForPartnership = useWatch({
    control,
    name: "lookingForPartnership",
  });
  const wantsProPlan = useWatch({
    control,
    name: "wantsProPlan",
  });
  const selectedCountry = useWatch({
    control,
    name: "country",
  });
  const cityOptions = useMemo(
    () => (selectedCountry ? countryCities : []),
    [countryCities, selectedCountry],
  );

  useEffect(() => {
    let active = true;
    async function loadCountries() {
      try {
        const rows = await fetchGeoCatalogCountries();
        if (active) setCountries(rows);
      } catch {
        if (active) setCountries([]);
      }
    }
    void loadCountries();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCities() {
      if (!selectedCountry) {
        setCountryCities([]);
        return;
      }
      try {
        const rows = await fetchGeoCatalogCitiesByCountry(selectedCountry);
        if (active) setCountryCities(rows);
      } catch {
        if (active) setCountryCities([]);
      }
    }
    void loadCities();
    return () => {
      active = false;
    };
  }, [selectedCountry]);

  const onSubmit = async (data: BusinessInput) => {
    if (!user) {
      setSubmissionError("Please sign in with Gmail first.");
      return;
    }

    if (!hasFirebaseConfig) {
      setSubmissionError("Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* values.");
      return;
    }

    setSubmissionError(null);
    try {
      const id = await createBusinessApplication(user.uid, data);
      setApplicationId(id);
      setSubmitted(data);
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to save application right now.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="glass rounded-3xl p-6 md:p-8"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Business Verification Onboarding</h1>
        <p className="mt-1 text-sm text-muted">
          Submit mandatory details. This now saves into Firestore and appears in admin
          verification queue.
        </p>

        {!hasFirebaseConfig && (
          <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            Firebase environment variables are missing. Configure `.env.local` first.
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm">Business name</span>
            <input className={fieldClass} {...register("businessName")} />
            {errors.businessName && (
              <p className="text-xs text-danger">{errors.businessName.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">Category</span>
            <input className={fieldClass} {...register("category")} />
            {errors.category && (
              <p className="text-xs text-danger">{errors.category.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">Business type</span>
            <select className={fieldClass} {...register("mode")}>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm">Business stage</span>
            <select className={fieldClass} {...register("stage")}>
              <option value="idea">Idea stage</option>
              <option value="running">Running stage</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm">Years in field</span>
            <input type="number" className={fieldClass} {...register("yearsInField")} />
          </label>

          <label className="space-y-1">
            <span className="text-sm">Support email</span>
            <input className={fieldClass} {...register("supportEmail")} />
            {errors.supportEmail && (
              <p className="text-xs text-danger">{errors.supportEmail.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">Support mobile</span>
            <input className={fieldClass} {...register("supportPhone")} />
            {errors.supportPhone && (
              <p className="text-xs text-danger">{errors.supportPhone.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">Website</span>
            <input
              placeholder="https://yourbusiness.com"
              className={fieldClass}
              {...register("website")}
            />
            {errors.website && (
              <p className="text-xs text-danger">{errors.website.message}</p>
            )}
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Business address</span>
            <input className={fieldClass} {...register("address")} />
            {errors.address && (
              <p className="text-xs text-danger">{errors.address.message}</p>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm">City</span>
            <input
              list="city-options"
              className={fieldClass}
              {...register("city")}
              placeholder="Select or type city"
            />
            <datalist id="city-options">
              {cityOptions.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1">
            <span className="text-sm">Country</span>
            <select className={fieldClass} {...register("country")}>
              <option value="">Select country</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm">Bank account last 4 digits</span>
            <input maxLength={4} className={fieldClass} {...register("bankAccountLast4")} />
            {errors.bankAccountLast4 && (
              <p className="text-xs text-danger">{errors.bankAccountLast4.message}</p>
            )}
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Public verification documents summary</span>
            <textarea
              rows={3}
              className={fieldClass}
              placeholder="GST, license, shop photos, agreement links..."
              {...register("publicDocumentsSummary")}
            />
            {errors.publicDocumentsSummary && (
              <p className="text-xs text-danger">{errors.publicDocumentsSummary.message}</p>
            )}
          </label>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("lookingForPartnership")} />
            Looking for partnership opportunities
          </label>
          {Boolean(lookingForPartnership) && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm">Partnership category</span>
                <input className={fieldClass} {...register("partnershipCategory")} />
                {errors.partnershipCategory && (
                  <p className="text-xs text-danger">{errors.partnershipCategory.message}</p>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-sm">Min amount (optional)</span>
                <input type="number" className={fieldClass} {...register("partnershipAmountMin")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm">Max amount (optional)</span>
                <input type="number" className={fieldClass} {...register("partnershipAmountMax")} />
                {errors.partnershipAmountMax && (
                  <p className="text-xs text-danger">{errors.partnershipAmountMax.message}</p>
                )}
              </label>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4 rounded-2xl border border-border bg-surface p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("wantsProPlan")} />
            Apply for Pro Business (requires security deposit visible publicly)
          </label>
          {Boolean(wantsProPlan) && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm">Initial deposit amount (INR)</span>
                <input type="number" className={fieldClass} {...register("proDepositAmount")} />
                {errors.proDepositAmount && (
                  <p className="text-xs text-danger">{errors.proDepositAmount.message}</p>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-sm">Deposit lock months</span>
                <input type="number" className={fieldClass} {...register("proDepositLockMonths")} />
                {errors.proDepositLockMonths && (
                  <p className="text-xs text-danger">{errors.proDepositLockMonths.message}</p>
                )}
              </label>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Submitting..." : "Save verification application"}
        </button>
      </form>

      {submissionError && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {submissionError}
        </div>
      )}

      {submitted && (
        <div className="rounded-2xl border border-brand/35 bg-brand/10 p-4 text-sm">
          Application submitted for <b>{submitted.businessName}</b>. Tracking ID:{" "}
          <b>{applicationId}</b>. Admin can now review and issue certificate.
        </div>
      )}
    </div>
  );
}
