import Link from "next/link";
import { ArrowLeft, Building2, HeartHandshake } from "lucide-react";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#f7f9f4] text-slate-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          href="/"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <Link
          className="text-xl font-bold tracking-normal text-[#121e56]"
          href="/"
        >
          CorpoGN
        </Link>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-92px)] w-full max-w-6xl items-center px-5 pb-12 sm:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-[#849b34]">
              Join CorpoGN
            </p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold leading-tight tracking-normal text-[#121e56] sm:text-5xl">
              Choose how you want to get started
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Create the right workspace for your CSR role and continue to a
              focused registration flow.
            </p>
            <p className="mt-8 text-sm text-slate-600">
              Already registered?{" "}
              <Link
                className="font-semibold text-[#849b34] underline underline-offset-4 hover:text-[#6f842a]"
                href="/signin"
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Link
              className="group flex min-h-64 flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#849b34] hover:shadow-md"
              href="/signup/ngo"
            >
              <span className="flex size-12 items-center justify-center rounded-md bg-[#eef5dc] text-[#6f842a]">
                <HeartHandshake className="size-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-2xl font-semibold tracking-normal text-[#121e56]">
                  Register as NGO
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-600">
                  Build your organization profile, share proposals, and connect
                  with CSR opportunities.
                </span>
              </span>
              <span className="mt-6 inline-flex text-sm font-bold text-[#849b34] group-hover:text-[#6f842a]">
                Continue as NGO
              </span>
            </Link>

            <Link
              className="group flex min-h-64 flex-col justify-between rounded-lg bg-[#121e56] p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#17266d] hover:shadow-md"
              href="/signup/corporate"
            >
              <span className="flex size-12 items-center justify-center rounded-md bg-white/10 text-[#d2e56d]">
                <Building2 className="size-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-2xl font-semibold tracking-normal">
                  Register as Corporate
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-200">
                  Set up your CSR team, manage programs, and track compliance
                  and impact from one place.
                </span>
              </span>
              <span className="mt-6 inline-flex text-sm font-bold text-[#d2e56d] group-hover:text-white">
                Continue as Corporate
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
