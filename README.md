# RoomEase CI/CD Project Report

RoomEase is a DevSecOps-ready hostel management system built with Node.js, Express.js, MongoDB, Docker, GitHub Actions, Kubernetes, Prometheus, and Grafana. It combines practical hostel workflows with a complete delivery pipeline, making it useful both as an application project and as a CI/CD case study.

This README captures the main body of the RoomEase report and intentionally excludes the front page and the final evaluation page from the `.docx` submission. A short project guide is included first for quick setup and navigation.

## Project Highlights

- Hostel management features for student registration, attendance, curfew tracking, complaints, violations, and fines.
- Express.js backend with security middleware, rate limiting, structured health checks, and Prometheus metrics.
- MongoDB and Mongoose data layer for persistent hostel records.
- Automated CI/CD workflow using GitHub Actions for tests, audits, Docker image builds, vulnerability scanning, and Kubernetes validation.
- Docker Compose stack for local application, database, Prometheus, and Grafana testing.
- Kubernetes manifests for namespace, deployment, service, ingress, autoscaling, network policy, and disruption control.

## Quick Start

### Run with Docker Compose

```bash
docker compose up --build
```

Useful local URLs:

| Service          | URL                             |
| ---------------- | ------------------------------- |
| RoomEase app     | `http://localhost:3000`         |
| Health check     | `http://localhost:3000/healthz` |
| Readiness check  | `http://localhost:3000/readyz`  |
| Metrics endpoint | `http://localhost:3000/metrics` |
| Prometheus       | `http://localhost:9090`         |
| Grafana          | `http://localhost:3001`         |

Default Grafana login: `admin / admin`

### Run Locally with Node.js

```bash
npm ci
cp .env.example .env
npm start
```

For direct Node.js execution, make sure `MONGO_URI` in `.env` points to a reachable MongoDB instance.

### Run Tests

```bash
npm test
```

## Repository Structure

| Path                 | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `app.js`             | Main Express application, API routes, middleware, health checks, and metrics. |
| `models/`            | Mongoose schemas for RoomEase domain data.                                    |
| `public/`            | Browser-facing HTML, CSS, and JavaScript pages.                               |
| `tests/`             | Jest and Supertest validation for key endpoints and frontend routes.          |
| `.github/workflows/` | GitHub Actions CI/CD pipeline configuration.                                  |
| `Dockerfile`         | Production container image definition.                                        |
| `docker-compose.yml` | Local multi-service development and monitoring stack.                         |
| `k8s/`               | Kubernetes deployment and operations manifests.                               |
| `monitoring/`        | Prometheus and Grafana configuration files.                                   |

## Introduction to CI/CD

Continuous Integration and Continuous Deployment (CI/CD) is a core DevSecOps practice in which every meaningful code change is automatically validated, built, and prepared for release through a predictable workflow. In a traditional manual process, developers write code, run some checks locally, build deployment artifacts by hand, and then rely on ad hoc steps to publish updates. That approach is error-prone and difficult to audit. CI/CD replaces that uncertainty with automation so that each source-code change follows the same engineering path from commit to release candidate.

The selected project for this report is RoomEase, a hostel management system developed using Node.js, Express.js, MongoDB, Mongoose, HTML, CSS, and browser-side JavaScript. The project is designed to solve practical hostel-administration tasks such as student registration, room allocation visibility, entry and exit attendance, curfew enforcement, violation and fine tracking, and student complaint handling. In addition to application features, the repository also contains DevSecOps assets including a Dockerfile, a Docker Compose stack, GitHub Actions workflow automation, Kubernetes manifests, Prometheus configuration, and Grafana dashboard provisioning.

For RoomEase, CI/CD is especially important because the project contains more than a simple web server. It includes business logic, data models, environment-based configuration, container packaging, security middleware, health endpoints, observability components, and infrastructure definitions. Any change to one part of the system can affect the others. A disciplined pipeline ensures that these changes are validated in a controlled sequence before they reach users or administrators.

