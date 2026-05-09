# RoomEase — Kubernetes Deployment Guide

## Prerequisites

| Tool | Version |
|------|---------|
| `kubectl` | ≥ 1.28 |
| A running Kubernetes cluster | minikube / kind / cloud provider |
| Nginx Ingress Controller | installed on cluster |
| Docker | to build & push the image |
| Metrics Server | for HPA to work |

---

## Step 1 — Build & Push Docker Image

```bash
# Build the image
docker build -t your-dockerhub-username/roomease:latest .

# Push to Docker Hub (or your registry)
docker login
docker push your-dockerhub-username/roomease:latest
```

Update `k8s/deployment.yaml` line 15 with your actual image path.

---

## Step 2 — Configure the Secret

Encode your MongoDB URI:
```bash
echo -n "mongodb+srv://user:pass@cluster.mongodb.net/roomease?retryWrites=true&w=majority" | base64
```

Paste the output into `k8s/secret.yaml`:
```yaml
data:
  MONGO_URI: <paste base64 output here>
```

---

## Step 3 — Apply All Manifests

```bash
# Apply in order (namespace first)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Or apply the whole folder at once
kubectl apply -f k8s/
```

---

## Step 4 — Verify Deployment

```bash
# Check pods are running
kubectl get pods -n roomease

# Check service
kubectl get svc -n roomease

# Check ingress
kubectl get ingress -n roomease

# Check HPA status
kubectl get hpa -n roomease

# Tail logs
kubectl logs -n roomease -l app=roomease -f
```

---

## Step 5 — Access the App

**Option A — Port Forward (quickest)**
```bash
kubectl port-forward svc/roomease-service 3000:80 -n roomease
# Open http://localhost:3000
```

**Option B — Ingress (via hostname)**
Add to `/etc/hosts`:
```
127.0.0.1  roomease.local
```
Then open `http://roomease.local`

*(For minikube use `minikube tunnel` first)*

---

## HPA Notes

The HorizontalPodAutoscaler will:
- Keep a **minimum of 2 pods** running at all times
- Scale **up to 10 pods** when CPU > 70% or Memory > 80%
- Requires the **Metrics Server** to be installed

Install Metrics Server on minikube:
```bash
minikube addons enable metrics-server
```

---

## Rolling Updates

When you push a new image:
```bash
docker build -t your-dockerhub-username/roomease:v2 .
docker push your-dockerhub-username/roomease:v2

kubectl set image deployment/roomease-app \
  roomease=your-dockerhub-username/roomease:v2 \
  -n roomease

# Watch the rollout
kubectl rollout status deployment/roomease-app -n roomease
```

To rollback:
```bash
kubectl rollout undo deployment/roomease-app -n roomease
```

---

## Manifest Summary

| File | Kind | Purpose |
|------|------|---------|
| `namespace.yaml` | Namespace | Isolates resources in `roomease` ns |
| `configmap.yaml` | ConfigMap | Non-secret env vars (PORT, NODE_ENV) |
| `secret.yaml` | Secret | Encrypted MONGO_URI |
| `deployment.yaml` | Deployment | 2 replicas, rolling update, health probes |
| `service.yaml` | Service | ClusterIP on port 80→3000 |
| `ingress.yaml` | Ingress | Nginx routing for `roomease.local` |
| `hpa.yaml` | HPA | Auto-scale 2–10 pods (CPU/Memory) |
