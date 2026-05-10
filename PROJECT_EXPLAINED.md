# RoomEase Project Explained in Simple DevSecOps Language

This document explains the project in easy language so you can understand:

- what this project does
- how the frontend, backend, and database work together
- how Docker is used
- how a Docker image becomes a running container
- how GitHub Actions helps in CI
- how Render helps in CD
- what the GitHub Actions YAML file contains
- what kind of Docker setup is used in this repo

## 1. What this project is

This project is called `RoomEase`.

It is a hostel management system where:

- admins can manage students
- admins can record attendance entries and exits
- admins can track hostel violations and fines
- students can use a student-facing page
- students can submit complaints

From the code structure, this is a full-stack web application built mainly with:

- `Node.js`
- `Express.js`
- `MongoDB`
- `Mongoose`
- HTML, CSS, and browser JavaScript
- Docker
- GitHub Actions
- Render

## 2. High-level architecture

The project works like this:

1. A user opens the website in the browser.
2. The frontend pages load from the Express server.
3. The frontend sends API requests to the backend.
4. The backend processes those requests.
5. The backend talks to MongoDB through Mongoose.
6. The database stores or returns data.
7. The backend sends the result back to the frontend.

In simple flow form:

`Browser -> Frontend page -> Express backend -> Mongoose -> MongoDB`

## 3. Frontend, backend, and database in easy language

### Frontend

The frontend is the part the user sees in the browser.

In this repo, the frontend files are inside `public/`:

- `public/landing.html`
- `public/index.html`
- `public/student.html`
- `public/style.css`
- `public/app.js`

What they do:

- `landing.html` is the landing page
- `index.html` looks like the admin portal
- `student.html` is the student portal
- `style.css` controls the design
- `app.js` contains browser-side logic like fetching students, attendance, violations, and complaints

So the frontend is a static frontend served directly by Express.

### Backend

The backend is the server-side logic.

In this repo, the main backend file is:

- `app.js`

This backend:

- starts the Express server
- connects to MongoDB
- serves the frontend files
- provides API routes like `/students`, `/attendance`, `/violations`, and `/complaints`
- adds security middleware like `helmet` and rate limiting
- exposes health endpoints like `/healthz` and `/readyz`

So the backend is the "brain" of the app.

### Database

The database is MongoDB.

MongoDB stores the app data in collections. In this project, the main data models are:

- `Student`
- `Attendance`
- `Violation`
- `Complaint`

These are defined in:

- `models/Student.js`
- `models/Attendance.js`
- `models/Violation.js`
- `models/Complaint.js`

Mongoose is used as the bridge between Node.js and MongoDB.

That means:

- your code works with JavaScript objects
- Mongoose converts them into MongoDB documents
- Mongoose also helps define schema rules

## 4. How the database connection works

The backend connects to MongoDB using this environment variable:

- `MONGO_URI`

This is loaded from `.env` using `dotenv`.

In `app.js`, the code does:

- `mongoose.connect(process.env.MONGO_URI)`

That means the backend does not hardcode the database address.
It reads the database connection string from the environment.

Why this is good in DevSecOps terms:

- secrets are not hardcoded in source code
- local and production environments can use different databases
- deployment becomes safer and more flexible

### Local database connection

In `docker-compose.yml`, the app connects to:

- `mongodb://mongo:27017/roomease`

Here:

- `mongo` is the service name of the MongoDB container
- `27017` is MongoDB's port
- `roomease` is the database name

So inside Docker Compose, the app container talks to the database container over the internal Docker network.

### Production database connection

In `.env.example`, there is also an example for MongoDB Atlas:

- `mongodb+srv://...`

That means production is designed to use a managed cloud MongoDB database, most likely MongoDB Atlas.

## 5. What kind of backend design is used here

This project currently uses a simple backend structure where most API routes live in one main file:

- `app.js`

So this is a monolithic Express app, not a microservices setup.

That means:

- one Node.js app handles frontend serving and backend APIs
- all major backend logic is currently in one service
- deployment is simpler
- scaling is easier to understand for beginners

## 6. How Docker is used in this project

Docker is used to package the application into a consistent runtime environment.

In simple words, Docker helps make sure the app runs the same way:

- on your laptop
- in CI
- on Render
- in Kubernetes

### Role of Docker in this project

Docker helps with:

- packaging the Node.js app
- making deployment repeatable
- keeping dependencies consistent
- supporting local development with MongoDB
- making cloud deployment easier

Without Docker, you would need to manually set up Node, packages, and sometimes database services differently on every machine.

## 7. Docker image vs container in simple terms

This is one of the most important ideas:

### Docker image

A Docker image is a packaged blueprint.

It contains:

- the operating system base layer
- Node.js runtime
- application code
- installed dependencies
- startup instructions

In this repo, the blueprint is created from:

- `Dockerfile`

### Docker container

A container is a running instance of the image.

You can think of it like this:

- image = template
- container = running app created from that template

### How it happens in this project

