import Link from "next/link";
import {
  ArrowRight, Globe, Bot, Box, Flag, Mountain, Tent, Route, ShieldCheck, FileText, Activity, Lock, ScrollText, Server,
} from "lucide-react";
import { Brand } from "@/components/AppShell";
import { MountainArt } from "@/components/Mountain";

const MODES = [
  { icon: <Globe size={20} />, title: "Website URL", body: "Probes a public site for exposed files, header gaps, CORS and reflected-input weaknesses, and verifies Blue controls such as HSTS, CSP and cookie flags." },
  { icon: <Bot size={20} />, title: "Model API (adapters)", body: "Sends controlled prompts through generic or OpenAI-compatible adapters to test prompt injection, instruction leakage, refusals and throttling." },
  { icon: <Box size={20} />, title: "Sandbox worker", body: "Runs bundled probes in a scrubbed child process with CPU, memory and network checks, so isolation claims are measured, not assumed." },
];

const STEPS = [
  { num: "1", icon: <Tent size={18} />, title: "Base Camp · setup", items: ["Register an authorised target", "Configure the evaluation", "Check connectivity and permissions"] },
  { num: "2", icon: <Route size={18} />, title: "The Ascent · evaluation", items: ["Red: controlled adversarial tests", "Blue: defensive control checks", "Click any checkpoint for evidence"] },
  { num: "3", icon: <Flag size={18} />, title: "The Summit · results", items: ["Findings, metrics and evidence", "Remaining weaknesses and failed checks", "Exportable, traceable final report"] },
];

const FEATURES = [
  { icon: <ShieldCheck size={20} />, title: "Authorised scope by design", body: "Every target needs an attestation. Private, loopback and cloud-metadata addresses are blocked by an SSRF guard." },
  { icon: <Lock size={20} />, title: "Credentials stay server-side", body: "Target secrets are encrypted at rest, never returned by the API, and redacted from evidence. Sessions use HttpOnly cookies." },
  { icon: <Activity size={20} />, title: "Live Red and Blue routes", body: "Watch checkpoints move from pending to running to passed, failed, blocked or error as the worker executes them." },
  { icon: <FileText size={20} />, title: "Evidence-backed reports", body: "Each finding carries observed behaviour, remediation guidance and a SHA-256 digest of the stored results." },
  { icon: <ScrollText size={20} />, title: "Tamper-evident audit trail", body: "Every action is written to a hash-chained log. Anyone can verify the chain and detect edits." },
  { icon: <Server size={20} />, title: "Role-based access", body: "Admins manage users, analysts run evaluations, viewers read summaries without raw evidence." },
];

const ROADMAP = [
  { when: "Near term", items: ["Mobile-friendly dashboard", "Broader test library", "Reporting with remediation guidance"] },
  { when: "Mid term", items: ["More target integrations and evaluation methods", "Compare models and versions", "Enterprise SSO and CI/CD hooks"] },
  { when: "Long term", items: ["Native mobile app if demand exists", "More models, global users, multi-region", "Stronger isolation and AI model improvements"] },
];

