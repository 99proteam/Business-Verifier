import { NextRequest, NextResponse } from "next/server";
import { AuthApiError, verifyRequestAuth } from "@/lib/server/auth";
import {
  MobilePushPlatform,
  registerMobilePushToken,
} from "@/lib/server/mobile-push";

export const runtime = "nodejs";

function sanitizePlatform(raw: unknown): MobilePushPlatform {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "android" || value === "ios" || value === "web") {
    return value;
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "token is required." }, { status: 400 });
    }
    const result = await registerMobilePushToken({
      uid: auth.uid,
      token,
      platform: sanitizePlatform(body.platform),
      appVersion: body.appVersion ? String(body.appVersion) : undefined,
      deviceName: body.deviceName ? String(body.deviceName) : undefined,
    });
    return NextResponse.json({
      ok: true,
      tokenId: result.tokenId,
      alreadyExisted: result.alreadyExisted,
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Unexpected mobile push registration error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
