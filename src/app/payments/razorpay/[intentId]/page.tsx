import { SiteHeader } from "@/components/layout/site-header";
import { RazorpayPaymentPanel } from "./razorpay-payment-panel";

export default async function RazorpayPaymentPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <RazorpayPaymentPanel intentId={intentId} />
      </main>
    </div>
  );
}
