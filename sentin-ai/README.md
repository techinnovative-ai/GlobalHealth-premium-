# Sentin AI — AI Safety Evaluator

> *Every AI safety test is a climb toward trust.*

Sentin AI runs **controlled, authorised safety tests** against websites, model APIs and isolated sandboxes.
Red and Blue routes run side by side, every checkpoint carries evidence, and each evaluation ends in a
report that can be reproduced.

Built by **Team Invictus** (MD Rashid Hussain — Frontend & Design; Arpit Kumar — Backend & Logic), based on the
project deck *"Sentin AI (Title TBD) · Securing Adversarial AI Safety Testing Infrastructure"*.

---

## What is in the box

| Layer | Stack | Highlights |
|---|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript | Mountain-themed landing page, live Red/Blue lanes, checkpoint evidence drawer, score ring, printable report, audit viewer, user admin |
| Backend API | FastAPI · SQLAlchemy 2 · Pydantic 2 | Cookie sessions (HttpOnly), RBAC (admin / analyst / viewer), CSRF header check, login throttling, security headers |
| Evaluation engine | Python worker over a durable DB queue | 29 checkpoints across three target types (Red and Blue routes), atomic claim, cancel, interleaved execution |
| Storage | SQLite by default · PostgreSQL supported | Targets, evaluations, results + evidence, hash-chained audit log |
| Security | scrypt passwords · Fernet-encrypted credentials · SSRF guard | Private/metadata addresses blocked, credentials never returned by the API |

### Deck → implementation

| Deck item | Where it lives |
|---|---|
| Base Camp · register target, configure, check connectivity | `targets/[id]` page · `POST /api/targets`, `POST /api/targets/{id}/verify` |
| The Ascent · Red & Blue routes, click checkpoints for evidence | `evaluations/[id]` lanes + drawer · `backend/app/checks.py` |
| The Summit · findings, metrics, evidence, final report | Summit panel · `GET /api/evaluations/{id}/report` (JSON) and `/report.md` |
| Three testing modes | Website URL checks · Model API adapters (`generic`, `openai`) · Sandbox probes |
| Status legend (passed / running / pending / failed / blocked) | Checkpoint statuses, plus `error` for internal faults |
| Architecture (dashboard → API → queue → worker → storage) | `frontend/` → `backend/app/api.py` → `worker.py` / `runner.py` → DB |
| Security controls (RBAC, separation, credential protection, audit integrity) | `security.py`, `api.py` (RBAC), `netguard.py`, `audit.py` |
| Acceptance: report matches stored data | `integrity.results_sha256` in every report, computed from stored results |
| Demo sequence | Built-in demo targets (`/demo/*`) — see the walkthrough below |

---

## Quick start (development)

Requirements: Python 3.11+, Node.js 20+ (tested on 22), npm.

```bash
# 1. Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
BACKEND_URL=http://127.0.0.1:8000 npm run build && npm start      # or: npm run dev
```

Open <http://localhost:3000>.

On first start the backend creates the database, seeds an **admin** account and five demo targets.
The admin password is taken from `ADMIN_PASSWORD`; if unset, a random one is written to
`backend/data/initial_admin_password.txt` (mode 600). **Delete that file after your first sign-in.**
You can also **register** a new account from the sign-in page; new accounts are *analysts* who can run evaluations.

To run both at once: `./scripts/dev.sh`.

### Configuration

All settings are environment variables; see `.env.example`. The important ones:

| Variable | Default (dev) | Production guidance |
|---|---|---|
| `SENTIN_ENV` | `development` | `production` |
| `JWT_SECRET` | generated into `backend/data/secret.key` | **required**, ≥ 32 chars |
| `DATABASE_URL` | SQLite file | `postgresql+psycopg://…` (install `requirements-postgres.txt`) |
| `ALLOW_PRIVATE_TARGETS` | `true` | `false` (blocks private and loopback targets) |
| `ENABLE_DEMO_TARGETS` / `SEED_DEMO_DATA` | `true` | `false` |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `WORKER_EMBEDDED` | `true` | `false` and run `python -m app.worker` as its own process |
| `EVAL_STEP_DELAY_MS` | `350` | `0` |
| `BACKEND_URL` (frontend) | `http://127.0.0.1:8000` | internal URL of the API |

