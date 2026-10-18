"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Shield, LayoutDashboard, Crosshair, ScrollText, Users, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import type { Role, User } from "@/lib/types";

interface AuthValue {
  user: User;
  can: (minimum: Role) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const RANK: Record<Role, number> = { viewer: 0, analyst: 1, admin: 2 };

export function useUser(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useUser must be used inside <AppShell>");
  return value;
}

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sentin AI home">
      <span className="brand-mark"><Shield size={17} aria-hidden /></span>
      <span>Sentin AI</span>
    </Link>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      <span className="row" style={{ gap: "0.4rem" }}>{icon}{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<User>("/auth/me"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, pathname, router]);

  async function signOut() {
    try {
      await api.post("/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (!user) {
    return (
      <div className="container page" role="status" aria-live="polite">
        <p>Loading your workspace…</p>
      </div>
    );
  }

  const can = (minimum: Role) => RANK[user.role] >= RANK[minimum];
  const is = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <AuthContext.Provider value={{ user, can, refresh }}>
      <header className="topbar no-print">
        <div className="container">
          <Brand />
          <nav className="nav-links" aria-label="Main">
            <NavLink href="/dashboard" label="Dashboard" icon={<LayoutDashboard size={15} />} active={is("/dashboard")} />
            <NavLink href="/targets" label="Targets" icon={<Crosshair size={15} />} active={is("/targets")} />
            {can("analyst") && (
              <NavLink href="/audit" label="Audit" icon={<ScrollText size={15} />} active={is("/audit")} />
            )}
            {can("admin") && (
              <NavLink href="/admin/users" label="Users" icon={<Users size={15} />} active={is("/admin")} />
            )}
          </nav>
          <div className="spacer" />
          <span className="role-chip" title={user.email}>{user.role}</span>
          <span className="small muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            <LogOut size={14} aria-hidden /> Sign out
          </button>
        </div>
      </header>
      <main id="main" className="container page">{children}</main>
    </AuthContext.Provider>
  );
}
