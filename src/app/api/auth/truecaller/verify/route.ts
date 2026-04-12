import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { AuthApiError, verifyRequestAuth } from "@/lib/server/auth";
import { getAdminFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

function normalizePhoneNumber(raw: string) {
  return raw.replace(/[^\d+]/g, "").trim();
}

function toVerifiedState(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (typeof record.verified === "boolean") return record.verified;
  const status = String(record.status ?? record.verificationStatus ?? "").trim().toLowerCase();
  return ["verified", "success", "approved", "ok"].includes(status);
}

function sanitizeProviderResponse(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return {
    status: String(record.status ?? record.verificationStatus ?? ""),
    requestId: String(record.requestId ?? record.id ?? ""),
    message: String(record.message ?? ""),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const firestore = getAdminFirestore();
    const snapshot = await firestore.doc(`users/${auth.uid}`).get();
    if (!snapshot.exists) {
      return NextResponse.json({
        ok: true,
        result: {
          verified: false,
        },
      });
    }
    const rawTruecaller = (snapshot.data()?.truecaller ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      result: {
        verified: Boolean(rawTruecaller.verified),
        phoneNumber: String(rawTruecaller.phoneNumber ?? ""),
        countryCode: String(rawTruecaller.countryCode ?? ""),
        provider: String(rawTruecaller.provider ?? ""),
        verifiedAt: rawTruecaller.verifiedAt ?? null,
        updatedAt: rawTruecaller.updatedAt ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected Truecaller status error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const phoneNumber = normalizePhoneNumber(String(body.phoneNumber ?? ""));
    const countryCode = String(body.countryCode ?? "").trim();
    const verificationToken = String(body.verificationToken ?? "").trim();
    const requestId = String(body.requestId ?? "").trim();

    if (!phoneNumber) {
      return NextResponse.json({ ok: false, error: "phoneNumber is required." }, { status: 400 });
    }

    const verifyEndpoint = process.env.TRUECALLER_VERIFY_ENDPOINT?.trim() ?? "";
    let providerResponse: unknown = null;
    let verified = false;
    let provider = "mock_truecaller";

    if (verifyEndpoint) {
      const truecallerApiKey = process.env.TRUECALLER_API_KEY?.trim() ?? "";
      const truecallerAppKey = process.env.TRUECALLER_APP_KEY?.trim() ?? "";
      const response = await fetch(verifyEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(truecallerApiKey ? { authorization: `Bearer ${truecallerApiKey}` } : {}),
          ...(truecallerAppKey ? { "x-app-key": truecallerAppKey } : {}),
        },
        body: JSON.stringify({
          phoneNumber,
          countryCode,
          verificationToken,
          requestId,
          uid: auth.uid,
          email: auth.email,
        }),
      });
      provider = "truecaller_api";
      providerResponse = await response.json().catch(async () => {
        const text = await response.text();
        return { status: response.status, message: text };
      });
      verified = response.ok && toVerifiedState(providerResponse);
    } else {
      verified = verificationToken.length >= 6 && phoneNumber.replace("+", "").length >= 8;
      providerResponse = {
        status: verified ? "verified" : "failed",
        message: verified
          ? "Mock verification accepted."
          : "Verification token or phone format invalid.",
      };
    }

    const firestore = getAdminFirestore();
    await firestore.doc(`users/${auth.uid}`).set(
      {
        mobileNumber: phoneNumber,
        mobileVerified: verified,
        truecaller: {
          verified,
          phoneNumber,
          countryCode,
          requestId,
          provider,
          providerResponse: sanitizeProviderResponse(providerResponse),
          verifiedAt: verified ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      result: {
        verified,
        phoneNumber,
        countryCode,
        provider,
        providerResponse: sanitizeProviderResponse(providerResponse),
      },
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected Truecaller verification error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
