# RoomEase — Complete Project Explained (DevSecOps)

This document explains every part of the RoomEase project in detail — the application, the infrastructure, and the DevSecOps pipeline that ties them together.

---

## 1. What Is RoomEase

RoomEase is a full-stack hostel management system. It has two user roles:

**Admin (Hostel Warden)**
- Register students with name, room number, and hostel block
- Record student entry/exit with automatic curfew violation detection
- View and manage fines for violations (Late Return, Unauthorized Exit, etc.)
- Read complaints submitted by students
- Filter all data by hostel block
- Login with credentials (session-based auth)

**Student**
- Select their name from a dropdown of registered students
- View their own attendance history, violations, and fines
- Submit complaints to the hostel administration

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | HTML, CSS, Vanilla JS | User interface served as static files |
| Backend | Node.js + Express.js | REST API server, business logic |
| Database | MongoDB + Mongoose | Data persistence with schema validation |
| Containerization | Docker | Package app into portable images |
| Orchestration | Kubernetes | Production-grade container orchestration |
| CI Pipeline | GitHub Actions | Automated testing, building, scanning |
| CD Pipeline | Render | Automated deployment to cloud |
| Monitoring | Prometheus + Grafana | Metrics collection and visualization |
| Security | Helmet, Rate Limiting, Trivy | Defense-in-depth security layers |

---

## 3. Frontend — Detailed Explanation

The frontend lives in the `public/` directory. Express serves these files as static assets.

### File Breakdown

| File | Role |
|------|------|
| `landing.html` | Welcome page with links to Admin and Student portals |
| `admin-login.html` | Admin authentication page (served at `/admin`) |
| `index.html` | Admin dashboard (served at `/admin/dashboard`) |
| `student.html` | Student self-service portal (served at `/student`) |
| `style.css` | Global stylesheet — dark theme, glassmorphism, animations |
| `app.js` | Client-side JavaScript — all API calls and DOM manipulation |

### How the Frontend Works

1. When a user visits `https://roomease-backend-ef5l.onrender.com/`, Express serves `landing.html`.
2. The landing page has two buttons: "Admin Portal" and "Student Portal".
3. Clicking "Admin Portal" goes to `/admin` which serves `admin-login.html`.
4. After successful login, the browser redirects to `/admin/dashboard` which serves `index.html`.
5. The admin dashboard has an **auth guard** at the top of the page — a JavaScript block that checks the session token with the server before rendering any content. If the token is invalid, the user is redirected back to `/admin`.
6. The student portal at `/student` serves `student.html` which shows a dropdown of registered students.

### Frontend-to-Backend Communication

The frontend uses the browser `fetch()` API to make HTTP requests to the backend:

```
Frontend (app.js)  →  fetch("/api/students")  →  Backend (app.js)  →  MongoDB
```

Every section of the dashboard (students, attendance, violations, complaints) makes its own API call. The frontend renders the responses into HTML tables and cards dynamically using DOM manipulation.

---

## 4. Backend — Detailed Explanation

The entire backend is in one file: `app.js` (586 lines). This is a monolithic Express application.

### Middleware Stack (in order of execution)

When a request hits the server, it passes through these layers:

```
Request → Helmet → Morgan → Rate Limiter → JSON Parser → CORS → Static Files → Prometheus Middleware → Route Handler → Response
```

