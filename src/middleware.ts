import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route-level session/role gate for protected page routes.
 *
 * This complements — does not replace — the per-page and per-API-route
 * auth checks already in the codebase (see app/ngo/[slug]/dashboard/page.tsx,
 * app/admin/dashboard/page.tsx, lib/access-control.ts). Those checks resolve
 * real org membership from the database via `supabaseAdmin` (service role)
 * because `user_metadata` on the session can go stale (e.g. an NGO worker
 * removed from `ngo_members` still carrying old metadata). Edge Middleware
 * cannot use `supabaseAdmin` — it runs on the Edge runtime, not Node, and
 * must not embed the service-role key — so it cannot reproduce that DB
 * lookup safely or cheaply on every request.
 *
 * Design choice (per task step 3, option "b"): this middleware only checks
 * (1) is there a valid Supabase session at all, and (2) does the JWT's
 * `user_metadata.account_type` broadly match the area being accessed
 * (corporate vs ngo vs admin). It does NOT re-verify org membership, active
 * status, or fine-grained `allowed_pages` — that stays in the page/API layer
 * via `getOrgContext` / `getNgoIdForUser` / `getCorporateIdForUser`, which
 * already do the correct DB-backed check. This keeps middleware fast (no
 * extra DB round trip on every navigation) while still closing the actual
 * gap: an unauthenticated or wrong-role request can no longer reach the
 * protected page's React tree at all — today it can, because the redirect
 * only happens after client-side JS (or a page body that runs after the
 * shell is already sent) decides to bounce the user.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = user?.user_metadata?.account_type as string | undefined;

  if (pathname.startsWith("/corporate")) {
    if (!user || (accountType !== "corporate" && accountType !== "corporate_employee")) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }
    return response;
  }

  if (pathname.startsWith("/ngo")) {
    if (!user || (accountType !== "ngo" && accountType !== "ngo_member")) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }
    return response;
  }

  if (pathname.startsWith("/admin/dashboard") || pathname.startsWith("/admin/enrichment")) {
    // Session presence only here — whether this user is actually an active
    // row in `admin_users` is a DB check that stays in the page layer
    // (see app/admin/dashboard/page.tsx -> admin-dashboard.tsx and the
    // admin_users lookup already done client-side today), since it requires
    // the service-role client this middleware intentionally doesn't hold.
    if (!user) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/corporate/:path*", "/ngo/:path*", "/admin/dashboard/:path*", "/admin/enrichment/:path*"],
};