From a CI perspective, the objective is to continuously integrate small and frequent updates into a shared codebase while automatically checking correctness. From a CD perspective, the objective is to continuously produce a release-ready artifact, such as a Docker image, and then deliver it to a deployment platform in a repeatable manner. The DevSecOps dimension further extends this approach by embedding security and validation activities inside the same release flow rather than treating them as optional post-development tasks.

In the context of this report, RoomEase serves as a strong case study because it demonstrates how an academic software project can be transformed into a production-oriented engineering system. Instead of stopping at application development, the repository shows how modern teams secure code, automate testing, package workloads, validate manifests, and support scalable deployment and monitoring. Therefore, this report examines not only what the project does functionally, but also how it is prepared for reliable delivery.

## Selected Tools and Their Roles

The RoomEase repository uses a combination of development, automation, deployment, and monitoring tools. Each tool addresses a particular engineering concern, and together they create a complete delivery ecosystem around the application.

Rather than depending on a single platform for everything, the project follows a layered strategy. Source control and automation are handled through GitHub and GitHub Actions, artifact packaging is handled by Docker, image hosting is handled through GitHub Container Registry, deployment readiness is supported by Render and Kubernetes assets, and runtime visibility is provided through Prometheus and Grafana. This separation of concerns makes the overall system more maintainable and easier to reason about.

| Tool / Platform           | Role in the Project                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                    | Acts as the central source-control platform where code, workflow files, and infrastructure definitions are versioned and collaboratively maintained.                 |
| GitHub Actions            | Automates testing, auditing, image build and push, security scan, Kubernetes validation, and deployment triggering whenever changes reach the main integration path. |
| Node.js + Express.js      | Provide the backend runtime and application framework that power RoomEase APIs, static page hosting, middleware, and request handling.                               |
| MongoDB + Mongoose        | Persist application data such as students, attendance records, complaints, and violations using schema-backed document models.                                       |
| Jest + Supertest          | Validate health endpoints, security headers, frontend routes, and metadata APIs before deployment so regressions are identified early.                               |
| Docker                    | Packages the application into a repeatable runtime image using a multi-stage, lightweight, non-root build process.                                                   |
| GitHub Container Registry | Stores tagged container images produced by the pipeline, making them available as versioned deployment artifacts.                                                    |
| Render                    | Provides an easy production deployment target through an automated deploy-hook based release trigger.                                                                |
| Kubernetes                | Supplies production-ready orchestration manifests including Namespace, ConfigMap, Secret, Deployment, Service, Ingress, HPA, NetworkPolicy, and PodDisruptionBudget. |
| Prometheus + Grafana      | Collect, scrape, and visualize metrics exposed by the backend, improving observability and runtime diagnostics.                                                      |
| Docker Compose            | Creates a complete local multi-service environment containing the application, MongoDB, Prometheus, and Grafana.                                                     |

The combination of these tools shows that RoomEase is not just a CRUD application. It has been organized as a delivery-capable system in which coding, validation, packaging, deployment, and observability are treated as connected responsibilities.

## Architecture of the CI/CD Pipeline

The CI/CD architecture of RoomEase can be understood as a flow of trust-building stages. A developer begins by modifying application code, workflow files, frontend pages, or infrastructure manifests. Once these changes are committed and pushed to the repository, GitHub becomes the event source that activates the automation pipeline. This is the first transition point from local development into controlled shared validation.

The GitHub Actions workflow then serves as the central automation engine. It checks out the repository, restores the Node.js toolchain, installs dependencies, and executes the defined validation stages. These stages include testing, security auditing, image construction, vulnerability scanning, and Kubernetes manifest verification. Each stage increases confidence in the change set before it is promoted further.

After validation, the application is transformed into an immutable Docker artifact. This is a critical architectural step because deployment should operate on a known, versioned image rather than on raw source code. The generated image can be stored in a registry, referenced by deployment systems, and reused consistently across environments without introducing build drift.