| Middleware | What It Does |
|-----------|--------------|
| `helmet` | Adds 11+ security HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.) |
| `morgan` | Logs every HTTP request with method, URL, status code, and response time |
| `express-rate-limit` | Limits each IP to 100 requests per 15 minutes to prevent abuse |
| `express.json` | Parses incoming JSON request bodies (max 1MB) |
| `cors` | Allows cross-origin requests from any domain |
| `express.static` | Serves files from `public/` directory |
| Prometheus middleware | Records request duration, method, route, and status code for monitoring |

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/healthz` | Returns `{ status: "ok", uptime: <seconds> }` — used by Docker and K8s |
| GET | `/readyz` | Returns 200 if MongoDB is connected, 503 if not — used by K8s readiness probe |
| GET | `/metrics` | Prometheus-compatible metrics endpoint |
| POST | `/api/admin/login` | Authenticates admin with UID and password |
| GET | `/api/admin/verify` | Validates session token |
| POST | `/api/admin/logout` | Invalidates session token |
| GET/POST | `/students` | List all or create a student |
| POST | `/attendance/entry` | Record student entry (checks curfew automatically) |
| POST | `/attendance/exit` | Record student exit (checks exit curfew) |
| GET | `/attendance` | Get attendance records |
| GET/POST | `/violations` | List or create violations |
| GET/POST | `/complaints` | List or submit complaints |
| GET | `/meta/violations` | Returns violation types and their fine amounts |

### Curfew Logic

The backend automatically detects curfew violations:

- **Entry curfew**: After 22:30 (10:30 PM), any student entry is flagged as "Late Return"
- **Exit curfew**: After 22:20 (10:20 PM), any student exit is flagged as "Unauthorized Exit"
- **Morning grace**: Curfew ends at 6:00 AM
- **Auto-fines**: After 2 warnings, fines are automatically applied

### Database Connection

```javascript
mongoose.connect(process.env.MONGO_URI)
```

The connection string comes from the `MONGO_URI` environment variable — never hardcoded. This is a core DevSecOps practice: secrets stay outside code.

- **Local development**: `mongodb://mongo:27017/roomease` (Docker Compose service)
- **Production (Render)**: `mongodb+srv://...` (MongoDB Atlas cloud database)

The backend tracks connection status and exposes it through both `/readyz` and Prometheus metrics.

---

## 5. Database — Detailed Explanation

MongoDB stores data in four collections, defined by Mongoose schemas:

### Student Schema (`models/Student.js`)
```
{ name, roomNumber, hostelBlock, registeredAt }
```

### Attendance Schema (`models/Attendance.js`)
```
{ studentId (ref → Student), type (entry/exit), timestamp, curfewViolation }
```

### Violation Schema (`models/Violation.js`)
```
{ studentId (ref → Student), type, description, fineAmount, resolved, createdAt }
```
Violation types and fines: Late Return (₹500), Unauthorized Exit (₹300), Noise Complaint (₹200), Property Damage (₹1000), Substance Violation (₹2000).

### Complaint Schema (`models/Complaint.js`)
```
{ studentId (ref → Student), subject, description, status, hostelBlock, createdAt }
```

Mongoose acts as the bridge — it converts JavaScript objects into MongoDB documents and enforces schema rules.

---

## 6. Docker — Detailed Explanation

### What Docker Does in This Project

Docker packages the Node.js application into a standardized container image. This means the app runs identically on every machine — your laptop, the CI server, Render, or a Kubernetes cluster.

### The Dockerfile — Line by Line

The Dockerfile uses a **multi-stage build** with two stages:

**Stage 1: `deps` (Dependency Installation)**
```dockerfile
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
```

- Uses Node.js 18 on Alpine Linux (lightweight ~5MB base)
- Copies only `package.json` and `package-lock.json` first
- Runs `npm ci --omit=dev` to install only production dependencies (no jest, no supertest)
- Cleans npm cache to reduce image size
- This stage is cached — if dependencies don't change, Docker skips it

**Stage 2: `runtime` (Production Image)**
```dockerfile
FROM node:18-alpine AS runtime
RUN addgroup -g 1001 -S nodejs && adduser -S roomease -u 1001 -G nodejs
WORKDIR /app
COPY --from=deps --chown=roomease:nodejs /app/node_modules ./node_modules
COPY --chown=roomease:nodejs package.json app.js ./
COPY --chown=roomease:nodejs models ./models
COPY --chown=roomease:nodejs public ./public
USER roomease
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1
CMD ["node", "app.js"]
```

- Creates a non-root user `roomease` (UID 1001) — security best practice
- Copies `node_modules` from Stage 1 (not rebuilt, just copied)
- Copies application code with correct file ownership
- Switches to non-root user before running anything
- Declares the health check using the `/healthz` endpoint
- Starts the app with `node app.js`

### Image vs Container

| Concept | Analogy | In This Project |
|---------|---------|-----------------|
| **Docker Image** | A recipe/blueprint | Built from the Dockerfile, stored in GHCR |
| **Docker Container** | A running dish from that recipe | The actual running app process |

The image is built once, stored in a registry, and can create unlimited containers from it.

### How Images Are Used for Deployment

