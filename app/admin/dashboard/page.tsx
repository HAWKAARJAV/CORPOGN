import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import { getAdminForUser } from "@/lib/access-control";
import AdminDashboard from "./admin-dashboard";

export const metadata = {
  title: "Admin — CorpoGN Control Center",
  description: "Internal platform admin: NGO directory, projects, pipeline logs, corporates.",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
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

  return <AdminDashboard />;
}
