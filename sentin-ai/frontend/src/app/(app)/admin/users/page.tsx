"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { PageHead, Spinner } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function UsersPage() {
  const { user: me } = useUser();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setUsers(await api.get<User[]>("/users"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function update(u: User, changes: Partial<Pick<User, "role" | "is_active">>) {
    setError(null);
    setNotice(null);
    try {
      await api.patch<User>(`/users/${u.id}`, changes);
      setNotice(`Updated ${u.email}.`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHead
        crumbs="Administration"
        title="Users & roles"
        subtitle="Admins manage access. Analysts run evaluations. Viewers read summaries without raw evidence."
      />
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {notice && <div className="alert alert-ok" role="status" style={{ marginBottom: "1rem" }}>{notice}</div>}
      {!users ? <Spinner label="Loading users" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name} {u.id === me.id && <span className="pill">you</span>}</td>
                  <td className="mono small">{u.email}</td>
                  <td>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                    <select id={`role-${u.id}`} value={u.role} style={{ width: "auto" }}
                      onChange={(e) => update(u, { role: e.target.value as Role })}>
                      <option value="admin">admin</option>
                      <option value="analyst">analyst</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td><span className={`pill ${u.is_active ? "pill-completed" : "pill-error"}`}>{u.is_active ? "active" : "disabled"}</span></td>
                  <td className="small">{fmtDate(u.created_at)}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => update(u, { is_active: !u.is_active })}>
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