export default function LandingPage() {
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Brand />
          <div className="spacer" />
          <nav className="nav-links" aria-label="Page sections">
            <a href="#how">How it works</a>
            <a href="#modes">Test modes</a>
            <a href="#architecture">Architecture</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
          <Link className="btn btn-primary btn-sm" href="/login">Sign in</Link>
        </div>
      </header>

      <section className="hero">
        <MountainArt />
        <div className="container" style={{ position: "relative" }}>
          <span className="eyebrow"><Mountain size={14} aria-hidden /> Sentin AI · Securing adversarial AI safety testing</span>
          <h1>Every AI safety test is a <span className="gradient">climb toward trust.</span></h1>
          <p className="lead">
            Sentin AI runs controlled, authorised safety tests against websites, model APIs and isolated sandboxes.
            Red and Blue routes run side by side, findings come with evidence, and the whole evaluation ends in one
            report you can reproduce.
          </p>
          <div className="row" style={{ marginTop: "1.5rem" }}>
            <Link className="btn btn-primary" href="/login?mode=register">Start an evaluation <ArrowRight size={16} aria-hidden /></Link>
            <Link className="btn" href="/login">I already have an account</Link>
          </div>
          <p className="small" style={{ marginTop: "1.25rem" }}>
            Built by team <b style={{ color: "var(--text)" }}>Invictus</b> · MD Rashid Hussain (Frontend &amp; Design) · Arpit Kumar (Backend &amp; Logic)
          </p>
        </div>
      </section>

      <section className="section" id="problem" style={{ paddingTop: 0 }}>
        <div className="container grid grid-3">
          {[
            ["Unsafe outputs", "AI systems can produce unsafe or policy-violating outputs, and teams rarely see them until users do."],
            ["No shared criteria", "Safety evaluation needs structured tests and consistent criteria, not ad-hoc prompts in a notebook."],
            ["Untraceable results", "Teams need traceable findings and evidence they can inspect and reproduce, not a single opaque score."],
          ].map(([t, b]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p style={{ margin: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Solution</span>
            <h2 style={{ marginTop: "0.75rem" }}>One workflow for every target type</h2>
            <p>Register a target, configure the run, execute structured tests, then read the results. The same workflow covers websites, model APIs and sandboxes.</p>
          </div>
          <div className="flow">
            {STEPS.map((s) => (
              <div className="card" key={s.num}>
                <div className="row" style={{ marginBottom: "0.75rem" }}>
                  <span className="feature"><span className="icon">{s.icon}</span></span>
                  <span className="small muted mono">STEP {s.num}</span>
                </div>
                <h3>{s.title}</h3>
                <ul className="muted" style={{ paddingLeft: "1.1rem", margin: 0 }}>
                  {s.items.map((i) => <li key={i} style={{ marginBottom: "0.35rem" }}>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="modes" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Test modes</span>
            <h2 style={{ marginTop: "0.75rem" }}>Three ways to test, one way to read results</h2>
          </div>
          <div className="grid grid-3">
            {MODES.map((m) => (
              <div className="card feature" key={m.title}>
                <span className="icon">{m.icon}</span>
                <h3>{m.title}</h3>
                <p style={{ margin: 0 }}>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Platform</span>
            <h2 style={{ marginTop: "0.75rem" }}>Built for trust, not just coverage</h2>
          </div>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card feature" key={f.title}>
                <span className="icon">{f.icon}</span>
                <h3 style={{ margin: 0 }}>{f.title}</h3>
                <p style={{ margin: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="architecture" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Architecture</span>
            <h2 style={{ marginTop: "0.75rem" }}>Dashboard → API → queue → isolated workers → evidence</h2>
            <p>The browser talks only to the Next.js app. The FastAPI backend owns auth, RBAC and orchestration. A background worker executes checks and writes results, evidence and audit records.</p>
          </div>
          <div className="card">
            <div className="arch">
              <div className="box"><b>Dashboard</b><span>Next.js · TypeScript</span></div>
              <div className="arrow">→</div>
              <div className="box"><b>Backend API</b><span>FastAPI · auth, RBAC, orchestration</span></div>
              <div className="arrow">→</div>
              <div className="box"><b>Evaluation queue &amp; worker</b><span>Durable DB queue · probes · scoring</span></div>
            </div>
            <div className="divider" />
            <div className="arch">
              <div className="box"><b>PostgreSQL / SQLite</b><span>targets · evaluations · findings · audit</span></div>
              <div className="arrow">·</div>
              <div className="box"><b>Sandbox probes</b><span>scrubbed, rlimit-bound child processes</span></div>
              <div className="arrow">·</div>
              <div className="box"><b>Target under test</b><span>website · model API · sandbox</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="roadmap" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Future scope</span>
            <h2 style={{ marginTop: "0.75rem" }}>Where the climb goes next</h2>
          </div>
          <div className="grid grid-3">
            {ROADMAP.map((r) => (
              <div className="card" key={r.when}>
                <h3>{r.when}</h3>
                <ul className="muted" style={{ paddingLeft: "1.1rem", margin: 0 }}>
                  {r.items.map((i) => <li key={i} style={{ marginBottom: "0.35rem" }}>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <h2>Ready to take the first step?</h2>
          <p style={{ maxWidth: "60ch", margin: "0 auto 1.25rem" }}>
            Try the built-in demo targets to see Red and Blue routes update from real states. Then point Sentin at an
            authorised system of your own.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" href="/login?mode=register">Create an account</Link>
            <Link className="btn" href="/login">Sign in</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container row between">
          <span>© {new Date().getFullYear()} Team Invictus · Sentin AI</span>
          <span>Use only on systems you are authorised to test.</span>
        </div>
      </footer>
    </>
  );
}