On the delivery side, the project supports both a simpler production path and a more scalable orchestration path. Render provides an immediate web-service deployment route triggered from the pipeline. At the same time, the repository includes Kubernetes resources for teams that want stronger control over replicas, autoscaling, ingress, resource isolation, and rollout behavior. This dual-path design increases adaptability for different hosting contexts.

The architecture is completed by observability. Prometheus collects application metrics from the `/metrics` endpoint, while Grafana provides dashboards for visualization. Health and readiness endpoints make it possible for containers, platforms, and orchestration systems to determine whether the service is alive and whether it is ready to accept traffic. This means the architecture is not limited to delivery alone; it extends into post-deployment verification as well.

Overall, this architecture supports DevSecOps objectives because verification, packaging, deployment readiness, and observability are all defined as version-controlled assets. Every release candidate follows the same path, becomes easier to audit, and can be reproduced with much less operational uncertainty.

## Installation & Configuration Steps

A successful CI/CD implementation depends on both tooling setup and correct environment configuration. In RoomEase, installation is not limited to downloading dependencies; it also involves preparing runtime secrets, local services, registry access, and deployment settings.

1. Clone the repository and inspect the project structure so that application code, tests, workflow files, Docker configuration, Kubernetes manifests, and monitoring assets are clearly understood before execution.
2. Install the Node.js dependencies using `npm ci` or `npm install`. The lockfile ensures deterministic dependency resolution, which is important for matching local behavior with automated CI runs.
3. Configure environment variables such as `MONGO_URI`, `NODE_ENV`, `PORT`, `ADMIN_UID`, `ADMIN_PASS`, `RATE_LIMIT_WINDOW_MS`, and `RATE_LIMIT_MAX`. These values separate secrets and deployment-specific behavior from source code.
4. For local development, start the multi-container stack defined in `docker-compose.yml`. This launches the application, MongoDB, Prometheus, and Grafana on a dedicated bridge network, allowing developers to test features and observability together.
5. For CI/CD execution, ensure that GitHub repository permissions and secrets are configured correctly. The workflow depends on access for package publishing and may use `RENDER_DEPLOY_HOOK` to trigger automated deployment after successful build stages.
6. When targeting Kubernetes, base64-encode the MongoDB connection string, update the image reference in the deployment manifest, and apply the namespace, configmap, secret, deployment, service, ingress, HPA, network policy, and PDB resources in the correct order.
7. Verify the deployment using health endpoints, logs, pod status, and metrics so that setup is confirmed not only at installation time but also at service-readiness time.

These steps demonstrate an important DevSecOps principle: configuration is part of delivery. A pipeline becomes dependable only when application setup, infrastructure setup, and secret management are all handled deliberately.

## Implementation Details

### Application-layer implementation

The backend implementation in `app.js` combines application logic with DevSecOps-focused middleware. The Express server initializes security and observability concerns at startup rather than treating them as later additions. Helmet is used to strengthen HTTP response headers, Morgan records incoming requests, rate limiting protects the server from abuse, and CORS plus JSON middleware support controlled client communication.

The backend also exposes meaningful operational endpoints. `/healthz` confirms that the service process is alive, while `/readyz` uses database readiness state to determine whether the application is actually prepared to handle production traffic. This distinction is important in modern deployment systems because an application may be running but still not be ready to serve requests safely.

Business functionality is implemented through models such as `Student`, `Attendance`, `Violation`, and `Complaint`. These models support domain-specific workflows such as resident registration, curfew rule enforcement, complaint creation, and violation-based fine calculation. Because the repository contains both business features and operational concerns in a single codebase, CI/CD becomes necessary to ensure changes do not accidentally break unrelated areas.

Prometheus instrumentation is another notable implementation detail. The project registers default metrics and custom metrics such as request duration, total HTTP requests, active requests, and database connection status. These metrics create a quantitative operational view of the system and can later be used for alerting, dashboarding, performance tuning, and troubleshooting.

### Containerization and artifact implementation

