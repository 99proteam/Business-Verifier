import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <p>Business Verifier SaaS foundation built with Next.js + Firebase.</p>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="hover:text-foreground">
            Plans
          </Link>
          <Link href="/directory" className="hover:text-foreground">
            Public Directory
          </Link>
          <Link href="/dashboard/business/onboarding" className="hover:text-foreground">
            Verify Business
          </Link>
        </div>
      </div>
    </footer>
  );
}
