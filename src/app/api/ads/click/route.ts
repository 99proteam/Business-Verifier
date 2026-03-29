import { NextRequest, NextResponse } from "next/server";
import { registerAdClick } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

function safeRedirectUrl(input: string) {
  try {
    const parsed = new URL(input);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = String(searchParams.get("campaignId") ?? "").trim();
  const target = String(searchParams.get("to") ?? "").trim();
  const redirect = safeRedirectUrl(target);
  if (!campaignId || !redirect) {
    return NextResponse.json({ ok: false, error: "campaignId and valid to URL are required." }, { status: 400 });
  }

  try {
    await enforceApiRateLimit({
      scope: "ads_click_redirect",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "200"),
      windowMinutes: 10,
    });
    await registerAdClick(campaignId);
  } catch {
    // Redirect user even if tracking fails.
  }

  return NextResponse.redirect(redirect, { status: 302 });
}
