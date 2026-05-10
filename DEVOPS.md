# RoomEase — DevSecOps Documentation

> Complete guide for local development, Docker, Kubernetes deployment, CI/CD pipeline, and production best practices.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development](#local-development)
3. [Docker](#docker)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Security Practices](#security-practices)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Render Compatibility](#render-compatibility)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│   Browser    │     │          Kubernetes Cluster               │
│  (Client)    │     │                                          │
│              │────▶│  ┌─────────┐    ┌──────────────────┐     │
│              │     │  │ Ingress │───▶│  Service (ClusterIP)│   │
│              │     │  │ (nginx) │    └────────┬─────────┘     │
│              │     │  └─────────┘             │               │
│              │     │                 ┌────────▼─────────┐     │
│              │     │                 │   Pod (replica 1) │     │
│              │     │                 │   ┌────────────┐  │     │
│              │     │                 │   │ Express.js  │  │     │
│              │     │                 │   │  + Helmet   │  │     │
│              │     │                 │   │  + Morgan   │  │     │
│              │     │                 │   │  + Rate Lim │  │     │
│              │     │                 │   └────────────┘  │     │
│              │     │                 └────────┬─────────┘     │
│              │     │                 ┌────────▼─────────┐     │
│              │     │                 │   Pod (replica 2) │     │
│              │     │                 │   (same as above) │     │
│              │     │                 └──────────────────┘     │
│              │     │                          │               │
└──────────────┘     └──────────────────────────┼───────────────┘
                                                │
                                    ┌───────────▼──────────┐
                                    │   MongoDB Atlas       │
                                    │   (Cloud Database)    │
                                    └──────────────────────┘
```

**On Render (current production):**
```
Browser  →  Render CDN  →  Render Web Service  →  MongoDB Atlas
                           (Docker container)
```

**Technology Stack:**
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18 (Alpine) |
| Framework | Express.js 5 |
| Database | MongoDB Atlas (Mongoose 9) |
| Security | Helmet, express-rate-limit, CORS |
| Logging | Morgan (combined format in prod) |
| Container | Docker (multi-stage, non-root) |
| Orchestration | Kubernetes (Deployment, HPA, NetworkPolicy) |
| CI/CD | GitHub Actions (5-job pipeline) |
| PaaS | Render.com |
| Registry | GitHub Container Registry (GHCR) |

---

## Local Development

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/devsecops_project.git
cd devsecops_project

# Start everything (app + local MongoDB)
docker-compose up --build

# App is available at http://localhost:3000
# MongoDB at localhost:27017
```

To stop:
```bash
docker-compose down        # Stop containers
docker-compose down -v     # Stop + remove volumes (deletes local DB data)
```

### Option 2: Native Node.js

```bash
# Prerequisites: Node.js ≥ 18, MongoDB running locally or Atlas URI

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your MongoDB URI

# Start in development mode
npm run start:dev

# Start in production mode
npm start
```

### Option 3: Docker Only (no Compose)

```bash
docker build -t roomease:dev .
docker run -p 3000:3000 \
  -e MONGO_URI="mongodb+srv://..." \
  -e NODE_ENV=development \
  roomease:dev
```

---

## Docker

### Dockerfile Overview

The Dockerfile uses a **multi-stage build**:

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| `deps` | `node:18-alpine` | Install production dependencies with `npm ci` |
| `runtime` | `node:18-alpine` | Copy deps + app code, run as non-root user |

**Key features:**
- 🏔️ **Alpine Linux** — Image size ~50MB (vs ~1GB with `node:18`)
- 🔒 **Non-root user** — Runs as `roomease:1001` (not `root`)
- 📦 **`npm ci`** — Deterministic installs from lockfile
- 🏥 **Docker HEALTHCHECK** — Built-in health monitoring
- 🚫 **`.dockerignore`** — Excludes `.git`, `node_modules`, tests, k8s from build context

### Common Docker Commands

```bash
# Build
docker build -t roomease:latest .

# Run
docker run -p 3000:3000 -e MONGO_URI="..." roomease:latest

# Check health
docker inspect --format='{{json .State.Health}}' <container_id>

# View logs
docker logs -f <container_id>

# Shell into container
docker exec -it <container_id> /bin/sh

# Push to GHCR
docker tag roomease:latest ghcr.io/YOUR_USERNAME/devsecops_project:latest
docker push ghcr.io/YOUR_USERNAME/devsecops_project:latest
```

---

## Kubernetes Deployment

> See also: [k8s/README.md](k8s/README.md) for a quick-start guide.

### Manifest Architecture

```
k8s/
├── namespace.yaml       # Namespace isolation
├── configmap.yaml       # Non-secret configuration (PORT, NODE_ENV, rate limits)
├── secret.yaml          # Encrypted MONGO_URI (base64)
├── deployment.yaml      # 2 replicas, rolling update, security context, probes
├── service.yaml         # ClusterIP: port 80 → 3000
├── ingress.yaml         # Nginx with rate limiting & security headers
├── hpa.yaml             # Auto-scale 2–10 pods (CPU 70%, Memory 80%)
├── networkpolicy.yaml   # Allow traffic only from ingress-nginx
├── pdb.yaml             # Min 1 pod during disruptions
└── README.md            # Quick-start guide
```

### Step-by-Step Deployment

#### 1. Prepare Secret

```bash
# Encode your MongoDB URI
echo -n "mongodb+srv://user:pass@cluster.mongodb.net/roomease" | base64
# Paste output into k8s/secret.yaml → data.MONGO_URI
```

#### 2. Update Image Reference

Edit `k8s/deployment.yaml` and replace the image:
```yaml
image: ghcr.io/YOUR_USERNAME/devsecops_project:latest
```

#### 3. Apply Manifests

```bash
# Apply in dependency order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/networkpolicy.yaml
kubectl apply -f k8s/pdb.yaml
```

#### 4. Verify

```bash
kubectl get all -n roomease
kubectl get hpa -n roomease
kubectl logs -n roomease -l app=roomease -f
```

#### 5. Access

```bash
# Port forward
kubectl port-forward svc/roomease-service 3000:80 -n roomease
# Visit http://localhost:3000
```

---

## CI/CD Pipeline

### Pipeline Architecture

```
 Push to main
      │
      ▼
┌─────────────────┐
│  🧪 Lint & Test  │ ─── npm ci → npm audit → jest → coverage upload
└────────┬────────┘
         │ (on success)
         ▼
┌─────────────────┐     ┌─────────────────────┐
│ 🐳 Docker Build  │     │ ☸️  K8s Validation    │  (runs in parallel)
│   & Push (GHCR)  │     │   kubectl dry-run    │
└────────┬────────┘     └─────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────┐
│🔒 Trivy│  │🚀 Render │
│  Scan  │  │  Deploy  │
└────────┘  └──────────┘
```

### Jobs Explained

| # | Job | Trigger | What it does |
|---|-----|---------|-------------|
| 1 | **Lint & Test** | push/PR to `main` | Install deps, security audit, run Jest tests, upload coverage |
| 2 | **Docker Build & Push** | push to `main` only | Multi-stage build, push to GHCR with SHA + `latest` tags |
| 3 | **Security Scan** | after Docker push | Trivy filesystem scan for CRITICAL/HIGH vulnerabilities |
| 4 | **K8s Validation** | push/PR to `main` | Validate all manifests with `kubectl --dry-run=client` |
| 5 | **Deploy to Render** | after Docker push | Trigger Render deploy hook webhook |

### Required GitHub Secrets

| Secret | Required | How to Get |
|--------|----------|-----------|
| `GITHUB_TOKEN` | Auto-provided | Built-in — used for GHCR push |
| `RENDER_DEPLOY_HOOK` | Optional | Render Dashboard → Service → Settings → Deploy Hook |

### Setting Up

1. Push code to GitHub
2. Go to **Settings → Actions → General** and enable workflows
3. (Optional) Add `RENDER_DEPLOY_HOOK` secret for auto-deploy
4. Every push to `main` will trigger the full pipeline

---

## Security Practices

### Application Layer

| Practice | Implementation |
|----------|---------------|
| **Security headers** | `helmet` middleware (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) |
| **Rate limiting** | `express-rate-limit` — 100 requests per 15-minute window |
| **Input validation** | Express JSON body limit (1MB) |
| **CORS** | Configured via `cors` middleware |
| **Dependency audit** | `npm audit` in CI pipeline |

### Container Layer

| Practice | Implementation |
|----------|---------------|
| **Non-root user** | Runs as `roomease:1001`, not root |
| **Minimal base image** | `node:18-alpine` (~50MB) |
| **No unnecessary packages** | `npm ci --omit=dev` |
| **Image scanning** | Trivy in CI pipeline |
| **Read-only filesystem** | Configurable via K8s securityContext |

### Kubernetes Layer

| Practice | Implementation |
|----------|---------------|
| **Secrets management** | K8s Secrets (base64 encoded, should use Sealed Secrets in prod) |
| **Network isolation** | NetworkPolicy — only ingress-nginx can reach pods |
| **Least privilege** | `runAsNonRoot`, `drop ALL` capabilities |
| **Disruption budget** | PDB — min 1 pod during voluntary disruptions |
| **Resource limits** | CPU/Memory requests and limits set |
| **Rolling updates** | `maxUnavailable: 0` for zero-downtime deploys |

---

## Monitoring & Health Checks

### Health Endpoints

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `GET /healthz` | **Liveness probe** — Is the process alive? | K8s livenessProbe, Docker HEALTHCHECK |
| `GET /readyz` | **Readiness probe** — Is MongoDB connected? | K8s readinessProbe |

### Response Examples

```json
// GET /healthz → 200
{ "status": "ok", "uptime": 3456.789 }

// GET /readyz → 200 (DB connected)
{ "status": "ready", "db": "connected" }

// GET /readyz → 503 (DB disconnected)
{ "status": "not ready", "db": "disconnected" }
```

### HPA Behavior

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU utilization | > 70% | Scale up (max 10 pods) |
| Memory utilization | > 80% | Scale up (max 10 pods) |
| Min replicas | 2 | Always running |

### Logging

- **Development:** `morgan("dev")` — Colored, concise output
- **Production:** `morgan("combined")` — Apache-style access logs
- **Structured prefixes:** All app logs use `[RoomEase]` prefix for easy filtering

---

## Render Compatibility

The same Dockerfile works seamlessly on Render:

1. **Render detects the Dockerfile** automatically and uses it to build
2. **Environment variables** are set in Render Dashboard (not from ConfigMap)
3. **Health checks** — Render uses its own health check, but `/healthz` is available
4. **Auto-deploy** — Either via Git push (Render watches the repo) or via Deploy Hook from CI/CD

### Render-Specific Setup

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Your service: `roomease-backend`
3. Settings:
   - **Build Command:** (auto from Dockerfile)
   - **Environment:** Set `MONGO_URI`, `NODE_ENV=production`
   - **Health Check Path:** `/healthz`
   - **Deploy Hook:** Copy URL and add as `RENDER_DEPLOY_HOOK` GitHub secret

---

## Troubleshooting

### Docker Issues

```bash
# Image won't build — check .dockerignore isn't excluding needed files
docker build --no-cache -t roomease:debug .

# Container exits immediately — check logs
docker logs <container_id>

# Container unhealthy — test health endpoint
docker exec <container_id> wget -qO- http://localhost:3000/healthz
```

### Kubernetes Issues

```bash
# Pods stuck in CrashLoopBackOff
kubectl describe pod <pod-name> -n roomease
kubectl logs <pod-name> -n roomease --previous

# Readiness probe failing (503)
# → Check if MONGO_URI secret is correctly base64 encoded
kubectl get secret roomease-secret -n roomease -o jsonpath='{.data.MONGO_URI}' | base64 -d

# HPA not scaling
kubectl describe hpa roomease-hpa -n roomease
# → Ensure metrics-server is running
kubectl get pods -n kube-system | grep metrics
```

### CI/CD Issues

```bash
# GHCR push fails → check that Actions has packages:write permission
# Go to: Settings → Actions → General → Workflow permissions → Read and write

# Render deploy hook not working → verify the secret URL
# Go to: Render Dashboard → Service → Settings → Deploy Hook
```

---

## File Structure

```
devsecops_project/
├── .github/
│   └── workflows/
│       └── main.yml              # CI/CD pipeline (5 jobs)
├── k8s/
│   ├── namespace.yaml            # Namespace isolation
│   ├── configmap.yaml            # Non-secret config
│   ├── secret.yaml               # MONGO_URI (base64 template)
│   ├── deployment.yaml           # 2 replicas, security context, probes
│   ├── service.yaml              # ClusterIP
│   ├── ingress.yaml              # Nginx with rate limiting
│   ├── hpa.yaml                  # Auto-scaling 2–10 pods
│   ├── networkpolicy.yaml        # Zero-trust networking
│   ├── pdb.yaml                  # Disruption budget
│   └── README.md                 # K8s quick-start
├── models/
│   ├── Student.js
│   ├── Attendance.js
│   ├── Violation.js
│   └── Complaint.js
├── public/                       # Static frontend
│   ├── landing.html
│   ├── index.html (admin)
│   ├── student.html
│   ├── app.js
│   └── style.css
├── tests/
│   └── health.test.js            # Jest test suite
├── app.js                        # Express server (hardened)
├── package.json
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # Local dev (app + MongoDB)
├── .dockerignore
├── .env.example                  # Environment template
├── .gitignore
└── DEVOPS.md                     # This documentation
```
