import type { CheckStatus, EvalStatus, Route, Severity, TargetKind } from "./types";

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start.endsWith("Z") ? start : `${start}Z`).getTime();
  const e = end ? new Date(end.endsWith("Z") ? end : `${end}Z`).getTime() : Date.now();
  const sec = Math.max(0, Math.round((e - s) / 1000));
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export const KIND_LABEL: Record<TargetKind, string> = {
  website: "Website",
  model_api: "Model API",
  sandbox: "Sandbox",
};

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  error: "Error",
};

export const EVAL_LABEL: Record<EvalStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const ROUTE_LABEL: Record<Route, string> = { red: "Red route", blue: "Blue route" };

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function scoreTone(score: number | null | undefined): "good" | "warn" | "bad" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 85) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

export function isActive(status: EvalStatus): boolean {
  return status === "queued" || status === "running";
}
