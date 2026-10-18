"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PlugZap, Play, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { KIND_LABEL, ROUTE_LABEL, fmtDate } from "@/lib/format";
import type { CatalogItem, Evaluation, Target } from "@/lib/types";
import { EvalPill, Empty, PageHead, SeverityPill, Spinner } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, user } = useUser();
  const [target, setTarget] = useState<Target | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [verify, setVerify] = useState<{ reachable: boolean; detail: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tests = useMemo(() => catalog.filter((c) => target && c.kind === target.kind), [catalog, target]);

  async function load() {
    try {
      const [t, cat, evals] = await Promise.all([
        api.get<Target>(`/targets/${id}`),
        api.get<CatalogItem[]>("/catalog"),
        api.get<Evaluation[]>(`/evaluations?target_id=${id}`),
      ]);
      setTarget(t);
      setCatalog(cat);
      setHistory(evals);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelected(new Set(tests.map((t) => t.key)));
  }, [tests]);

  async function runVerify() {
    setBusy("verify");
    setVerify(null);
    try {
      setVerify(await api.post<{ reachable: boolean; detail: string }>(`/targets/${id}/verify`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function startRun() {
    setBusy("run");
    setError(null);
    try {
      const keys = selected.size === tests.length ? undefined : [...selected];
      const ev = await api.post<Evaluation>("/evaluations", { target_id: Number(id), test_keys: keys ?? null });
      router.push(`/evaluations/${ev.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this target and its evaluation history? This cannot be undone.")) return;
    setBusy("delete");
    try {
      await api.del(`/targets/${id}`);
      router.replace("/targets");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (error && !target) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!target) return <Spinner label="Loading target" />;

  const canDelete = !target.is_demo || user.role === "admin";
  const red = tests.filter((t) => t.route === "red");
  const blue = tests.filter((t) => t.route === "blue");

  return (
    <>
      <PageHead
        crumbs={<Link href="/targets">Targets</Link>}
        title={target.name}
        subtitle={<span className="mono" style={{ overflowWrap: "anywhere" }}>{target.endpoint}</span>}
        actions={
          <>
            <span className="pill">{KIND_LABEL[target.kind]}</span>
            {target.is_demo && <span className="pill">demo target</span>}
          </>
        }
      />

      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card" aria-labelledby="base-h">
          <h2 id="base-h">Base Camp · setup &amp; check</h2>
          <p className="small">{target.description || "No description provided."}</p>
          <dl className="kv" style={{ margin: "1rem 0" }}>
            <dt>Authorised by</dt><dd>{target.authorization_attested_by || "—"}</dd>
            <dt>Authorised at</dt><dd>{fmtDate(target.authorized_at)}</dd>
            <dt>Credential</dt><dd>{target.has_credential ? `Stored (sent as ${target.credential_header})` : "None"}</dd>
            {target.adapter && <><dt>Adapter</dt><dd>{target.adapter}</dd></>}
          </dl>
          <div className="row">
            {can("analyst") && (
              <button className="btn" onClick={runVerify} disabled={busy !== null}>
                <PlugZap size={16} aria-hidden /> {busy === "verify" ? "Checking…" : "Check connectivity"}
              </button>
            )}
            {canDelete && can("analyst") && (
              <button className="btn btn-danger" onClick={remove} disabled={busy !== null}>
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            )}
          </div>
          {verify && (
            <div className={`alert ${verify.reachable ? "alert-ok" : "alert-error"}`} role="status" style={{ marginTop: "1rem" }}>
              <span className="row" style={{ gap: "0.5rem" }}>
                {verify.reachable ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
                {verify.reachable ? "Reachable" : "Not reachable"} — {verify.detail}
              </span>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="ascent-h">
          <h2 id="ascent-h">The Ascent · configure run</h2>
          <p className="small">Choose checkpoints. Red attacks the target; Blue verifies defensive controls. Burst checks run last.</p>
          {tests.length === 0 ? (
            <Empty title="No checkpoints for this target type" />
          ) : (
            <div className="grid grid-2" style={{ gap: "0.9rem", marginTop: "0.75rem" }}>
              {[{ label: ROUTE_LABEL.red, items: red, cls: "lane-red" }, { label: ROUTE_LABEL.blue, items: blue, cls: "lane-blue" }].map((group) => (
                <div key={group.label} className={`card card-tight ${group.cls}`} style={{ boxShadow: "none" }}>
                  <div className="row between" style={{ marginBottom: "0.4rem" }}>
                    <b>{group.label}</b>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected((prev) => {
                      const next = new Set(prev);
                      const all = group.items.every((i) => next.has(i.key));
                      group.items.forEach((i) => (all ? next.delete(i.key) : next.add(i.key)));
                      return next;
                    })}>Toggle all</button>
                  </div>
                  {group.items.map((c) => (
                    <label key={c.key} className="check" style={{ padding: "0.35rem 0" }}>
                      <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                      <span style={{ color: "var(--text)", fontSize: "0.9rem" }}>
                        <span className="mono small muted">{c.key}</span> {c.title} <SeverityPill severity={c.severity} />
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="row between" style={{ marginTop: "1rem" }}>
            <span className="small muted">{selected.size} of {tests.length} selected</span>
            {can("analyst") ? (
              <button className="btn btn-primary" onClick={startRun} disabled={busy !== null || selected.size === 0}>
                <Play size={16} aria-hidden /> {busy === "run" ? "Starting…" : "Start evaluation"}
              </button>
            ) : (
              <span className="small muted">Viewers cannot start evaluations.</span>
            )}
          </div>
        </section>
      </div>

      <section style={{ marginTop: "1.5rem" }} aria-labelledby="hist-h">
        <h2 id="hist-h">Evaluation history</h2>
        {history.length === 0 ? (
          <Empty title="No evaluations yet">Start the first run above.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Run</th><th>Started</th><th>Status</th><th>Resilience</th><th>Findings</th></tr></thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/evaluations/${e.id}`}>#{e.id}</Link></td>
                    <td>{fmtDate(e.created_at)}</td>
                    <td><EvalPill status={e.status} /></td>
                    <td className="mono">{e.summary?.overall_score != null ? Math.round(e.summary.overall_score) : "—"}</td>
                    <td>{e.summary ? e.summary.findings : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