1. Docker reads the `Dockerfile`.
2. Docker builds an image.
3. Docker runs that image as a container.
4. The container starts `node app.js`.
5. The app begins listening on port `3000`.

## 8. What kind of Docker setup is used here

This repo uses more than one Docker-related concept:

### A. Multi-stage Dockerfile

The `Dockerfile` uses a multi-stage build.

Stages in this repo:

- `deps`
- `runtime`

Why this is useful:

- install dependencies in one stage
- copy only the needed output into the final stage
- keep the final image smaller and cleaner

### B. Alpine-based Node image

The base image is:

- `node:18-alpine`

This means:

- Node.js version 18 is used
- Alpine Linux is used as the base
- the image stays lighter than a full Ubuntu-style image

### C. Non-root container

The Dockerfile creates a non-root user:

- `roomease`

This is a security best practice because the app does not run as `root`.

### D. Docker Compose for local multi-container setup

The project uses:

- `docker-compose.yml`

This starts two containers locally:

1. `app`
2. `mongo`

So the local setup is a multi-container development environment.

### E. Official MongoDB image

The MongoDB container uses:

- `mongo:7`

So the project uses:

- a custom app image built from the repo's `Dockerfile`
- an official MongoDB image from Docker Hub for local development

## 9. How `docker-compose.yml` helps

`docker-compose.yml` is used to run multiple related containers together.

In this project it does the following:

- builds the app image from the local `Dockerfile`
- starts the app container
- pulls and starts a MongoDB container
- connects them on the same Docker network
- maps ports to your machine
- adds health checks
- keeps MongoDB data in a Docker volume

### Important details from this file

For the `app` service:

- builds from the current folder
- exposes `3000:3000`
- sets `NODE_ENV=development`
- sets `MONGO_URI=mongodb://mongo:27017/roomease`
- waits for MongoDB to be healthy

For the `mongo` service:

- uses `mongo:7`
- exposes `27017:27017`
- stores data in `mongo_data`

This is very useful for development because one command can start the whole local environment.

## 10. How GitHub Actions helps in CI

CI means Continuous Integration.

In simple words, CI means:

"Whenever code changes are pushed, automatically check whether the project still builds, tests pass, and security checks look okay."

This repo uses GitHub Actions for CI through:

- `.github/workflows/main.yml`

### What GitHub Actions is doing here

When code is pushed to `main`, or when a pull request targets `main`, GitHub Actions automatically runs workflow jobs.

That helps by:

- reducing manual checking
- catching problems early
- running tests automatically
- checking Docker builds
- scanning for vulnerabilities
- validating Kubernetes YAML files

So GitHub Actions acts like an automated quality and delivery pipeline.

## 11. What instructions the CI YAML file contains

The YAML file is:

- `.github/workflows/main.yml`

This file tells GitHub Actions:

- when to run
- which environment to use
- which jobs to run
- what steps belong in each job
- which jobs depend on others
- when deployment should happen

### Main sections inside the YAML

#### `name`

Gives the workflow a name:

- `CI/CD Pipeline`

#### `on`

Defines when the workflow runs:

- push to `main`
- pull request to `main`

#### `env`

Defines shared environment variables such as:

- `REGISTRY=ghcr.io`
- `IMAGE_NAME=${{ github.repository }}`
- `NODE_VERSION=18`

#### `jobs`

Defines the major tasks the workflow will run.

This repo has 5 jobs:

1. `lint-and-test`
2. `docker-build-push`
3. `security-scan`
4. `k8s-validate`
5. `deploy-render`

## 12. Easy explanation of each CI/CD job

### Job 1: `lint-and-test`

Despite the name, this job currently does not run a lint command.
It mainly does install, audit, test, and coverage upload.

Steps:

1. checkout the repo
2. install Node.js 18
3. cache npm dependencies
4. run `npm ci`
5. run `npm audit --audit-level=high || true`
6. run `npm run test:ci`
7. upload the coverage report

Important note:

- `npm audit --audit-level=high || true` means vulnerabilities are reported, but they do not fail the job because of `|| true`

### Job 2: `docker-build-push`

This job runs only after the first job succeeds, and only on pushes to `main`.

Steps:

1. checkout the code
2. set up Docker Buildx
3. log in to GitHub Container Registry
4. generate image tags and labels
5. build the Docker image
6. push the image to `ghcr.io`

Why this matters:

- every successful main-branch push can produce a deployable Docker image
- the image becomes available in GitHub Container Registry

### Job 3: `security-scan`

This job runs Trivy after the Docker build job.

It scans the repository filesystem for high and critical vulnerabilities.

This supports DevSecOps because security checking becomes part of the pipeline instead of being done only at the end.

### Job 4: `k8s-validate`

This job checks the Kubernetes YAML files in `k8s/`.

It uses:

- `kubectl apply --dry-run=client`

That means:

- GitHub Actions checks whether the Kubernetes manifests are structurally valid
- it does not actually deploy them in this job

