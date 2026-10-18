export type Role = "admin" | "analyst" | "viewer";
export type TargetKind = "website" | "model_api" | "sandbox";
export type Route = "red" | "blue";
export type CheckStatus = "pending" | "running" | "passed" | "failed" | "blocked" | "error";
export type EvalStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Target {
  id: number;
  name: string;
  kind: TargetKind;
  endpoint: string;
  adapter: "generic" | "openai" | null;
  description: string;
  has_credential: boolean;
  credential_header: string | null;
  is_demo: boolean;
  authorization_attested_by: string;
  authorized_at: string;
  created_at: string;
}

export interface Checkpoint {
  id: number;
  position: number;
  test_key: string;
  route: Route;
  category: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  detail: string;
  remediation: string;
  evidence: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RouteScore {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  error: number;
  resilience_score: number | null;
}

export interface Summary {
  routes: Record<Route, RouteScore>;
  categories: Record<string, { passed: number; failed: number; blocked: number; error: number; score: number | null }>;
  severity_counts: Record<Severity, number>;
  findings: number;
  overall_score: number | null;
  posture: string;
  checkpoints: number;
  blocked: number;
  errors: number;
}

export interface Evaluation {
  id: number;
  target_id: number;
  target_name: string;
  target_kind: TargetKind;
  status: EvalStatus;
  created_by: string;
  test_keys: string[];
  summary: Summary | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  results: Checkpoint[];
}

export interface CatalogItem {
  key: string;
  route: Route;
  kind: TargetKind;
  category: string;
  title: string;
  severity: Severity;
  description: string;
  remediation: string;
}

export interface Report {
  evaluation_id: number;
  target: { name: string; kind: TargetKind; endpoint: string };
  status: EvalStatus;
  started_at: string | null;
  finished_at: string | null;
  summary: Summary | null;
  findings: {
    key: string;
    route: Route;
    severity: Severity;
    title: string;
    category: string;
    detail: string;
    remediation: string;
    evidence: Record<string, unknown> | null;
  }[];
  passed: { key: string; title: string; route: Route }[];
  blocked: { key: string; title: string; detail: string }[];
  integrity: { results_sha256: string; generated_at: string };
}

export interface AuditRecord {
  id: number;
  ts: string;
  actor: string;
  action: string;
  subject: string;
  detail: Record<string, unknown>;
  hash: string;
  prev_hash: string;
}

export interface Stats {
  targets: number;
  evaluations: number;
  by_status: Record<string, number>;
  open_findings: number;
  average_score: number | null;
  severity_counts: Record<Severity, number>;
  recent: Evaluation[];
  checks_in_library: number;
}
