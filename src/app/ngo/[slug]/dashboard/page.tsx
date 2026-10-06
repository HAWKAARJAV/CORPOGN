import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import NgoDashboard from "./ngo-dashboard";
import type { NgoRole } from "@/lib/ngo";
import { getNgoIdForUser } from "@/lib/access-control";

export default async function NgoDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
    redirect("/signin");
  }

  const accountType = user.user_metadata?.account_type as string;

  if (accountType === "corporate") {
    redirect("/signin");
  }

  let ngo: {
    id: string; slug: string; ngo_name: string; ngo_email: string;
    access_status: string; has_project: boolean; trust_score: number;
    registration_data: Record<string, unknown>;
  } | null = null;
  let viewerRole: NgoRole = "super_admin";

  if (accountType === "ngo") {
    const { data } = await supabase
      .from("ngos")
      .select("id, slug, ngo_name, ngo_email, access_status, has_project, trust_score, registration_data")
      .eq("auth_user_id", user.id)
      .single();

    if (!data || data.slug !== slug) {
      redirect("/signin");
    }

    ngo = data;
    viewerRole = "super_admin";
  } else if (accountType === "ngo_member") {
    const ngoId = await getNgoIdForUser(user);

    if (!ngoId) {
      redirect("/signin");
    }

    // Source of truth for role is ngo_members, not session metadata — the
    // same class of bug as ngo_id drifting: metadata can go stale after a
    // role change or reseed, so it must never decide access on its own.
    const { data: memberRow } = await supabase
      .from("ngo_members")
      .select("role, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!memberRow?.is_active) {
      redirect("/signin");
    }

    viewerRole = (memberRow.role as NgoRole) ?? "volunteer";

    const { data } = await supabase
      .from("ngos")
      .select("id, slug, ngo_name, ngo_email, access_status, has_project, trust_score, registration_data")
      .eq("id", ngoId)
      .single();

    if (!data || data.slug !== slug) {
      redirect("/signin");
    }

    ngo = data;
  } else {
    redirect("/signin");
  }

  return (
    <NgoDashboard
      ngo={ngo}
      viewerRole={viewerRole}
      viewerName={(user.user_metadata?.full_name as string) ?? (user.user_metadata?.ngo_name as string) ?? "Admin"}
    />
  );
}
