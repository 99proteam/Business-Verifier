interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
}

function getPayPalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const env = String(process.env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }
  return {
    clientId,
    clientSecret,
    apiBase:
      env === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
  };
}

async function fetchPayPalAccessToken() {
  const { clientId, clientSecret, apiBase } = getPayPalConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await response.json()) as PayPalAccessTokenResponse & {
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? "Unable to get PayPal access token.");
  }
  return {
    accessToken: body.access_token,
    apiBase,
  };
}

export async function createPayPalOrder(payload: {
  amount: number;
  currency: "INR" | "USD";
  intentId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const { accessToken, apiBase } = await fetchPayPalAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: payload.intentId,
          description: payload.description,
          amount: {
            currency_code: payload.currency,
            value: payload.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: payload.returnUrl,
        cancel_url: payload.cancelUrl,
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  const body = (await response.json()) as PayPalOrderResponse & {
    message?: string;
    details?: Array<{ description?: string }>;
  };
  if (!response.ok || !body.id) {
    const detail = body.details?.[0]?.description;
    throw new Error(detail || body.message || "Unable to create PayPal order.");
  }
  const approveLink = body.links?.find((link) => link.rel === "approve")?.href ?? "";
  return {
    id: body.id,
    status: body.status,
    approveLink,
  };
}

export async function capturePayPalOrder(payload: { orderId: string }) {
  const { accessToken, apiBase } = await fetchPayPalAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders/${payload.orderId}/capture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const body = (await response.json()) as PayPalOrderResponse & {
    message?: string;
    details?: Array<{ description?: string }>;
  };
  if (!response.ok) {
    const detail = body.details?.[0]?.description;
    throw new Error(detail || body.message || "Unable to capture PayPal order.");
  }
  const captureId =
    body.purchase_units?.[0]?.payments?.captures?.[0]?.id ??
    "";
  return {
    status: body.status,
    captureId,
  };
}