### Job 5: `deploy-render`

This job is the CD part for Render.

It runs only on pushes to `main`.

It checks whether a secret called `RENDER_DEPLOY_HOOK` exists.

If it exists:

- GitHub Actions calls the Render deploy hook URL
- Render starts a deployment

If it does not exist:

- the job prints a message
- the repo expects Render auto-deploy from `main` if enabled in the Render dashboard

## 13. How Render helps in CD

CD means Continuous Deployment or Continuous Delivery.

In simple words, CD means:

"After the code has been checked and built, send the new version to the live environment."

Render helps here by acting as the hosting platform for the deployed application.

### What Render is doing in this project

Render likely does these things:

- hosts the web service
- builds the app from the Dockerfile
- runs the app as a container
- provides public access to the app
- manages environment variables in its dashboard
- can auto-deploy when code changes

### Important repo-specific note about Render

There is no `render.yaml` file in this repo.

That usually means Render is probably configured through the Render dashboard instead of being fully defined in code.

So in this project, Render CD is likely working in one of these two ways:

1. Render watches the GitHub repo and auto-deploys from `main`
2. GitHub Actions triggers Render using the `RENDER_DEPLOY_HOOK` secret

## 14. How Docker and Render work together

In this project, Render and Docker work together like this:

1. your repo contains a `Dockerfile`
2. Render detects the Dockerfile
3. Render builds a Docker image from it
4. Render runs that image as a live container
5. users access the app through Render's public URL

So Docker defines how the app should be packed and started, and Render provides the platform that runs it.

## 15. DevSecOps ideas used in this project

DevSecOps means development, security, and operations are treated as one continuous flow instead of separate silos.

This project shows DevSecOps practices in several places:

### Development

- app code is version controlled
- automated tests exist in `tests/health.test.js`
- environment variables are documented in `.env.example`

### Security

- `helmet` adds security headers
- `express-rate-limit` helps reduce abuse
- `npm audit` checks package vulnerabilities
- Trivy performs a security scan in GitHub Actions
- the Docker container runs as a non-root user
- secrets are expected to come from environment variables

### Operations

- Docker standardizes runtime behavior
- Docker Compose simplifies local environments
- health endpoints support monitoring
- GitHub Actions automates pipeline tasks
- Render handles deployment
- Kubernetes manifests exist for a more advanced deployment path

## 16. Health checks and why they matter

The app exposes:

- `/healthz`
- `/readyz`

### `/healthz`

This checks whether the app process is alive.

### `/readyz`

This checks whether the app is ready, especially whether MongoDB is connected.

Why this matters:

- Docker can use health checks
- Render can use service health information
- Kubernetes can decide whether a pod is ready to receive traffic

This is a good operations practice.

## 17. How testing works in this project

The test file is:

- `tests/health.test.js`

It tests things like:

- `/healthz`
- `/readyz`
- security headers
- HTML routes like `/`, `/admin`, and `/student`
- violation metadata endpoint

An important design detail is that the tests mock Mongoose instead of depending on a real MongoDB server.

That makes CI faster and simpler.

## 18. YAML file summary in one simple sentence

The GitHub Actions YAML file is basically a set of instructions that says:

"When code reaches `main`, test it, audit it, build a Docker image, scan it, validate Kubernetes files, and then trigger deployment to Render."

## 19. One simple example of the full flow

Here is the full journey in plain language:

1. A developer pushes code to GitHub.
2. GitHub Actions starts running the workflow.
3. The workflow installs dependencies and runs tests.
4. If tests pass, it builds a Docker image.
5. That image is pushed to GitHub Container Registry.
6. A security scan is run.
7. Kubernetes YAML files are checked.
8. Render is triggered to deploy.
9. Render builds or runs the app container.
10. The live app connects to MongoDB and serves users.

## 20. Important repo notes you should know

These are helpful observations from the current repository:

### Render setup is external

There is no `render.yaml`, so Render configuration is probably stored in the Render dashboard, not in the repo.

### The workflow name says "Lint & Test" but there is no lint step

The first job is called `lint-and-test`, but it currently runs install, audit, tests, and coverage upload.

### Dockerfile may need a small cleanup

The Dockerfile tries to copy:

- `controllers/`
- `routes/`

But those folders are not present in the current repo, and most logic is inside `app.js`.

So the Dockerfile appears to reflect an older or planned folder structure.

## 21. Final understanding in very simple words

This project is a Node.js hostel management app with a static frontend, an Express backend, and a MongoDB database.

Docker packages the app so it can run the same way everywhere.
Docker Compose runs both the app and MongoDB locally.
GitHub Actions checks code quality, tests, security, and build steps automatically.
Render is used to host and deploy the application.
The YAML file is the instruction sheet that tells GitHub Actions what to do.

If you understand these five ideas, you understand the core DevSecOps story of this project:

1. code lives in GitHub
2. CI checks it automatically
3. Docker packages it
4. Render deploys it
5. MongoDB stores the data