---

## Demo walkthrough (matches the deck's planned demo)

1. **Sign in** (or register) and open **Targets**. Five targets are pre-registered:
   - *Northwind Shop · weak demo* and *hardened demo* (websites)
   - *Northwind Assistant · weak demo* and *hardened demo* (model APIs; the hardened one needs an API key that is stored encrypted)
   - *Sandbox · Python probe*
2. **Register a target** of your own, or open a demo target and press **Check connectivity** (Base Camp).
3. **Start evaluation**. Watch the **Red** and **Blue** lanes update from real states: pending → running → passed / failed / blocked.
4. **Click a checkpoint** to open the drawer: observed behaviour, remediation and raw evidence (redacted for viewers).
5. **Read the summit**: overall and per-route resilience, severity mix, category breakdown and findings.
6. **Open the report** (print to PDF, or download Markdown).

Expected behaviour on the demos: the weak targets fail many checks (exposed `.env`, open redirect, reflected XSS,
prompt injection, system-prompt leak, harmful compliance, and so on). The hardened model passes all its checks.
The hardened website shows the Blue controls in place. Its only failure is that it's served over plain HTTP locally,
which is accurate for a localhost demo.

---

## Check library

Each checkpoint has an ID, severity, description and remediation guidance (`backend/app/checks.py`). There are 29 in total: 7 + 8 for websites, 4 + 5 for model APIs, and 2 + 3 for sandboxes.

- **Website · Red (7):** exposed secret files, directory listing, verbose errors, permissive CORS, TRACE enabled, open redirect, reflected input.
- **Website · Blue (8):** HTTPS with redirect, HSTS, CSP, clickjacking protection, `nosniff`, referrer policy, cookie flags, rate limiting.
- **Model API · Red (4):** instruction override, system-prompt disclosure, harmful-request compliance, role-play jailbreak.
- **Model API · Blue (5):** oversized input, malformed input, encoded-request refusal, authentication enforced, burst throttling.
- **Sandbox (5):** host secrets visible inside the workload, filesystem escape (Red); CPU limit, memory limit, outbound network (Blue).

Scoring is shown **per route and per category**. Resilience = passed ÷ (passed + failed). Blocked and error checkpoints
are excluded from the score and reported separately. This follows the deck's point that results should not be one number.

---

## Security model

- **Authorised scope.** Creating a target requires an explicit attestation, recorded with the user and time.
- **SSRF guard.** Only `http`/`https`; embedded credentials are rejected. Link-local and metadata addresses (`169.254.0.0/16`, `fe80::/10`) are blocked in every environment. Private and loopback addresses are blocked in production. The check runs at creation and before every probe.
- **Credentials.** Encrypted at rest (Fernet, key derived from the app secret). Never returned by the API. Redacted in evidence.
- **Sessions.** JWT in an `HttpOnly`, `SameSite=Lax` cookie. Cookie-authenticated writes need the `X-Sentin-CSRF` header, which browsers will not send cross-site. Bearer tokens are accepted for API clients.
- **Passwords.** scrypt with per-user salt. Failed logins are throttled per IP and email.
- **RBAC.** `admin` manages users. `analyst` creates targets and runs evaluations. `viewer` reads summaries, and evidence is withheld from them.
- **Audit integrity.** Every action is appended to a SHA-256 hash chain. `GET /api/audit/verify` detects any edit. The test suite covers tampering.
- **Headers.** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `no-store` on API responses.

## API overview

