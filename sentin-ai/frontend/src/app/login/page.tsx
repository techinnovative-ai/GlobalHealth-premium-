import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Brand } from "@/components/AppShell";
import { MountainArt } from "@/components/Mountain";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Brand />
        </div>
      </header>
      <div className="auth-wrap">
        <MountainArt />
        <div className="auth-card card">
          <Suspense fallback={<p>Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
