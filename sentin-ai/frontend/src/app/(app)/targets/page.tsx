"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, ShieldAlert, ChevronRight, Globe, Bot, Box } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { KIND_LABEL, fmtDate } from "@/lib/format";
import type { Target, TargetKind } from "@/lib/types";
import { Empty, PageHead, Spinner } from "@/components/ui";
import { useUser } from "@/components/AppShell";

const KIND_HINT: Record<TargetKind, string> = {
  website: "A public HTTPS website you own or are authorised to test. Example: https://shop.example.com",
  model_api: "An HTTP endpoint that accepts a prompt and returns text (generic JSON or OpenAI-compatible chat).",
  sandbox: "A bundled probe environment. The endpoint is fixed to sandbox://python-probe.",
};

const KIND_ICON: Record<TargetKind, React.ReactNode> = {
  website: <Globe size={18} aria-hidden />,
  model_api: <Bot size={18} aria-hidden />,
  sandbox: <Box size={18} aria-hidden />,
};

export default function TargetsPage() {
  const { can, user } = useUser();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTargets(await api.get<Target[]>("/targets"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("new") === "1") setShowForm(true);
  }, []);

  return (
    <>
      <PageHead
        crumbs={<span>Workspace / Targets</span>}
        title="Targets"
        subtitle="Registered systems under evaluation. Every target carries an authorisation attestation."
        actions={can("analyst") && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
            <Plus size={16} aria-hidden /> {showForm ? "Close form" : "Register target"}
          </button>
        )}
      />

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {showForm && can("analyst") && <TargetForm onCreated={() => { setShowForm(false); load(); }} />}

      {!targets ? (
        <Spinner label="Loading targets" />
      ) : targets.length === 0 ? (
        <Empty title="No targets yet">Register a website, model API or sandbox to begin.</Empty>
      ) : (
        <div className="grid grid-3">
          {targets.map((t) => (
            <Link key={t.id} href={`/targets/${t.id}`} className="card feature" style={{ color: "inherit", textDecoration: "none" }}>
              <div className="row between">
                <span className="feature"><span className="icon">{KIND_ICON[t.kind]}</span></span>
                <span className="row" style={{ gap: "0.4rem" }}>
                  {t.is_demo && <span className="pill">demo</span>}
                  <span className="pill">{KIND_LABEL[t.kind]}</span>
                </span>
              </div>
              <h3 style={{ margin: 0 }}>{t.name}</h3>
              <div className="small mono muted" style={{ overflowWrap: "anywhere" }}>{t.endpoint}</div>
              <p className="small" style={{ margin: 0 }}>{t.description || KIND_HINT[t.kind]}</p>
              <div className="row between small muted">
                <span>{t.has_credential ? "🔒 credential stored" : "No credential"}</span>
                <span className="row" style={{ gap: "0.2rem" }}>Open <ChevronRight size={14} aria-hidden /></span>
              </div>
              <div className="small muted">Registered {fmtDate(t.created_at)}{user.role === "admin" && ` · by ${t.authorization_attested_by}`}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function TargetForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TargetKind>("website");
  const [endpoint, setEndpoint] = useState("https://");
  const [adapter, setAdapter] = useState<"generic" | "openai">("generic");
  const [description, setDescription] = useState("");
  const [credentialHeader, setCredentialHeader] = useState("Authorization");
  const [credentialValue, setCredentialValue] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind === "sandbox") setEndpoint("sandbox://python-probe");
    else if (endpoint.startsWith("sandbox://")) setEndpoint("https://");
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!attested) {
      setError("Confirm that you are authorised to test this target.");
      return;
    }
    setBusy(true);
    try {
      await api.post<Target>("/targets", {
        name,
        kind,
        endpoint,
        adapter: kind === "model_api" ? adapter : null,
        description,
        credential_header: credentialValue ? credentialHeader : null,
        credential_value: credentialValue || null,
        authorization_attested: attested,
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: "1.5rem" }} aria-labelledby="new-target-h" noValidate>
      <h2 id="new-target-h">Register a target</h2>
      <p className="small" style={{ marginBottom: "1rem" }}>Only register systems you own or have written permission to test. Private and metadata addresses are blocked.</p>
      <div className="form-grid">
        <label className="field">Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} placeholder="Checkout site (staging)" />
        </label>
        <label className="field">Type
          <select value={kind} onChange={(e) => setKind(e.target.value as TargetKind)}>
            <option value="website">Website URL</option>
            <option value="model_api">Model API</option>
            <option value="sandbox">Sandbox worker</option>
          </select>
        </label>
        <label className="field full">Endpoint
          <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required disabled={kind === "sandbox"} className="mono" />
          <span className="small">{KIND_HINT[kind]}</span>
        </label>
        {kind === "model_api" && (
          <label className="field">Adapter
            <select value={adapter} onChange={(e) => setAdapter(e.target.value as "generic" | "openai")}>
              <option value="generic">Generic JSON (&#123;"prompt"&#125; → text)</option>
              <option value="openai">OpenAI-compatible chat</option>
            </select>
          </label>
        )}
        {kind !== "sandbox" && (
          <>
            <label className="field">Credential header (optional)
              <input type="text" value={credentialHeader} onChange={(e) => setCredentialHeader(e.target.value)} maxLength={80} className="mono" />
            </label>
            <label className="field">Credential value (optional, encrypted at rest)
              <input type="password" value={credentialValue} onChange={(e) => setCredentialValue(e.target.value)} maxLength={2000} autoComplete="off" />
            </label>
          </>
        )}
        <label className="field full">Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What this system does and who owns it" />
        </label>
        <div className="full">
          <label className="check">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>I confirm I am authorised to test this target, I will keep runs within the agreed scope, and results will be handled as confidential.</span>
          </label>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert" style={{ marginTop: "1rem" }}><ShieldAlert size={14} aria-hidden /> {error}</div>}
      <div className="row" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Registering…" : "Register target"}</button>
      </div>
    </form>
  );
}
