import { Suspense } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import { getAdminForUser } from "@/lib/access-control";
import EnrichmentDashboard from "./enrichment-dashboard";

export const metadata = {
  title: "NGO Enrichment Pipeline | CorpoGN Admin",
  description: "Monitor and control the autonomous NGO data enrichment pipeline.",
};

export default async function EnrichmentPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin");
  }

  const admin = await getAdminForUser(user);
  if (!admin) {
    redirect("/admin");
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading enrichment data…</p>
          </div>
        </div>
      }
    >
      <EnrichmentDashboard />
    </Suspense>
  );
}
