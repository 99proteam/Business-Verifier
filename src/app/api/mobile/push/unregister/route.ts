import { NextRequest, NextResponse } from "next/server";
import { AuthApiError, verifyRequestAuth } from "@/lib/server/auth";
import { unregisterMobilePushToken } from "@/lib/server/mobile-push";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "token is required." }, { status: 400 });
    }
    const result = await unregisterMobilePushToken({
      uid: auth.uid,
      token,
    });
    return NextResponse.json({
      ok: true,
      tokenId: result.tokenId,
      existed: result.existed,
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Unexpected mobile push unregister error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