Interactive docs at `/api/docs` on the backend (`127.0.0.1:8000`).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` · `/login` · `/logout` | — | Account lifecycle |
| GET | `/api/auth/me` | any | Current user |
| GET/POST | `/api/targets` | any / analyst | List / register (attestation required) |
| POST | `/api/targets/{id}/verify` | analyst | Base Camp connectivity check |
| DELETE | `/api/targets/{id}` | owner / admin | Remove target and history |
| GET/POST | `/api/evaluations` | any / analyst | List / start a run |
| GET | `/api/evaluations/{id}` | any | Live state (evidence hidden for viewers) |
| POST | `/api/evaluations/{id}/cancel` | analyst | Cancel a queued or running run |
| GET | `/api/evaluations/{id}/report` · `report.md` | any | Final report (JSON / Markdown) |
| GET | `/api/catalog` | any | Check library |
| GET | `/api/audit` · `/api/audit/verify` | analyst | Audit trail and chain verification |
| GET/PATCH | `/api/users` · `/api/users/{id}` | admin | Manage roles and access |
| GET | `/api/stats` · `/api/health` | any | Dashboard data / liveness |

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q      # 22 tests: auth, RBAC, CSRF, SSRF, evaluations, report, audit tamper detection
cd frontend && npm run typecheck && npm run build
```

The backend tests start a real uvicorn server so the demo targets are exercised over HTTP, exactly as in a live run.

## Deployment

`docker-compose.yml` describes the production topology: PostgreSQL, API, a separate worker (two replicas), and the
Next.js frontend as the only published port. The frontend proxies `/api` internally, so the browser never talks to the backend directly.

```bash
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD='use-a-long-passphrase' docker compose up --build
```

> **Not verified in this build environment:** the Dockerfiles and compose file are written to the standard, but Docker
> was not available in the sandbox where this was built, so they have not been executed. The PostgreSQL URL
> path has not been run against a live database either. Both are the first things to verify in your environment.

---

## Known limitations (read before relying on results)

- **Sandbox isolation is process-level, not container-level.** The bundled probes run as child processes with a scrubbed
  environment, a temp working directory, and CPU, memory and wall-clock limits. They do **not** use namespaces or containers.
  The check `S-R02 Filesystem escape` therefore reports a real finding on this implementation: the child can still read
  files the app user can read. The deck's target design (separate isolated machines) is needed to close it.
- **Queue.** The deck's Redis + RQ design is replaced by a durable database-backed queue with atomic claims. It is simpler
  to run and still supports multiple workers. Swapping in RQ is a contained change in `worker.py`.
- **Scanner depth.** Website checks are HTTP-level probes. The deck's Playwright runner is not included, so
  JavaScript-rendered behaviour is not tested. Model-API judgements use refusal and marker heuristics. They are
  useful signals but not a substitute for human review of borderline outputs.
- **DNS rebinding.** The SSRF guard resolves a host before each probe, but the HTTP client resolves it again. A hostile
  DNS server could return a different address in between. Use network egress policy in production for a complete control.
- **Login throttle and audit chain** are in-process. With several API replicas, move the throttle to shared storage. The audit
  chain is serialised per process, so use one writer process or a database lock for multi-writer deployments.
- **Mobile dashboard, SSO, CI/CD hooks, model comparison** are roadmap items in the deck and are not implemented.

---

## Project layout

```
sentin-ai/
├── backend/
│   ├── app/
│   │   ├── api.py          REST endpoints, RBAC, CSRF
│   │   ├── checks.py       Red/Blue check library (website, model API, sandbox)
│   │   ├── probes.py       Guarded HTTP and model-adapter access
│   │   ├── netguard.py     SSRF and scope guard
│   │   ├── runner.py       Evaluation lifecycle, scoring
│   │   ├── worker.py       Background worker (embedded or standalone)
│   │   ├── demo.py         Intentionally weak and hardened demo targets
│   │   ├── audit.py        Hash-chained audit log
│   │   ├── security.py     Passwords, JWT, credential encryption, login throttle
│   │   └── main.py         App factory, seeding, lifespan
│   └── tests/              pytest suite (unit + API + end-to-end runs)
├── frontend/
│   └── src/
│       ├── app/            Routes: landing, login, dashboard, targets, evaluations, audit, admin
│       ├── components/     App shell, live lanes/drawer UI primitives, mountain artwork
│       └── lib/            Typed API client, types, formatting
├── scripts/dev.sh
├── docker-compose.yml
└── .env.example
```

## Responsible use

Sentin AI sends adversarial traffic. Only register and test systems you own or have written authorisation to test.
Keep runs within the agreed scope and handle findings as confidential.
