import type { CSSProperties, ReactNode } from "react";
import {
  EVAL_LABEL,
  STATUS_LABEL,
  SEVERITY_ORDER,
  scoreTone,
} from "@/lib/format";
import type { CheckStatus, EvalStatus, Severity } from "@/lib/types";

export function StatusPill({ status }: { status: CheckStatus }) {
  return (
    <span className={`pill pill-${status}`}>
      <span className="dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EvalPill({ status }: { status: EvalStatus }) {
  return (
    <span className={`pill pill-${status}`}>
      <span className="dot" aria-hidden />
      {EVAL_LABEL[status]}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <span className={`pill pill-${severity}`}>{severity}</span>;
}

export function ScoreRing({ score, label = "Resilience" }: { score: number | null | undefined; label?: string }) {
  const value = score ?? 0;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  const color = tone === "good" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--pending)";
  return (
    <div className="score-ring" role="img" aria-label={`${label} score ${score ?? "not available"}`}>
      <svg viewBox="0 0 150 150" aria-hidden>
        <circle cx="75" cy="75" r={radius} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="12" />
        <circle
          cx="75" cy="75" r={radius} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div className="center">
        <div>
          <div style={{ fontSize: "1.9rem", lineHeight: 1 }}>{score === null || score === undefined ? "—" : Math.round(score)}</div>
          <small>{label}</small>
        </div>
      </div>
    </div>
  );
}

export function SeverityBar({ counts }: { counts: Partial<Record<Severity, number>> }) {
  const total = SEVERITY_ORDER.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const colors: Record<Severity, string> = {
    critical: "#f43f5e", high: "#fb7185", medium: "#fbbf24", low: "#7dd3fc", info: "#64748b",
  };
  return (
    <div>
      <div className="bar" aria-hidden style={{ height: 10 }}>
        {total === 0 ? <span className="bar-ok" style={{ width: "100%" }} /> : SEVERITY_ORDER.map((s) => (
          <span key={s} style={{ width: `${((counts[s] ?? 0) / total) * 100}%`, background: colors[s] }} />
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: "0.6rem", gap: "0.9rem" }}>
        {SEVERITY_ORDER.map((s) => (
          <span key={s}>
            <span style={{ color: colors[s] }}>●</span> {s} <b style={{ color: "var(--text)" }}>{counts[s] ?? 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniBar({ passed, failed, blocked, error }: { passed: number; failed: number; blocked: number; error: number }) {
  const total = passed + failed + blocked + error;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  return (
    <div className="bar" aria-hidden>
      <span className="bar-ok" style={{ width: pct(passed) }} />
      <span className="bar-bad" style={{ width: pct(failed) }} />
      <span className="bar-blocked" style={{ width: pct(blocked) }} />
      <span className="bar-warn" style={{ width: pct(error) }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.25rem" }}>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function PageHead({ crumbs, title, subtitle, actions }: {
  crumbs?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div>
      {crumbs && <div className="crumbs">{crumbs}</div>}
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  const style: CSSProperties = { display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--line-strong)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" };
  return (
    <span role="status" className="row small muted" style={{ gap: "0.5rem" }}>
      <span style={style} aria-hidden /> {label}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}