Containerization is defined in the `Dockerfile` using a deliberate two-stage build. In the dependency stage, the project installs production packages with `npm ci --omit=dev`, which improves repeatability and avoids unnecessary development-only modules in the final image. In the runtime stage, only the required application files and resolved dependencies are copied forward.

The runtime image uses Node 18 Alpine and runs the service as a non-root user. This is a strong security practice because it reduces the blast radius of a compromise inside the container. The Docker image also includes a native `HEALTHCHECK` that actively verifies the application through the `/healthz` endpoint, making it easier for runtime systems to identify unhealthy containers automatically.

### Workflow and infrastructure implementation

The CI/CD workflow stored in `.github/workflows/main.yml` is organized into five jobs. The first job prepares the Node.js environment, installs dependencies, runs an audit, and executes the test suite. This acts as the primary gatekeeper because there is no value in building or deploying an application that has already failed functional validation.

Once validation succeeds on the protected path, the workflow builds and pushes a Docker image to GitHub Container Registry. A separate security scan job then uses Trivy to examine the repository for high and critical vulnerabilities. In parallel, Kubernetes manifests are validated using `kubectl apply --dry-run=client`, which helps catch syntax or configuration issues before an actual cluster deployment attempt.

Operational readiness is further reinforced by the Docker Compose stack and the monitoring directory. Prometheus scrapes `/metrics`, Grafana provisions dashboards automatically, and the Kubernetes manifests add scaling, ingress routing, network restriction, and disruption control for more resilient deployment behavior. As a result, implementation is not isolated to the backend code alone; it spans the entire delivery lifecycle.

## Screenshots of Workflow and Output

The report version includes screenshots demonstrating the implemented workflow, deployment flow, testing evidence, and application interface. In README form, the same section is represented textually:

1. GitHub Actions workflow summary showing the five pipeline jobs.
2. RoomEase admin authentication screen used before entering the dashboard.
3. Student complaint portal provided by the RoomEase frontend.
4. Local Jest test result showing successful endpoint and route validation.
5. Docker Compose monitoring summary showing application, data, and observability services.

These visuals support the claim that RoomEase combines both application functionality and DevSecOps readiness within the same repository.

## Tool Comparisons

The project combines multiple tools because each one serves a different stage of software delivery. A comparison is useful because it explains not just what the project uses, but why those choices are reasonable for the given engineering goals.

| Area                   | Primary Tool         | Possible Alternative                 | Why It Fits RoomEase                                                                                                                                |
| ---------------------- | -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI orchestration       | GitHub Actions       | Jenkins / GitLab CI                  | GitHub Actions fits naturally because the repository is already hosted on GitHub and the workflow file is easy to maintain in source control.       |
| Local runtime          | Docker Compose       | Manual service startup               | Docker Compose is better for this project because it launches the application, database, and monitoring tools together in one reproducible command. |
| Container registry     | GHCR                 | Docker Hub                           | GHCR integrates smoothly with GitHub Actions permissions and keeps source repository and image distribution within the same ecosystem.              |
| Application deployment | Render               | Railway / Fly.io / self-hosted VM    | Render gives a simpler deployment path for a student project while still supporting automated release triggering.                                   |
| Scalable orchestration | Kubernetes           | Docker Swarm / standalone containers | Kubernetes is the stronger choice when autoscaling, service abstraction, ingress, and resilience policies are required.                             |
| Monitoring             | Prometheus + Grafana | Hosted APM platforms                 | This stack suits the project because it is open-source, widely adopted, and directly compatible with Prometheus metrics emitted by the application. |

These comparisons show that the RoomEase stack balances practicality and engineering maturity. The project uses approachable tools where simplicity is valuable and more advanced tools where scalability, security, or reliability justify the added complexity.

## Challenges Faced and Solutions

