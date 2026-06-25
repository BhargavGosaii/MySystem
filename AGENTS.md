# MySystem Agent Guidelines (AGENTS.md)

This file contains critical production-readiness instructions for AI coding agents (Cursor, Claude Code, Lovable, Bolt, Antigravity, etc.).

> [!IMPORTANT]
> **To the AI Agent**: You MUST read and follow these rules when editing or creating code in this codebase.

---

## 1. Core Production Architecture Rules

### 1.1 Port & Port Binding
* Always bind the application web server to the port specified in the `PORT` environment variable.
* If `PORT` is not defined, fall back to a standard default (e.g., `3000` or `8080`), but never hardcode the listen port without checking `process.env.PORT` (Node) or `os.environ.get("PORT")` (Python).

### 1.2 Health Check Endpoint
* The application must expose a GET `/health` or `/healthz` endpoint.
* It must return a `200 OK` response (preferably JSON, e.g., `{"status": "healthy"}`) with no authentication required.
* The AWS Load Balancer uses this endpoint to verify if the container is running. If it fails, the container will be terminated and replaced.

### 1.3 Statelessness & File Storage
* Do NOT write persistent files to the local container filesystem. The container instances are ephemeral and can be destroyed at any time.
* For file uploads, use an external object storage service (e.g., AWS S3).
* For temporary processing, use the system `/tmp` directory, but expect it to disappear.

### 1.4 Environment Variables & Secrets
* Never hardcode API keys, database credentials, passwords, or secrets.
* Always read configurations from environment variables.
* Generate a sample `.env.example` file when adding new environment variables.

### 1.5 Database Migrations
* Ensure database migrations are safe to run concurrently or executed as a single-run step during deployment (never inside the web server's startup command if scaling to multiple container instances).
* Design database changes to be backward-compatible (e.g., add new columns as nullable, deprecate columns in a two-stage deployment).

### 1.6 Logging & Error Tracking (Sentry & Pino)
* **Structured Logging**: For Node.js/TypeScript applications, format production logs in JSON using `pino` (or standard JSON formatters in Python/Go) for easy querying in CloudWatch. Avoid plain-text print statements in production.
* **Error Tracking**: If the `SENTRY_DSN` environment variable is present:
  1. Install the appropriate Sentry SDK (e.g., `@sentry/nextjs` for Next.js, `@sentry/node` for Node, or `sentry-sdk` for Python).
  2. Initialize the SDK in the application entrypoint.
  3. Ensure unhandled exceptions and runtime errors are automatically captured and reported to Sentry.

### 1.7 EC2 Instance Sizing (Hobbyist Tier)
If the project is configured to use the **Hobbyist Tier** (single EC2 + Docker Compose), you must select and manage the `instance_type` parameter in `terraform/terraform.tfvars` according to the application footprint:
* **Micro-services / Static Frontends (Vite/React)**: Use `t4g.nano` (ARM64, 0.5GB RAM, ~$3.20/month) for maximum savings.
* **Standard Frameworks (Express, Next.js, FastAPI + Postgres)**: Use `t3.micro` (x86, 1GB RAM, **AWS Free Tier eligible**).
* **Medium Apps (App + Postgres + Redis or memory-intensive runtimes)**: Use `t3.small` (2GB RAM, ~$16/month) to prevent Out-Of-Memory (OOM) crashes.
* **Large Monoliths**: Scale to `t3.medium` (4GB RAM, ~$32/month) or larger when active traffic warrants it.
* *Note: When deploying on t4g (ARM) instances, ensure the Dockerfile is compiled for arm64.*

---

## 2. Docker & Container Rules
* Do not modify the `Dockerfile` in a way that breaks multi-stage optimization.
* Keep container images small by using minimal base images (e.g., alpine or slim variants).
* Always run the container application under a non-root user (e.g., `node` in Node.js) for security.

---

## 3. Automated Git Push Workflow (Vibecoder Deployment)
If the user tells you: **"I have set up the OIDC role / GitHub secrets"** or **"Deploy the app now"**:

1. **Verify Git Status**: Run `git status` via terminal to verify the changes.
2. **Stage files**: Run `git add .` to stage the changes.
3. **Commit**: Commit with a clean message: `git commit -m "chore: configure MySystem deployment assets"`
4. **Push**: Identify the active branch (usually `main` or `master`) and push it: `git push origin main`
5. **Confirm**: Let the user know the push was successful and the GitHub Actions deployment pipeline has been triggered.
