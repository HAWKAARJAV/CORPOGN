"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-700";

export default function CorporateSignUpPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("companyEmail") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/corporates/register", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { slug?: string; error?: string };

      if (!response.ok || !result.slug) {
        throw new Error(result.error || "Corporate registration failed.");
      }

      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      router.push(`/corporate/${result.slug}/dashboard`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Corporate registration failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Corporate Registration
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your basic details to set up your corporate account.
          </p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {errorMessage ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <Field label="Company Name" required>
            <input className={inputClass} name="companyName" required type="text" placeholder="e.g. Acme Corp" />
          </Field>

          <Field label="Official Company Email" required>
            <input className={inputClass} name="companyEmail" required type="email" placeholder="e.g. csr@acme.com" />
          </Field>

          <Field label="Contact Number">
            <input className={inputClass} name="contactNumber" type="tel" placeholder="e.g. +91 98765 43210" />
          </Field>

          <Field label="Password" required>
            <input className={inputClass} name="password" required type="password" placeholder="••••••••" />
          </Field>

          <Field label="Confirm Password" required>
            <input className={inputClass} name="confirmPassword" required type="password" placeholder="••••••••" />
          </Field>

          <div className="pt-4 space-y-3">
            <button
              className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 flex items-center justify-center disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </button>

            <div className="text-center text-xs text-slate-400">
              Already have an account?{" "}
              <Link href="/signin" className="font-semibold text-slate-700 hover:underline">
                Sign In
              </Link>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
