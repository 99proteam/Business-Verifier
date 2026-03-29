import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  const sdkSource = `(function () {
  if (window.BusinessVerifierSDK) return;
  var BASE_URL = ${JSON.stringify(appUrl)};

  async function requestJson(path, payload, apiKey) {
    var response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-verifier-api-key": apiKey || "",
      },
      body: JSON.stringify(payload || {}),
    });
    var data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data && data.error ? String(data.error) : "Business Verifier API request failed.");
    }
    return data;
  }

  async function validateDiscount(options) {
    if (!options || !options.businessOwnerUid || !options.integrationApiKey || !options.customerPublicId || !options.transactionValue) {
      throw new Error("Missing required options for validateDiscount.");
    }
    var payload = {
      businessOwnerUid: options.businessOwnerUid,
      customerPublicId: options.customerPublicId,
      transactionValue: options.transactionValue,
      source: options.source === "offline" ? "offline" : "online",
      externalOrderId: options.externalOrderId || undefined,
    };
    var data = await requestJson("/api/membership/discount/validate", payload, options.integrationApiKey);
    return data.result;
  }

  async function ingestTransactions(options) {
    if (!options || !options.businessOwnerUid || !options.integrationApiKey) {
      throw new Error("Missing required options for ingestTransactions.");
    }
    var payload = {
      businessOwnerUid: options.businessOwnerUid,
      source: options.source === "offline" ? "offline" : "online",
    };
    if (Array.isArray(options.rows)) {
      payload.rows = options.rows;
    } else if (options.row) {
      payload.row = options.row;
    }
    return requestJson("/api/membership/transactions/ingest", payload, options.integrationApiKey);
  }

  function mountCouponPrompt(options) {
    if (!options || !options.containerId) {
      throw new Error("containerId is required for mountCouponPrompt.");
    }
    var container = document.getElementById(options.containerId);
    if (!container) {
      throw new Error("Container element not found.");
    }
    container.innerHTML = "";
    var wrapper = document.createElement("div");
    wrapper.style.border = "1px solid #d0d6e1";
    wrapper.style.borderRadius = "12px";
    wrapper.style.padding = "12px";
    wrapper.style.display = "grid";
    wrapper.style.gap = "8px";
    wrapper.style.maxWidth = "380px";
    wrapper.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";

    var heading = document.createElement("div");
    heading.textContent = "Verifier Discount";
    heading.style.fontWeight = "600";
    wrapper.appendChild(heading);

    var input = document.createElement("input");
    input.placeholder = "Customer public ID (BVU-XXXXXXX)";
    input.style.padding = "8px";
    input.style.border = "1px solid #d0d6e1";
    input.style.borderRadius = "8px";
    wrapper.appendChild(input);

    var button = document.createElement("button");
    button.textContent = "Check discount";
    button.style.padding = "8px 10px";
    button.style.border = "0";
    button.style.borderRadius = "8px";
    button.style.background = "#2563eb";
    button.style.color = "white";
    button.style.cursor = "pointer";
    wrapper.appendChild(button);

    var result = document.createElement("div");
    result.style.fontSize = "12px";
    result.style.color = "#334155";
    wrapper.appendChild(result);

    button.addEventListener("click", async function () {
      result.textContent = "Checking...";
      try {
        var response = await validateDiscount({
          businessOwnerUid: options.businessOwnerUid,
          integrationApiKey: options.integrationApiKey,
          customerPublicId: input.value.trim(),
          transactionValue: options.transactionValue || 0,
          source: options.source || "online",
          externalOrderId: options.externalOrderId || undefined,
        });
        result.textContent =
          response.isMembershipActive
            ? "Discount " + response.discountPercent + "% applied. Final amount: INR " + response.finalAmount
            : "Membership inactive. No discount applied.";
        if (typeof options.onResult === "function") {
          options.onResult(response);
        }
      } catch (error) {
        var message = error && error.message ? String(error.message) : "Unable to validate discount.";
        result.textContent = message;
        if (typeof options.onError === "function") {
          options.onError(message);
        }
      }
    });

    container.appendChild(wrapper);
  }

  window.BusinessVerifierSDK = {
    baseUrl: BASE_URL,
    validateDiscount: validateDiscount,
    ingestTransactions: ingestTransactions,
    mountCouponPrompt: mountCouponPrompt,
  };
})();`;

  return new NextResponse(sdkSource, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