```
Code → Dockerfile → Docker Image → Container Registry (GHCR) → Deployed as Container
```

1. Developer pushes code to GitHub
2. GitHub Actions builds the Docker image using the Dockerfile
3. The image is tagged with the commit SHA and `latest`
4. The image is pushed to GitHub Container Registry (`ghcr.io/1a2m3a4y/roomease-devops`)
5. Render pulls the image (or builds its own from the Dockerfile)
6. Render runs the image as a live container accessible on the internet

---

## 7. Docker Compose — Detailed Explanation

Docker Compose runs the complete local development stack with **four services**:

### Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    roomease-net (bridge network)         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────┐ │
│  │   App    │  │  MongoDB │  │ Prometheus │  │Grafana│ │
│  │  :3000   │→ │  :27017  │  │   :9090    │→ │ :3001 │ │
│  └──────────┘  └──────────┘  └────────────┘  └───────┘ │
│       ↑                           ↑                     │
│       │       scrapes /metrics    │                     │
│       └───────────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `app` | Built from local Dockerfile | 3000 | Node.js application |
| `mongo` | `mongo:7` | 27017 | Database for development |
| `prometheus` | `prom/prometheus:latest` | 9090 | Scrapes `/metrics` every 15 seconds |
| `grafana` | `grafana/grafana:latest` | 3001 | Dashboard visualization (login: admin/admin) |

### Key Docker Compose Features Used

- **`depends_on` with `condition: service_healthy`**: App waits for MongoDB to be healthy before starting
- **Health checks**: Both app and mongo have health checks so Docker knows when they're ready
- **Named volumes**: `mongo_data`, `prometheus_data`, `grafana_data` persist data across restarts
- **Bridge network**: All services share `roomease-net` and can reach each other by service name

### How to Run Locally

```bash
docker-compose up --build      # Start everything
docker-compose down -v         # Stop and remove volumes
```

---

## 8. Kubernetes — Detailed Explanation

Kubernetes (K8s) is an orchestration platform for running containers at scale. The `k8s/` directory contains 9 manifest files that define the complete production infrastructure.

### How Kubernetes Works for This Project

```
Internet → Ingress (nginx) → Service → Pod 1 (container)
                                     → Pod 2 (container)
```

1. The Docker image is pulled from GHCR into the Kubernetes cluster
2. Kubernetes creates **Pods** (the smallest deployable unit, each running one container)
3. A **Service** acts as an internal load balancer across all pods
4. An **Ingress** exposes the service to the internet with a domain name
5. The **HPA** automatically scales pods up/down based on CPU and memory usage

### All 9 Kubernetes Manifest Files Explained

#### `namespace.yaml` — Isolation
Creates a dedicated `roomease` namespace. This isolates all RoomEase resources from other applications in the same cluster.

#### `configmap.yaml` — Non-Secret Configuration
Stores non-sensitive configuration as key-value pairs:
- `PORT=3000`, `NODE_ENV=production`, rate limit settings
- Pods read these values as environment variables

#### `secret.yaml` — Sensitive Configuration
Stores the `MONGO_URI` connection string. Uses `stringData` which Kubernetes automatically base64-encodes. Secrets are stored encrypted in etcd (the K8s database).

#### `deployment.yaml` — Application Pods
This is the core manifest. It defines:

- **Replicas: 2** — Two pods run simultaneously for high availability
- **Rolling Update Strategy**: `maxSurge: 1, maxUnavailable: 0` — during updates, a new pod starts before the old one stops (zero-downtime deployment)
- **Pod Anti-Affinity**: Spreads pods across different physical nodes so a node failure doesn't take down both pods
- **Container Security Context**: `runAsNonRoot: true`, `runAsUser: 1001`, drops all Linux capabilities — defense in depth
- **Resource Limits**: Each pod gets 100m-250m CPU and 128Mi-256Mi memory — prevents a single pod from consuming all cluster resources
- **Three Health Probes**:
  - `startupProbe` → hits `/healthz` — gives the app 50 seconds to start (5s × 10 retries)
  - `livenessProbe` → hits `/healthz` every 20s — if the app crashes, K8s restarts the pod
  - `readinessProbe` → hits `/readyz` every 10s — if MongoDB disconnects, K8s stops sending traffic to that pod

