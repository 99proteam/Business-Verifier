import { createHmac } from "node:crypto";

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayoutResult {
  id: string;
  status: string;
}

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return {
    keyId,
    keySecret,
  };
}

function basicAuthHeader(keyId: string, keySecret: string) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${token}`;
}

export function verifyRazorpayPaymentSignature(payload: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const { keySecret } = getRazorpayConfig();
  const expected = createHmac("sha256", keySecret)
    .update(`${payload.orderId}|${payload.paymentId}`)
    .digest("hex");
  return expected === payload.signature;
}

export async function createRazorpayOrder(payload: {
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(keyId, keySecret),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: payload.amountInPaise,
      currency: payload.currency ?? "INR",
      receipt: payload.receipt,
      notes: payload.notes ?? {},
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error ? JSON.stringify(body.error) : "Failed to create Razorpay order."));
  }
  return body as unknown as RazorpayOrderResult;
}

export async function createRazorpayXPayout(payload: {
  amountInPaise: number;
  withdrawalId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  mode: "bank_account" | "upi";
  accountDetails: Record<string, string>;
}) {
  const keyId = process.env.RAZORPAYX_KEY_ID?.trim() ?? process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret =
    process.env.RAZORPAYX_KEY_SECRET?.trim() ?? process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim() ?? "";
  if (!keyId || !keySecret || !accountNumber) {
    throw new Error(
      "RazorpayX payout credentials are not configured (RAZORPAYX_KEY_ID/SECRET/ACCOUNT_NUMBER).",
    );
  }

  const contactResponse = await fetch("https://api.razorpay.com/v1/contacts", {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(keyId, keySecret),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: payload.ownerName,
      email: payload.ownerEmail,
      contact: payload.ownerPhone ?? "9999999999",
      type: "customer",
      reference_id: `bv_contact_${payload.withdrawalId}`,
      notes: {
        source: "business_verifier",
      },
    }),
  });
  const contactBody = (await contactResponse.json()) as Record<string, unknown>;
  if (!contactResponse.ok) {
    throw new Error(String(contactBody.error ? JSON.stringify(contactBody.error) : "Unable to create payout contact."));
  }
  const contactId = String(contactBody.id ?? "");
  if (!contactId) {
    throw new Error("RazorpayX contact id missing.");
  }

  const fundAccountPayload =
    payload.mode === "upi"
      ? {
          contact_id: contactId,
          account_type: "vpa",
          vpa: {
            address: payload.accountDetails.upi ?? "",
          },
        }
      : {
          contact_id: contactId,
          account_type: "bank_account",
          bank_account: {
            name: payload.accountDetails.accountName ?? payload.ownerName,
            ifsc: payload.accountDetails.ifsc ?? "",
            account_number: payload.accountDetails.accountNumber ?? "",
          },
        };

  const fundAccountResponse = await fetch("https://api.razorpay.com/v1/fund_accounts", {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(keyId, keySecret),
      "content-type": "application/json",
    },
    body: JSON.stringify(fundAccountPayload),
  });
  const fundAccountBody = (await fundAccountResponse.json()) as Record<string, unknown>;
  if (!fundAccountResponse.ok) {
    throw new Error(
      String(
        fundAccountBody.error
          ? JSON.stringify(fundAccountBody.error)
          : "Unable to create payout fund account.",
      ),
    );
  }
  const fundAccountId = String(fundAccountBody.id ?? "");
  if (!fundAccountId) {
    throw new Error("RazorpayX fund account id missing.");
  }

  const payoutResponse = await fetch("https://api.razorpay.com/v1/payouts", {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(keyId, keySecret),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_number: accountNumber,
      fund_account_id: fundAccountId,
      amount: payload.amountInPaise,
      currency: "INR",
      mode: payload.mode === "upi" ? "UPI" : "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: `bv_withdraw_${payload.withdrawalId}`,
      narration: "Business Verifier withdrawal",
      notes: {
        withdrawalId: payload.withdrawalId,
      },
    }),
  });
  const payoutBody = (await payoutResponse.json()) as Record<string, unknown>;
  if (!payoutResponse.ok) {
    throw new Error(String(payoutBody.error ? JSON.stringify(payoutBody.error) : "Unable to create payout."));
  }
  return payoutBody as unknown as RazorpayPayoutResult;
}
