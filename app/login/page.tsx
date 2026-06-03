import { FileSpreadsheet, LockKeyhole } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-blue-700">
          <FileSpreadsheet className="h-5 w-5" />
          DC CRM Analytics
        </div>
        <div className="mt-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Enter the report credentials.</p>
          </div>
        </div>

        {hasError ? (
          <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Incorrect login or password.
          </div>
        ) : null}

        <form action="/api/login" method="post" className="mt-6 grid gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Login
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="submit"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