#### `service.yaml` — Internal Load Balancer
Creates a `ClusterIP` service that load-balances traffic across all healthy pods. Maps port 80 → container port 3000.

#### `ingress.yaml` — External Access
Configures an Nginx Ingress Controller with:
- Domain: `roomease.local` (customizable)
- Rate limiting: 20 requests/second per client
- Security headers injected at the ingress level
- TLS support ready (commented out, uncomment when you have a certificate)

#### `hpa.yaml` — Auto-Scaling
The Horizontal Pod Autoscaler watches CPU and memory:
- Scales up when CPU > 70% or memory > 80%
- Minimum 2 pods, maximum 10 pods
- Scales down when load decreases

#### `networkpolicy.yaml` — Network Security
Restricts which pods can communicate:
- Only allows inbound traffic on port 3000 from pods with the `roomease` label
- Acts as a firewall inside the cluster

#### `pdb.yaml` — Disruption Budget
Pod Disruption Budget ensures at least 1 pod is always running during voluntary disruptions (node maintenance, cluster upgrades).

---

## 9. CI/CD Pipeline — Detailed Explanation

The CI/CD pipeline is defined in `.github/workflows/main.yml`. It runs automatically on every push or pull request to `main`.

### Pipeline Architecture

```
Push to main
    │
    ├──→ Job 1: 🧪 Lint & Test (always runs)
    │         │
    │         ↓ (must pass)
    │    Job 2: 🐳 Docker Build & Push
    │         │
    │         ├──→ Job 3: 🔒 Security Scan
    │         └──→ Job 5: 🚀 Deploy to Render
    │
    └──→ Job 4: ☸️ K8s Manifest Validation (runs independently)
```

### Job 1: 🧪 Lint & Test

**Purpose**: Verify code quality and functionality before anything else.

**Steps in detail**:

1. **Checkout code** (`actions/checkout@v4`) — Clones the repository into the CI runner
2. **Setup Node.js** (`actions/setup-node@v4`) — Installs Node.js 18 with npm cache enabled
3. **Install dependencies** (`npm ci`) — Clean install from `package-lock.json` (deterministic, no surprises)
4. **Security audit** (`npm audit --audit-level=high || true`) — Checks all npm packages for known vulnerabilities. The `|| true` means it reports but doesn't fail the build
5. **Run tests** (`npm run test:ci`) — Executes Jest with `--ci --coverage` flags:
   - `--ci` disables interactive mode
   - `--coverage` generates a code coverage report
   - Tests use a mocked Mongoose (no real MongoDB needed in CI)
6. **Upload coverage** (`actions/upload-artifact@v4`) — Saves the coverage report as a downloadable artifact (kept for 7 days)

### Job 2: 🐳 Docker Build & Push

**Purpose**: Build the production Docker image and store it in GitHub Container Registry.

**Runs only**: On pushes to `main` (not on pull requests) AND after Job 1 passes.

**Steps in detail**:

1. **Checkout code** — Gets the source code
2. **Setup Docker Buildx** — Enables advanced Docker build features (multi-platform, caching)
3. **Login to GHCR** — Authenticates with `ghcr.io` using the built-in `GITHUB_TOKEN`
4. **Extract metadata** — Generates two image tags:
   - `ghcr.io/1a2m3a4y/roomease-devops:<commit-sha>` (unique per commit)
   - `ghcr.io/1a2m3a4y/roomease-devops:latest` (always points to newest)
5. **Build and push** — Builds the multi-stage Dockerfile and pushes both tags to GHCR. Uses GitHub Actions cache (`type=gha`) so unchanged layers are not rebuilt

### Job 3: 🔒 Security Scan

**Purpose**: Scan for vulnerabilities in the codebase.

**Runs only**: After Job 2 completes.

**What it does**: Uses **Trivy** (by Aqua Security) to scan the entire filesystem for CRITICAL and HIGH severity vulnerabilities in dependencies, configuration files, and code. Results are displayed as a table in the CI logs. Exit code is `0` (advisory, not blocking).

### Job 4: ☸️ K8s Manifest Validation

**Purpose**: Verify all Kubernetes YAML files are structurally valid.

**Runs**: Independently (does not depend on other jobs).

