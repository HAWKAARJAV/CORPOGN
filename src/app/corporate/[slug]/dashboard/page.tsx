import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import { getCorporateIdForUser, type AuthUser } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorporateDashboard } from "./corporate-dashboard";

export default async function CorporateDashboardPage(
  props: PageProps<"/corporate/[slug]/dashboard">,
) {
  const { slug } = await props.params;
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

  const accountType = user.user_metadata?.account_type as string | undefined;
  if (accountType !== "corporate" && accountType !== "corporate_employee") {
    redirect("/signin");
  }

  const corporateId = await getCorporateIdForUser(user as AuthUser);
  if (!corporateId) {
    redirect("/signin");
  }

  const { data: corporate } = await supabaseAdmin
    .from("corporates")
    .select("slug")
    .eq("id", corporateId)
    .maybeSingle();

  if (!corporate || corporate.slug !== slug) {
    redirect("/signin");
  }

  return <CorporateDashboard slug={slug} />;
}
