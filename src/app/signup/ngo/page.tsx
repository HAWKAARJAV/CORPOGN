"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, ArrowLeft, Building2, Globe, Mail, Phone, Lock, Eye, EyeOff, MapPin } from "lucide-react";

const ngoTypes = [
  "Trust",
  "Society",
  "Section 8 Company",
  "Foundation",
  "Non-Profit Organization",
  "Community-Based Organization",
  "International NGO",
  "Other",
];

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab",
  "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal", "Other",
];

const focusAreas = [
  "Education", "Healthcare", "Environment", "Women Empowerment", "Rural Development",
  "Skill Development", "Child Welfare", "Animal Welfare", "Disaster Relief",
  "Food & Nutrition", "Sanitation", "Water Conservation", "Climate Action",
  "Employment Generation", "Digital Literacy", "Other",
];

const inputCls =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-400";
const selectCls =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function NgoSignUpPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);

    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/ngos/register", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.error || "Registration failed. Please try again.");
        return;
      }

      router.push("/signin?registered=ngo");
    } catch {
      setErrorMessage("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#f7f9f4] to-[#ecfdf5] text-slate-950">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <Link href="/" className="text-xl font-bold tracking-tight text-[#121e56]">
          CorpoGN
        </Link>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-5xl items-center px-5 pb-16 sm:px-8">
        <div className="grid w-full gap-12 lg:grid-cols-[1fr_1.4fr]">
          {/* Left — info */}
          <div className="flex flex-col justify-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
              <Leaf className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-600">
              NGO Registration
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-[#121e56] sm:text-5xl">
              Join the CSR ecosystem
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-500">
              Register your NGO in under 2 minutes. Add more details, upload documents, and build your Trust Score from your dashboard anytime.
            </p>

            <div className="mt-8 space-y-3">
              {[
                "Quick registration — just the basics",
                "Upload documents at your own pace",
                "Connect with corporates for CSR funding",
              ].map((point) => (
                <div key={point} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-sm font-medium text-slate-600">{point}</span>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-slate-500">
              Already registered?{" "}
              <Link
                href="/signin"
                className="font-semibold text-emerald-600 underline underline-offset-4 hover:text-emerald-700"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Right — form */}
          <div>
            <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-xl shadow-slate-100 sm:p-9">
              <div className="mb-6 border-b border-slate-100 pb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Step 1 of 1</p>
                <h2 className="mt-1.5 text-2xl font-bold text-slate-900">Create your NGO account</h2>
                <p className="mt-1 text-sm text-slate-500">All fields marked <span className="text-red-500">*</span> are required.</p>
              </div>

              {errorMessage && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Row 1: NGO Name + Type */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      NGO Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={inputCls + " pl-10"}
                        name="ngoName"
                        required
                        type="text"
                        placeholder="Green Earth Foundation"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      NGO Type <span className="text-red-500">*</span>
                    </label>
                    <select className={selectCls} name="ngoType" required defaultValue="">
                      <option value="" disabled>Select type</option>
                      {ngoTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: State + Focus Area */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      State <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <select className={selectCls + " pl-10"} name="state" required defaultValue="">
                        <option value="" disabled>Select state</option>
                        {indianStates.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Primary Focus Area <span className="text-red-500">*</span>
                    </label>
                    <select className={selectCls} name="focusAreas" required defaultValue="">
                      <option value="" disabled>Select focus area</option>
                      {focusAreas.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Email + Phone */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Official Email <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={inputCls + " pl-10"}
                        name="officialNgoEmail"
                        required
                        type="email"
                        placeholder="admin@yourngo.org"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Contact Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={inputCls + " pl-10"}
                        name="contactNumber"
                        required
                        type="tel"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>
                </div>

                {/* Website (optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Website <span className="text-xs font-normal text-slate-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className={inputCls + " pl-10"}
                      name="ngoWebsite"
                      type="url"
                      placeholder="https://yourngo.org"
                    />
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Password */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={inputCls + " pl-10 pr-10"}
                        name="password"
                        required
                        type={showPass ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowPass((p) => !p)}
                        tabIndex={-1}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={inputCls + " pl-10 pr-10"}
                        name="confirmPassword"
                        required
                        type={showConfirm ? "text" : "password"}
                        placeholder="Re-enter password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowConfirm((p) => !p)}
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <button
                  className="mt-2 h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Creating account…" : "Create NGO Account →"}
                </button>

                <p className="text-center text-xs text-slate-400">
                  You can add more details, upload documents, and complete your profile after signing in.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