**What it does**: Installs **kubeconform** — a tool that validates Kubernetes manifests against official JSON schemas without needing a live cluster. It loops through every `.yaml` file in `k8s/` and validates each one. If any manifest has invalid fields, missing required values, or wrong API versions, the job fails.

### Job 5: 🚀 Deploy to Render

**Purpose**: Trigger production deployment.

**Runs only**: On pushes to `main` AND after Job 2 completes.

**What it does**: Checks if the `RENDER_DEPLOY_HOOK` secret exists. If yes, it sends an HTTP request to Render's deploy hook URL which triggers a new deployment. If the secret is not configured, Render's auto-deploy feature handles it (Render watches the `main` branch and deploys automatically on changes).

---

## 10. How Render Does CD (Continuous Deployment)

Render is the cloud platform that hosts the live application.

### Deployment Flow

```
Code pushed to GitHub main
       ↓
Render detects the change (auto-deploy or deploy hook)
       ↓
Render reads the Dockerfile in the repo
       ↓
Render builds a Docker image from it
       ↓
Render runs the image as a container
       ↓
Container starts: node app.js
       ↓
App connects to MongoDB Atlas
       ↓
App is live at: https://roomease-backend-ef5l.onrender.com
```

### What Render Provides

- **Build**: Reads Dockerfile, builds image on Render's infrastructure
- **Run**: Runs the container with environment variables set in the Render dashboard
- **Domain**: Provides a public URL (`*.onrender.com`)
- **Environment Variables**: `MONGO_URI`, `ADMIN_UID`, `ADMIN_PASS` are set in Render's dashboard — not in code
- **Auto-deploy**: Watches the GitHub `main` branch and deploys on every push
- **Health monitoring**: Uses the `/healthz` endpoint to verify the service is running

---

## 11. Testing — Detailed Explanation

### Test File: `tests/health.test.js`

The project uses **Jest** (test runner) and **Supertest** (HTTP assertion library).

### How Tests Work Without a Database

The test file **mocks Mongoose entirely**. Before any test runs, it replaces the real Mongoose module with a fake one:

```javascript
jest.mock("mongoose", () => ({
  connect: jest.fn().mockResolvedValue(true),
  connection: { on: jest.fn(), close: jest.fn() },
  Schema: FakeSchema,
  model: jest.fn(fakeModel),
}));
```

This means tests never touch a real MongoDB. They test the Express routes, middleware, and response formats in isolation.

### All 8 Test Cases

| # | Test | What It Verifies |
|---|------|-----------------|
| 1 | `GET /healthz` returns 200 | App is alive and returns uptime |
| 2 | `GET /readyz` returns 200 or 503 | Readiness check works correctly |
| 3 | `X-Content-Type-Options` header exists | Helmet security is active |
| 4 | `X-Frame-Options` header exists | Clickjacking protection is active |
| 5 | `GET /` returns 200 with HTML | Landing page is served correctly |
| 6 | `GET /admin` returns 200 with HTML | Admin login page is accessible |
| 7 | `GET /student` returns 200 with HTML | Student portal is accessible |
| 8 | `GET /meta/violations` returns data | Violation metadata API works |

### Test Scripts

- `npm test` — Runs tests with verbose output
- `npm run test:ci` — Runs tests with coverage report (used in CI)

---

## 12. Prometheus & Grafana — Monitoring Explained

### Prometheus Metrics in the App

The backend uses `prom-client` to expose metrics at `/metrics`:

| Metric | Type | What It Measures |
|--------|------|-----------------|
| `roomease_http_request_duration_seconds` | Histogram | How long each HTTP request takes (with percentile buckets) |
| `roomease_http_requests_total` | Counter | Total request count by method, route, and status code |
| `roomease_active_requests` | Gauge | How many requests are being processed right now |
| `roomease_db_connected` | Gauge | MongoDB connection status (1 = connected, 0 = disconnected) |
| `roomease_process_cpu_*` | Counter | CPU time used by the Node.js process |
| `roomease_process_resident_memory_bytes` | Gauge | RAM used by the process |
| `roomease_nodejs_heap_size_*` | Gauge | V8 JavaScript engine heap usage |
| `roomease_nodejs_eventloop_lag_seconds` | Gauge | Event loop delay (indicates if the app is overloaded) |
| `roomease_nodejs_gc_duration_seconds` | Histogram | Garbage collection pause times |

### How Prometheus Collects Data

