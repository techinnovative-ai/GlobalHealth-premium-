"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "register">(params.get("mode") === "register" ? "register" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.post<User>("/auth/register", { name, email, password });
      }
      await api.post<User>("/auth/login", { email, password });
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: "1.6rem" }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="small" style={{ marginBottom: "1.25rem" }}>
        Sentin AI is for authorised safety testing only. Every evaluation is recorded in the audit trail.
      </p>
      <div className="tabs" role="tablist" aria-label="Sign in or register">
        <button role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
        <button role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")}>Register</button>
      </div>

      <form onSubmit={submit} className="stack" noValidate>
        {mode === "register" && (
          <label className="field">Full name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
          </label>
        )}
        <label className="field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">Password
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"}
            aria-describedby="pw-hint"
          />
          {mode === "register" && <span id="pw-hint" className="small">At least 10 characters. New accounts start as analysts.</span>}
        </label>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account and sign in"}
        </button>
      </form>
    </>
  );
}
