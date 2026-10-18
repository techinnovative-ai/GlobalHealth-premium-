"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { AuditRecord } from "@/lib/types";
import { PageHead, Spinner } from "@/components/ui";

interface Verify { valid: boolean; records: number; broken_at_id: number | null }

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRecord[] | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [list, check] = await Promise.all([api.get<AuditRecord[]>("/audit?limit=200"), api.get<Verify>("/audit/verify")]);
      setRows(list);
      setVerify(check);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHead
        crumbs="Governance"
        title="Audit trail"
        subtitle="Every sign-in, target change and evaluation is chained by SHA-256. Editing any record breaks verification."
        actions={<button className="btn" onClick={load}>Re-verify</button>}
      />
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {verify && (
        <div className={`alert ${verify.valid ? "alert-ok" : "alert-error"}`} role="status" style={{ marginBottom: "1rem" }}>
          <span className="row" style={{ gap: "0.5rem" }}>
            {verify.valid ? <ShieldCheck size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
            {verify.valid
              ? `Chain intact across ${verify.records} records.`
              : `Chain broken at record #${verify.broken_at_id}. Investigate immediately.`}
          </span>
        </div>
      )}
      {!rows ? <Spinner label="Loading audit trail" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Subject</th><th>Hash</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td className="small">{fmtDate(r.ts)}</td>
                  <td className="small">{r.actor}</td>
                  <td className="mono small">{r.action}</td>
                  <td className="mono small">{r.subject || "—"}</td>
                  <td className="mono small muted" title={r.hash}>{r.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