Prometheus runs as a separate container and **pulls** (scrapes) metrics from the app every 15 seconds:

```
Prometheus → GET http://app:3000/metrics → Parses text → Stores in time-series DB
```

### How Grafana Visualizes Data

Grafana connects to Prometheus as a data source and renders a pre-built dashboard with 12 panels:

| Panel | Visualization |
|-------|--------------|
| Application Status | UP/DOWN indicator |
| MongoDB Status | Connected/Disconnected indicator |
| Uptime | Seconds since app started |
| Active Requests | Current in-flight request count |
| Total Requests | Cumulative request counter |
| Memory Usage | Current RSS memory |
| Request Rate | Requests per second by status code (2xx/4xx/5xx) |
| Response Time | p50, p95, p99 latency percentiles |
| Memory Over Time | RSS, Heap Used, Heap Total trend lines |
| CPU Usage | User and System CPU percentage |
| Requests by Route | Top 10 most-hit endpoints |
| Event Loop Lag | Node.js event loop health |

---

## 13. DevSecOps Practices Summary

### Development
- Version-controlled code in GitHub
- Automated testing with Jest
- Environment-based configuration (`.env`)
- Documented API and project structure

### Security
- `helmet` adds 11+ security HTTP headers
- `express-rate-limit` prevents brute-force and DDoS
- Non-root Docker container (UID 1001)
- K8s security context drops all Linux capabilities
- `npm audit` checks package vulnerabilities
- Trivy scans for CRITICAL/HIGH CVEs
- Admin auth with session tokens
- Secrets in environment variables, never in code
- Network policies restrict pod-to-pod communication

### Operations
- Docker standardizes builds across all environments
- Multi-stage Dockerfile produces minimal ~50MB images
- Docker Compose for local development with monitoring
- Kubernetes manifests for production orchestration
- Rolling updates with zero-downtime deployments
- Auto-scaling (HPA) based on CPU/memory
- Health endpoints (`/healthz`, `/readyz`) for probing
- Prometheus metrics for real-time observability
- Grafana dashboards for visual monitoring
- Pod Disruption Budget for safe maintenance

---

## 14. Complete Flow — End to End

```
Developer writes code
       ↓
git push to GitHub (main branch)
       ↓
GitHub Actions triggers CI/CD Pipeline
       ↓
┌──────────────────────────────────────────────┐
│  Job 1: Install deps → Audit → Run 8 tests  │
│  Job 4: Validate 9 K8s manifests             │
└──────────────────────────────────────────────┘
       ↓ (all pass)
┌──────────────────────────────────────────────┐
│  Job 2: Build Docker image → Push to GHCR    │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  Job 3: Trivy security scan                  │
│  Job 5: Trigger Render deployment            │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  Render builds image from Dockerfile         │
│  Render runs container with env variables    │
│  App connects to MongoDB Atlas               │
│  App is live at public URL                   │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  /healthz confirms app is alive              │
│  /readyz confirms DB is connected            │
│  /metrics exposes Prometheus telemetry       │
│  Grafana dashboard shows real-time status    │
└──────────────────────────────────────────────┘
```

---

## 15. Key Files Reference

| File | Purpose |
|------|---------|
| `app.js` | Backend server — middleware, routes, metrics, auth |
| `public/app.js` | Frontend logic — API calls, DOM rendering |
| `public/landing.html` | Welcome page |
| `public/admin-login.html` | Admin authentication |
| `public/index.html` | Admin dashboard |
| `public/student.html` | Student portal |
| `public/style.css` | Global styles |
| `models/*.js` | Mongoose schemas (Student, Attendance, Violation, Complaint) |
| `Dockerfile` | Multi-stage production image build |
| `docker-compose.yml` | Local dev stack (App + Mongo + Prometheus + Grafana) |
| `.github/workflows/main.yml` | CI/CD pipeline (5 jobs) |
| `k8s/*.yaml` | 9 Kubernetes manifests |
| `monitoring/prometheus/prometheus.yml` | Prometheus scrape configuration |
| `monitoring/grafana/` | Grafana datasource, dashboard provider, and dashboard JSON |
| `tests/health.test.js` | 8 automated test cases |
| `.env.example` | Environment variable template |
| `package.json` | Dependencies, scripts, and metadata |