- Database connectivity must differ between local development and production. The project solves this by reading `MONGO_URI` from environment variables rather than hardcoding it, which keeps secrets out of source control and allows different environments to use different data backends.
- A production-ready release requires more than just application code. RoomEase addresses this by storing Docker, monitoring, and Kubernetes assets in the same repository so the operational layer evolves together with the software layer.
- Security and reliability checks can be forgotten during manual delivery. GitHub Actions, dependency auditing, security scanning, and manifest validation automate these checks before deployment proceeds.
- Deployment targets often need health-based orchestration. The project solves this through `/healthz` and `/readyz` endpoints, Docker health checks, and readiness-aware orchestration support.
- Scaling and safe rollout are harder in a single-host environment. The Kubernetes manifests add readiness checks, autoscaling, ingress rules, network policy, and disruption budgeting to improve controlled operation under load or maintenance conditions.
- Observability is often an afterthought in student projects. RoomEase explicitly addresses this challenge by exposing Prometheus metrics and provisioning Grafana dashboards, making the system easier to inspect and troubleshoot after deployment.

These challenges show that the difficult part of DevSecOps is not merely writing a workflow file. The real work lies in designing an application and repository structure that support automation, security, traceability, and operational confidence from the beginning.

## Use Case Demonstration

Consider a realistic use case in which the development team updates the complaint-handling experience so that students can report hostel issues more clearly and administrators can process them more efficiently. This kind of change might affect frontend forms, backend request handling, schema validation, and even deployment artifacts if dependencies or routes are modified.

After the updated code is pushed to the main branch, the GitHub Actions workflow begins automatically. The pipeline first checks out the repository, restores the Node.js environment, installs dependencies, and runs the automated test suite. This early gate is crucial because it prevents the team from spending time packaging and distributing changes that already violate expected behavior.

If validation succeeds, the workflow packages the updated RoomEase application into a Docker image and publishes it to GitHub Container Registry. This guarantees that the same release artifact can be consumed by deployment targets without rebuilding the application differently in each environment. In other words, the artifact tested by the pipeline is the same artifact later delivered to runtime infrastructure.

In the next stage of the same use case, the workflow continues beyond packaging and into release readiness. Trivy scans the repository for high and critical vulnerabilities, and Kubernetes manifests are validated through client-side dry runs. These actions ensure that the feature change is not only functionally acceptable but also operationally safe enough to promote.

Once the workflow reaches deployment, the Render deploy hook can trigger the production release path, while the Kubernetes manifests remain available for teams that want a cluster-based rollout. After deployment, administrators continue using the secured login interface to manage hostel operations, and students continue accessing the complaint portal shown earlier in the screenshots. The feature enhancement therefore reaches real users through an audited, automated, and repeatable release route.

Operationally, the application exposes `/healthz`, `/readyz`, and `/metrics`, allowing the hosting platform, Prometheus, and dashboard tooling to confirm availability after release. If a problem appears, logs, metrics, and health endpoints provide multiple signals that can guide diagnosis. This closes the DevSecOps loop by linking code change, validation, deployment, and runtime visibility into one continuous engineering lifecycle.

## References

- `PROJECT_EXPLAINED.md` - project overview, architecture explanation, and technology summary.
- `DEVOPS.md` - repository-level documentation for Docker, Kubernetes, CI/CD, security, and monitoring.
- `app.js` - backend application, middleware chain, health endpoints, metrics, and API logic.
- `package.json` - Node.js scripts, dependencies, and execution commands used in development and CI.
- `.github/workflows/main.yml` - GitHub Actions CI/CD pipeline definition.
- `Dockerfile` - multi-stage production image build configuration with non-root runtime execution.
- `docker-compose.yml` - local development stack with MongoDB, Prometheus, and Grafana.
- `k8s/README.md` and `k8s/*.yaml` - Kubernetes deployment, scaling, networking, and validation assets.
- `monitoring/prometheus/prometheus.yml` and Grafana provisioning files - observability configuration.
- `tests/health.test.js` - automated validation of health, headers, routes, and metadata APIs.
- `public/landing.html`, `public/admin-login.html`, `public/index.html`, and `public/student.html` - user interface components used by administrators and students.
