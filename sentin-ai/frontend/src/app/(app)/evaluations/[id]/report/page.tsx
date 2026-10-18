"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Printer, Download } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { KIND_LABEL, ROUTE_LABEL, fmtDate } from "@/lib/format";
import type { Report } from "@/lib/types";
import { Empty, PageHead, ScoreRing, SeverityBar, SeverityPill, Spinner } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Report>(`/evaluations/${id}/report`).then(setReport).catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!report) return <Spinner label="Preparing report" />;
  const s = report.summary;

  return (
    <div className="report">
      <PageHead
        crumbs={<><Link href={`/evaluations/${id}`}>← Back to live run</Link></>}
        title="Final report"
        subtitle={`${report.target.name} · ${KIND_LABEL[report.target.kind]} · ${report.target.endpoint}`}
        actions={
          <>
            <button className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print / save PDF</button>
            <a className="btn no-print" href={`/api/evaluations/${id}/report.md`} download><Download size={16} aria-hidden /> Markdown</a>
          </>
        }
      />

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="grid grid-3" style={{ alignItems: "center" }}>
          <div className="row" style={{ justifyContent: "center" }}><ScoreRing score={s?.overall_score} label="Overall" /></div>
          <div>
            <dl className="kv">
              <dt>Status</dt><dd style={{ textTransform: "capitalize" }}>{report.status}</dd>
              <dt>Posture</dt><dd style={{ textTransform: "capitalize" }}>{s?.posture ?? "n/a"}</dd>
              <dt>Started</dt><dd>{fmtDate(report.started_at)}</dd>
              <dt>Finished</dt><dd>{fmtDate(report.finished_at)}</dd>
              <dt>Digest</dt><dd className="mono small" style={{ overflowWrap: "anywhere" }}>{report.integrity.results_sha256}</dd>
            </dl>
          </div>
          <div>
            <h3>Severity of findings</h3>
            {s && <SeverityBar counts={s.severity_counts} />}
          </div>
        </div>
      </div>

      {s && (
        <div className="grid grid-2" style={{ marginBottom: "1.25rem" }}>
          {(["red", "blue"] as const).map((r) => (
            <div className="card" key={r}>
              <h3>{ROUTE_LABEL[r]}</h3>
              <p className="small" style={{ margin: 0 }}>
                Score <b className="mono" style={{ color: "var(--text)" }}>{s.routes[r].resilience_score ?? "—"}</b> ·{" "}
                {s.routes[r].passed} passed · {s.routes[r].failed} failed · {s.routes[r].blocked} blocked
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="card" style={{ marginBottom: "1.25rem" }} aria-labelledby="f-h">
        <h2 id="f-h">Findings ({report.findings.length})</h2>
        {report.findings.length === 0 ? (
          <Empty title="No findings">No executed checkpoint failed.</Empty>
        ) : (
          report.findings.map((f) => (
            <article key={f.key} className={`finding sev-${f.severity}`}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{f.title}</h3>
                <span className="row" style={{ gap: "0.5rem" }}><SeverityPill severity={f.severity} /><span className="small mono muted">{f.key}</span></span>
              </div>
              <p className="small" style={{ margin: "0.4rem 0", color: "var(--text)" }}><b>Observed:</b> {f.detail}</p>
              <p className="small" style={{ margin: "0.2rem 0" }}><b>Remediation:</b> {f.remediation}</p>
              <p className="small muted" style={{ margin: 0 }}>{ROUTE_LABEL[f.route]} · {f.category}</p>
              {f.evidence && user.role !== "viewer" && (
                <details style={{ marginTop: "0.5rem" }} className="no-print">
                  <summary className="small" style={{ cursor: "pointer" }}>Evidence</summary>
                  <pre className="mono small" style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{JSON.stringify(f.evidence, null, 2)}</pre>
                </details>
              )}
            </article>
          ))
        )}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="p-h">
          <h2 id="p-h">Passed checkpoints ({report.passed.length})</h2>
          <ul className="small muted" style={{ paddingLeft: "1.1rem" }}>
            {report.passed.map((p) => <li key={p.key}>{p.key} · {p.title}</li>)}
          </ul>
        </section>
        <section className="card" aria-labelledby="b-h">
          <h2 id="b-h">Blocked or errored ({report.blocked.length})</h2>
          {report.blocked.length === 0 ? <p className="small">None.</p> : (
            <ul className="small muted" style={{ paddingLeft: "1.1rem" }}>
              {report.blocked.map((b) => <li key={b.key}>{b.key} · {b.title}: {b.detail}</li>)}
            </ul>
          )}
        </section>
      </div>
      <p className="small" style={{ marginTop: "1.5rem" }}>
        Generated {fmtDate(report.integrity.generated_at)}. The digest is a SHA-256 over the stored checkpoint results; re-running the report must reproduce it.
        Use the report only for the authorised scope of this engagement.
      </p>
    </div>
  );
}
