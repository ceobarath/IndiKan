"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { useState } from "react";

const allowedEmail =
  process.env.NEXT_PUBLIC_AUTH_ALLOWED_EMAIL?.toLowerCase() ??
  "ceobarathpvt@gmail.com";

const hasConvexUrl = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // During static prerender (including the `/_not-found` route) the code runs
  // on the server where Convex's React auth context is not available.
  // We must avoid calling any Convex hooks or rendering Convex auth components
  // on the server, and only use them in the browser.
  const isBrowser = typeof window !== "undefined";

  if (!isBrowser || !hasConvexUrl) {
    return (
      <div className="flex min-h-[70vh] w-full items-center justify-center rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface)] p-10 shadow-[var(--shadow)]">
        <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  return <AuthGateInner>{children}</AuthGateInner>;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const auth = useConvexAuth();
  const isLoading = auth?.isLoading ?? false;

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] w-full items-center justify-center rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface)] p-10 shadow-[var(--shadow)]">
        <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <LoginForm />
      </Unauthenticated>
    </>
  );
}

function LoginForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim()) return;
    if (allowedEmail && email.trim().toLowerCase() !== allowedEmail) {
      setError("Email not allowed.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("flow", mode);
      formData.set("email", email.trim().toLowerCase());
      formData.set("password", password);
      await signIn("password", formData);
    } catch {
      setError("Unable to sign in. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface)] p-10 shadow-[var(--shadow)]">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-[color:var(--text)]">
          Indikan
        </h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Enter your email to receive a private sign-in link.
        </p>
        <div className="flex justify-center gap-2 text-xs text-[color:var(--text-muted)]">
          <button
            type="button"
            onClick={() => setMode("signIn")}
            className={`rounded-full px-3 py-1 ${
              mode === "signIn"
                ? "bg-[color:var(--surface-strong)] text-[color:var(--text)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signUp")}
            className={`rounded-full px-3 py-1 ${
              mode === "signUp"
                ? "bg-[color:var(--surface-strong)] text-[color:var(--text)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Create account
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-[color:var(--bg)]"
          >
            {loading
              ? "Working..."
              : mode === "signIn"
              ? "Sign in"
              : "Create account"}
          </button>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}
