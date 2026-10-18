"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crosshair, Plus, Flag, Gauge, Bug, Layers } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { EVAL_LABEL, KIND_LABEL, fmtDate } from "@/lib/format";
import type { Stats } from "@/lib/types";
import { EvalPill, Empty, PageHead, SeverityBar, Spinner } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function DashboardPage() {
  const { user, can } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.get<Stats>("/stats").then((s) => alive && setStats(s)).catch((e) => alive && setError(errorMessage(e)));
    load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const running = stats ? (stats.by_status.running ?? 0) + (stats.by_status.queued ?? 0) : 0;

  return (
    <>
      <PageHead
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Your safety evaluation overview. Start a new climb from a registered target."
        actions={can("analyst") && (
          <>
            <Link className="btn btn-primary" href="/targets?new=1"><Plus size={16} aria-hidden /> Register target</Link>
            <Link className="btn" href="/targets"><Crosshair size={16} aria-hidden /> Targets</Link>
          </>
        )}
      />

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {!stats ? (
        <Spinner label="Loading overview" />
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
            <div className="card stat"><span className="label"><Crosshair size={13} aria-hidden /> Targets</span><span className="value">{stats.targets}</span></div>
            <div className="card stat"><span className="label"><Layers size={13} aria-hidden /> Evaluations</span><span className="value">{stats.evaluations}</span><span className="small muted">{running} in progress</span></div>
            <div className="card stat"><span className="label"><Bug size={13} aria-hidden /> Open findings</span><span className="value">{stats.open_findings}</span><span className="small muted">across completed runs</span></div>
            <div className="card stat"><span className="label"><Gauge size={13} aria-hidden /> Avg. resilience</span><span className="value">{stats.average_score === null ? "—" : `${Math.round(stats.average_score)}`}</span><span className="small muted">higher is better</span></div>
          </div>

          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <section className="card" aria-labelledby="recent-h">
              <div className="row between" style={{ marginBottom: "0.75rem" }}>
                <h2 id="recent-h" style={{ margin: 0 }}>Recent evaluations</h2>
                <Link className="small" href="/targets">All targets →</Link>
              </div>
              {stats.recent.length === 0 ? (
                <Empty title="No evaluations yet">Open a target and start your first run.</Empty>
              ) : (
                <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
                  {stats.recent.map((e) => (
                    <li key={e.id} className="card card-tight row between" style={{ boxShadow: "none" }}>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/evaluations/${e.id}`} style={{ fontWeight: 600 }}>{e.target_name}</Link>
                        <div className="small muted">{KIND_LABEL[e.target_kind]} · {fmtDate(e.created_at)}</div>
                      </div>
                      <div className="row" style={{ gap: "0.6rem" }}>
                        {e.summary?.overall_score !== undefined && e.summary?.overall_score !== null && (
                          <span className="small mono">{Math.round(e.summary.overall_score)}</span>
                        )}
                        <EvalPill status={e.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="sev-h">
              <h2 id="sev-h">Severity across completed runs</h2>
              <p className="small" style={{ marginBottom: "1rem" }}>Failed Red checks and missing Blue controls, counted by severity.</p>
              <SeverityBar counts={stats.severity_counts} />
              <div className="divider" />
              <h3>How the platform scores</h3>
              <ul className="small muted" style={{ paddingLeft: "1.1rem" }}>
                <li><b style={{ color: "var(--text)" }}>Red route</b>: controlled attacks. A passed checkpoint means the attack was resisted.</li>
                <li><b style={{ color: "var(--text)" }}>Blue route</b>: defensive controls. A passed checkpoint means the control is in place.</li>
                <li>Scores are shown per route and per category, never as one number on their own.</li>
                <li>{stats.checks_in_library} checkpoints in the library.</li>
              </ul>
              <div className="row small muted" style={{ marginTop: "0.75rem" }}>
                <Flag size={14} aria-hidden /> Statuses: {Object.values(EVAL_LABEL).join(" · ")}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
