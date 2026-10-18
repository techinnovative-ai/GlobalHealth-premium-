"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { Checkpoint } from "@/lib/types";
import { ROUTE_LABEL, STATUS_LABEL } from "@/lib/format";
import { SeverityPill, StatusPill } from "./ui";

interface Props {
  checkpoint: Checkpoint;
  onClose: () => void;
  evidenceVisible: boolean;
}

export function EvidenceDrawer({ checkpoint: c, onClose, evidenceVisible }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="small muted mono">{c.test_key} · {ROUTE_LABEL[c.route]} · {c.category}</div>
            <h2 id="drawer-title" style={{ marginTop: "0.3rem" }}>{c.title}</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close checkpoint details">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="row" style={{ margin: "0.9rem 0 1.1rem" }}>
          <StatusPill status={c.status} />
          <SeverityPill severity={c.severity} />
          {c.finished_at && <span className="small muted">Finished {new Date(c.finished_at.endsWith("Z") ? c.finished_at : `${c.finished_at}Z`).toLocaleTimeString()}</span>}
        </div>

        <h3>Observed</h3>
        <p style={{ color: "var(--text)" }}>{c.detail || "Not executed yet."}</p>

        <h3 style={{ marginTop: "1.1rem" }}>Remediation</h3>
        <p>{c.remediation}</p>

        <h3 style={{ marginTop: "1.1rem" }}>Evidence</h3>
        {!evidenceVisible ? (
          <div className="alert alert-info">Evidence is restricted to analysts and admins.</div>
        ) : c.evidence ? (
          <pre className="mono" aria-label="Raw evidence">{JSON.stringify(c.evidence, null, 2)}</pre>
        ) : (
          <p className="small">No evidence captured for this checkpoint yet ({STATUS_LABEL[c.status].toLowerCase()}).</p>
        )}
      </aside>
    </>
  );
}
