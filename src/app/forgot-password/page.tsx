import { SiteHeader } from "@/components/layout/site-header";
import { ForgotPasswordPanel } from "./forgot-password-panel";

export default function ForgotPasswordPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-4 py-8">
        <ForgotPasswordPanel />
      </main>
    </div>
  );
}
