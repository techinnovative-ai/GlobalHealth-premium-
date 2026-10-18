import Link from "next/link";
import { Brand } from "@/components/AppShell";

export default function NotFound() {
  return (
    <>
      <header className="topbar"><div className="container"><Brand /></div></header>
      <main className="container page" style={{ textAlign: "center", padding: "6rem 0" }}>
        <p className="mono small">404</p>
        <h1>Off the trail.</h1>
        <p>This page does not exist, or you do not have access to it.</p>
        <Link className="btn btn-primary" href="/dashboard">Back to dashboard</Link>
      </main>
    </>
  );
}
