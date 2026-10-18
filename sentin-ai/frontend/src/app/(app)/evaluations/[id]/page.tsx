"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Download, Square, Crosshair, Shield, Flag, Tent, Route } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { EVAL_LABEL, KIND_LABEL, ROUTE_LABEL, fmtDate, fmtDuration, isActive, scoreTone } from "@/lib/format";
import type { Checkpoint, Evaluation, Route as RouteName } from "@/lib/types";
import { EvalPill, Empty, MiniBar, PageHead, ScoreRing, SeverityBar, SeverityPill, Spinner, StatusPill } from "@/components/ui";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { useUser } from "@/components/AppShell";

const NODE_GLYPH: Record<string, string> = { passed: "✓", failed: "✕", blocked: "‖", error: "!", running: "…", pending: "" };

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useUser();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Checkpoint | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setEv(await api.get<Evaluation>(`/evaluations/${id}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  // Live updates: poll while the worker is still executing checkpoints.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ev || !isActive(ev.status)) return;
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [ev, load]);

  const results = ev?.results ?? [];
  const done = results.filter((r) => !["pending", "running"].includes(r.status)).length;
  const percent = results.length ? Math.round((done / results.length) * 100) : 0;
  const lanes = useMemo(() => ({
    red: results.filter((r) => r.route === "red"),
    blue: results.filter((r) => r.route === "blue"),
  }), [results]);

  // Keep the open drawer in sync with live updates.
  const openLive = open && results.find((r) => r.id === open.id);

  async function cancel() {
    setCancelling(true);
    try {
      await api.post(`/evaluations/${id}/cancel`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  }

  if (error && !ev) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!ev) return <Spinner label="Loading evaluation" />;

  const stage = ev.status === "queued" ? 0 : ev.status === "running" ? 1 : 2;
  const finished = !isActive(ev.status);
  const summary = ev.summary;

  return (
    <>
      <PageHead
        crumbs={<><Link href="/targets">Targets</Link> / <Link href={`/targets/${ev.target_id}`}>{ev.target_name}</Link> / Run #{ev.id}</>}
        title={`Evaluation #${ev.id}`}
        subtitle={`${KIND_LABEL[ev.target_kind]} · started by ${ev.created_by} · ${fmtDate(ev.created_at)} · ${fmtDuration(ev.started_at, ev.finished_at)}`}
        actions={
          <>
            <EvalPill status={ev.status} />
            {finished && (
              <>
                <Link className="btn" href={`/evaluations/${ev.id}/report`}><FileText size={16} aria-hidden /> Report</Link>
                <a className="btn" href={`/api/evaluations/${ev.id}/report.md`} download><Download size={16} aria-hidden /> Markdown</a>
              </>
            )}
            {can("analyst") && isActive(ev.status) && (
              <button className="btn btn-danger" onClick={cancel} disabled={cancelling}><Square size={14} aria-hidden /> {cancelling ? "Cancelling…" : "Cancel run"}</button>
            )}
          </>
        }
      />

      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {ev.error && <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{ev.error}</div>}

      <section className="card" aria-label="Evaluation progress" style={{ marginBottom: "1.25rem" }}>
        <div className="stepper">
          {[
            { icon: <Tent size={16} aria-hidden />, title: "Base Camp", sub: "Setup & connectivity" },
            { icon: <Route size={16} aria-hidden />, title: "The Ascent", sub: "Red & Blue checkpoints" },
            { icon: <Flag size={16} aria-hidden />, title: "The Summit", sub: "Results & report" },
          ].map((s, i) => (
            <div key={s.title} className={`step ${i < stage || (finished && i <= 2) ? "done" : ""} ${i === stage && !finished ? "active" : ""}`}>
              <span className="num">{i + 1}</span>
              <span>
                <span className="title row" style={{ gap: "0.35rem" }}>{s.icon}{s.title}</span>
                <span className="sub">{s.sub}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="row between small muted" style={{ marginTop: "1rem" }}>
          <span>{done} of {results.length} checkpoints complete · {EVAL_LABEL[ev.status]}</span>
          <span className="mono">{percent}%</span>
        </div>
        <div className="progress" style={{ marginTop: "0.4rem" }} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Checkpoint progress">
          <span style={{ width: `${percent}%` }} />
        </div>
      </section>

      <div className="lanes">
        {(["red", "blue"] as RouteName[]).map((route) => (
          <Lane key={route} route={route} items={lanes[route]} onOpen={setOpen} />
        ))}
      </div>

      {finished && summary && (
        <section style={{ marginTop: "1.5rem" }} aria-labelledby="summit-h">
          <h2 id="summit-h">The Summit · results</h2>
          <div className="grid grid-3" style={{ alignItems: "stretch" }}>
            <div className="card row" style={{ justifyContent: "center" }}>
              <ScoreRing score={summary.overall_score} label="Overall" />
              <div>
                <div className={`pill pill-${summary.posture === "strong" ? "completed" : summary.posture === "critical" ? "critical" : summary.posture === "high" ? "high" : "medium"}`} style={{ textTransform: "capitalize" }}>Posture: {summary.posture}</div>
                <p className="small" style={{ marginTop: "0.6rem" }}>{summary.findings} finding{summary.findings === 1 ? "" : "s"} · {summary.blocked} blocked · {summary.errors} error</p>
              </div>
            </div>
            <div className="card">
              <h3>Route scores</h3>
              {(["red", "blue"] as RouteName[]).map((r) => {
                const s = summary.routes[r];
                return (
                  <div key={r} style={{ marginBottom: "0.9rem" }}>
                    <div className="row between small"><span>{ROUTE_LABEL[r]}</span><b className={`mono tone-${scoreTone(s.resilience_score)}`}>{s.resilience_score ?? "—"}</b></div>
                    <MiniBar passed={s.passed} failed={s.failed} blocked={s.blocked} error={s.error} />
                    <div className="small muted">{s.passed} passed · {s.failed} failed · {s.blocked} blocked</div>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <h3>Severity of findings</h3>
              <SeverityBar counts={summary.severity_counts} />
            </div>
          </div>

          <div className="card" style={{ marginTop: "1.25rem" }}>
            <h3>By category</h3>
            <div className="table-wrap" style={{ marginTop: "0.5rem", boxShadow: "none" }}>
              <table>
                <thead><tr><th>Category</th><th>Score</th><th>Passed</th><th>Failed</th><th>Blocked / error</th></tr></thead>
                <tbody>
                  {Object.entries(summary.categories).map(([name, c]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className={`mono tone-${scoreTone(c.score)}`}>{c.score ?? "—"}</td>
                      <td>{c.passed}</td>
                      <td>{c.failed}</td>
                      <td>{c.blocked + c.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {finished && (
        <section style={{ marginTop: "1.5rem" }} aria-labelledby="findings-h">
          <h2 id="findings-h">Findings</h2>
          {results.filter((r) => r.status === "failed").length === 0 ? (
            <Empty title="No findings">Every executed checkpoint passed.</Empty>
          ) : (
            <div className="stack">
              {results.filter((r) => r.status === "failed").map((r) => (
                <button key={r.id} className="card card-tight feature" style={{ textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => setOpen(r)}>
                  <div className="row between">
                    <span className="row" style={{ gap: "0.5rem" }}><SeverityPill severity={r.severity} /> <b>{r.title}</b></span>
                    <span className="small muted mono">{r.test_key} · {ROUTE_LABEL[r.route]}</span>
                  </div>
                  <div className="small">{r.detail}</div>
                  <div className="small muted"><b>Fix:</b> {r.remediation}</div>
                </button>
              ))}
            </div>
          )}
          {user.role === "viewer" && <p className="small" style={{ marginTop: "0.75rem" }}>Viewer access: evidence payloads are hidden.</p>}
        </section>
      )}

      {openLive && <EvidenceDrawer checkpoint={openLive} onClose={() => setOpen(null)} evidenceVisible={user.role !== "viewer"} />}
    </>
  );
}

function Lane({ route, items, onOpen }: { route: RouteName; items: Checkpoint[]; onOpen: (c: Checkpoint) => void }) {
  const passed = items.filter((i) => i.status === "passed").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const icon = route === "red" ? <Crosshair size={16} aria-hidden /> : <Shield size={16} aria-hidden />;
  const blurb = route === "red"
    ? "Controlled adversarial tests. Passed = attack resisted."
    : "Defensive control checks. Passed = control in place.";
  return (
    <section className={`lane lane-${route}`} aria-labelledby={`lane-${route}`}>
      <div className="lane-head">
        <h2 id={`lane-${route}`} className="row" style={{ gap: "0.5rem" }}>{icon}{ROUTE_LABEL[route]}</h2>
        <span className="small muted">{passed} passed · {failed} failed</span>
      </div>
      <p className="small" style={{ marginBottom: "0.75rem" }}>{blurb}</p>
      {items.length === 0 ? (
        <Empty title="No checkpoints on this route" />
      ) : (
        <ol className="trail" style={{ listStyle: "none" }}>
          {items.map((c) => (
            <li key={c.id}>
              <button
                className={`checkpoint ${c.status === "running" ? "is-running" : ""} ${c.status === "failed" ? "is-failed" : ""}`}
                onClick={() => onOpen(c)}
                aria-label={`${c.title}: ${c.status}. Open details`}
              >
                <span className={`node node-${c.status}`} aria-hidden>{NODE_GLYPH[c.status]}</span>
                <span className="label">
                  <span className="t">{c.title}</span>
                  <span className="m" style={{ display: "block" }}>{c.status === "pending" ? "Queued" : c.detail || c.category}</span>
                </span>
                <span className="row" style={{ gap: "0.4rem" }}>
                  <SeverityPill severity={c.severity} />
                  <StatusPill status={c.status} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
