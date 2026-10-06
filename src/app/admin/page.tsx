"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  INVESTOR_DEMO_PASSWORD,
  INVESTOR_DEMO_PLATFORM_ADMIN,
} from "@/lib/investor-demo-credentials";

const inputClass =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[#849b34] focus:ring-2 focus:ring-lime-100";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function signInAndRoute(loginEmail: string, loginPassword: string) {
    setErrorMessage("");
    setIsSubmitting(true);

    const { data: signInData, error: signInError } = await supabaseBrowser.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (signInError || !signInData.user) {
      setErrorMessage(signInError?.message || "Invalid email or password.");
      setIsSubmitting(false);
      return;
    }

    const { data: adminRow, error: adminError } = await supabaseBrowser
      .from("admin_users")
      .select("id, is_active")
      .eq("auth_user_id", signInData.user.id)
      .maybeSingle();

    if (adminError || !adminRow || !adminRow.is_active) {
      await supabaseBrowser.auth.signOut();
      setErrorMessage("This account does not have admin access.");
      setIsSubmitting(false);
      return;
    }

    router.push("/admin/dashboard");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void signInAndRoute(email, password);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f9f4] text-slate-950">
      <header className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <ShieldCheck className="size-6 text-[#849b34]" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900">Platform Admin Sign In</h1>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>

            {errorMessage ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#849b34] px-4 text-sm font-semibold text-white transition hover:bg-[#71852c] disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Sign In
            </button>
          </form>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void signInAndRoute(INVESTOR_DEMO_PLATFORM_ADMIN.email, INVESTOR_DEMO_PASSWORD)}
            className="mt-4 w-full rounded-md border border-slate-200 bg-[#f7f9f4] px-3 py-2.5 text-left text-xs text-slate-600 transition hover:border-[#849b34] disabled:opacity-60"
          >
            <span className="font-semibold text-slate-800">Investor demo operator</span>
            <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
              {INVESTOR_DEMO_PLATFORM_ADMIN.email}
            </span>
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Requires <code className="text-[10px]">npm run seed:demo</code> on the connected Supabase project.
          </p>
        </div>
      </div>
    </main>
  );
}
