import { Analytics } from "@vercel/analytics/react";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { Footer } from "@/components/layout/footer";
import { PostHogPageView } from "@/components/analytics/posthog-pageview";
import { PagePerformance } from "@/components/analytics/page-performance";
import { PostHogProvider } from "@/components/analytics/posthog-provider";

const isVercel = process.env.VERCEL === "1";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PostHogProvider
      user={{
        id: "public-user",
      }}
    >
      <Suspense fallback={null}>
        <PostHogPageView userId="public-user" />
        <PagePerformance />
      </Suspense>
      <div className="relative flex h-screen min-h-screen flex-col">
        <AppHeader showUpgradeButton={false} isProPlan />
        <main className="h-full py-14">{children}</main>
        <Footer />
        {isVercel && <Analytics />}
      </div>
    </PostHogProvider>
  );
}
