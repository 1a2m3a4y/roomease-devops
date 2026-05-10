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

## Quick Start

```bash
# 1. Build and push Docker image
docker build -t ghcr.io/YOUR_USERNAME/devsecops_project:latest .
docker push ghcr.io/YOUR_USERNAME/devsecops_project:latest

# 2. Configure secret (base64 encode your MongoDB URI)
echo -n "your_mongo_uri_here" | base64
# Paste output into k8s/secret.yaml → data.MONGO_URI

# 3. Update image in k8s/deployment.yaml
# Replace ghcr.io/your-username/devsecops_project:latest

# 4. Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/networkpolicy.yaml
kubectl apply -f k8s/pdb.yaml

# Or apply everything at once:
kubectl apply -f k8s/
```

---

## Verification

```bash
# Check pods
kubectl get pods -n roomease

# Check all resources
kubectl get all -n roomease

# Check HPA status
kubectl get hpa -n roomease

# Health check from within cluster
kubectl exec -n roomease deployment/roomease-app -- wget -qO- http://localhost:3000/healthz

# Tail logs
kubectl logs -n roomease -l app=roomease -f
```

---

## Access the App

**Port Forward (quickest)**
```bash
kubectl port-forward svc/roomease-service 3000:80 -n roomease
# Open http://localhost:3000
```

**Ingress (via hostname)**
Add to `/etc/hosts`:
```
127.0.0.1  roomease.local
```
Then open `http://roomease.local`

*(For minikube use `minikube tunnel` first)*

---

## Rolling Updates

```bash
# Build & push new version
docker build -t ghcr.io/YOUR_USERNAME/devsecops_project:v2 .
docker push ghcr.io/YOUR_USERNAME/devsecops_project:v2

# Update deployment
kubectl set image deployment/roomease-app \
  roomease=ghcr.io/YOUR_USERNAME/devsecops_project:v2 \
  -n roomease

# Watch rollout
kubectl rollout status deployment/roomease-app -n roomease

# Rollback if needed
kubectl rollout undo deployment/roomease-app -n roomease
```

---

## Manifest Summary

| File | Kind | Purpose |
|------|------|---------|
| `namespace.yaml` | Namespace | Isolates resources in `roomease` ns |
| `configmap.yaml` | ConfigMap | Non-secret env vars (PORT, NODE_ENV, rate limits) |
| `secret.yaml` | Secret | Encrypted MONGO_URI |
| `deployment.yaml` | Deployment | 2 replicas, rolling update, security context, health probes |
| `service.yaml` | Service | ClusterIP on port 80→3000 |
| `ingress.yaml` | Ingress | Nginx routing with rate limiting & security headers |
| `hpa.yaml` | HPA | Auto-scale 2–10 pods (CPU/Memory) |
| `networkpolicy.yaml` | NetworkPolicy | Restrict ingress to nginx controller only |
| `pdb.yaml` | PodDisruptionBudget | Guarantee ≥1 pod during disruptions |

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
