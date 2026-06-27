# MySystem Architecture

MySystem is designed as a zero-dependency, local-first **open-source Production Engineering Standard** that coordinates software verification, infrastructure auditing, and secure deployments. 

**"The AI owns the application. MySystem owns production readiness."**

---

## 1. System Design

MySystem is structured into modular components within a TypeScript workspace:

```
├── packages/cli/src/
│   ├── commands/         # Thin CLI interfaces (init, audit, logs, destroy)
│   ├── services/         # Domain-specific modules (inspect, review, plan, deploy, verify, monitor)
│   ├── utils/            # Helper utilities (tool installers)
│   └── workflow/         # Workflow Engine state machine & manifests
```

---

## 2. The Workflow Engine

The `WorkflowEngine` is the sole coordinator of deployment lifecycle operations. No service invokes another service directly; all state and control flow are managed by the engine:

1. **Inspect Project**: Analyzes the directory to detect code frameworks, entry points, container ports, and dependencies.
2. **Production Review**: Executes deep security, database configuration, and telemetry scans against the Production Standards.
3. **Automatically Apply Safe Infrastructure Fixes**: Generates missing Dockerfiles, health routes, and GitHub Actions pipelines automatically.
4. **Re-run Production Review**: Re-scans the repository to verify that auto-fixes resolved the target findings.
5. **Production Plan Generation**: The verification engine evaluates all project characteristics and AI choices against the Production Standards to verify the hosting tier, database, caching, security, monitoring, and region. Decisions are rendered as a Production Plan. If any BLOCKER decisions exist, the workflow halts. Otherwise, it continues automatically.
6. **Prepare AWS Environment**: Ensures AWS CLI and GitHub CLI tools are installed and logged in, then deploys the OIDC credentials stack.
7. **Configure GitHub Actions**: Scaffolds standard Terraform configuration files (`/terraform`) and workflow templates.
8. **Deploy**: Builds, tags, and pushes Docker images to ECR, and deploys infrastructure passwordless via OIDC.
9. **Verify Deployment**: Tests live endpoints and files to verify successful provisioning.
10. **Generate Production Summary**: Produces a human-readable summary of live application metadata and lists future optimization upgrade suggestions.

The workflow requires **zero infrastructure knowledge** from the developer. The only manual inputs are AWS authentication, GitHub authentication, and custom domain DNS configuration.

---

## 3. OIDC Trust Security Model

MySystem uses **AWS OIDC (OpenID Connect)** for secure, passwordless integrations. 

During the preparation phase:
1. MySystem deploys the `bootstrap-oidc.yaml` CloudFormation template to your AWS account.
2. This provisions an IAM Role (`MySystemDeployRole-${GitHubRepo}`) that trusts the official GitHub Actions identity provider.
3. The trust policy is configured with strict repository conditions (`repo:${GitHubOrg}/${GitHubRepo}:*`).
4. The Role ARN is registered directly in your GitHub Repository Secrets as `AWS_ROLE_ARN`.
5. During execution, GitHub Actions requests a short-lived token from AWS STS to assume the role. No persistent AWS access keys or passwords are ever stored.

---

## 4. The Review Service & Analyzers

Auditing checks are modularized under `packages/cli/src/services/review/`:
* **Architecture Analyzer**: Verifies Dockerfile structures, builds, and CI/CD triggers.
* **Security Analyzer**: Scans for OWASP Top 10 vulnerabilities, raw SQL injections, and hardcoded credentials.
* **Database Analyzer**: Validates connection pooling (PgBouncer), database structures, and database migration safety.
* **Observability Analyzer**: Verifies health routes, structured logging (`pino`), and unhandled exception trackers (`sentry`).

---

## 5. Environment Synthesis Engine

During the **Planning** phase, the Environment Synthesis Engine (`packages/cli/src/services/synthesis.ts`) translates the generated Production Plan into a complete container and runtime system:

* **Conventions Mapping**: Scans files like `.env`, `.env.example`, and config files to inherit existing conventions, secrets, and database settings.
* **Database Preservation**: If an existing external database (e.g. Supabase, Neon, RDS) is detected, MySystem maintains the existing connection rather than provisioning a new database.
* **PostgreSQL Containers**: When self-hosted PostgreSQL is recommended, MySystem generates a local database service (`postgres:16-alpine`), dynamic credential variables, and persistent docker volumes.
* **Automated Migrations**: Resolves the ORM type (Prisma, Drizzle, TypeORM, Sequelize, Knex, SQLAlchemy/Alembic, Django ORM) and constructs the appropriate container startup command to execute schema migrations immediately once the database health check passes.
* **Docker Compose Synthesis**: Automatically outputs `docker-compose.yml` with dependencies, limits, logging, and startup orchestration predefined.
* **Environment Sandboxing**: Populates synthesized environment files inside `.mysystem/env/` (e.g. `production.env`) without altering the developer's local `.env`.
* **Disaster Recovery**: Synthesizes a daily database backup script (`backup.sh`) and database recovery instruction guides (`restore.md`).

---

## 6. Evaluation Mode & Deployment Detection

Before MySystem initializes AWS stacks or configures GitHub workflows, it executes a non-destructive dry-run review called **Evaluation Mode**:

* **State Detection**:
  * **Local Manifest Check**: Queries `.mysystem/manifest.json` and `mysystem.json` to verify previous deployment logs.
  * **AWS Infrastructure Query**: Uses the local project name to query ECR repository status (`aws ecr describe-repositories`) and CloudFormation status (`aws cloudformation describe-stacks`) to determine if active AWS resources already exist.
* **Blueprint Generation**: Summarizes what modifications will be made, monthly costs, and lists every step the engine will execute in chronological order.
* **Developer Confirmation Prompt**: Uses a readline-based prompt (`? Do you want to proceed with this deployment? (y/N)`) to gate the deployment pipeline, requiring explicit consent to go ahead. In testing/CI contexts, this prompt is bypassed automatically if `NODE_ENV=test` or `MYSYSTEM_AUTO_APPROVE=true`.

---

## 7. The Production Review and Plan Engine

The verification engine (`packages/cli/src/advisor/`) is MySystem's core reasoning component. It is responsible for reading project characteristics, evaluating engineering knowledge, verifying the AI coding agent's choices against the Production Standards, and producing the Production Plan.

### Architecture Flow

```
AI Coding Agent (builds app) ➔ MySystem Standard (reviews & validates) ➔ Production Plan ➔ Terraform/Actions ➔ AWS (provisions)
```

### Decision Types

| Type | Behavior | Examples |
|------|----------|----------|
| **SAFE** | Applied automatically. No explanation needed. | Dockerfile, CloudWatch, Budget Alerts, Region |
| **RECOMMENDATION** | Applied automatically. Reasoning is displayed. Override possible later. | EC2 vs ECS Fargate, Redis, PgBouncer, WAF |
| **BLOCKER** | Halts deployment. Explains the issue. Requires resolution. | SQL injection, auth failures, Terraform errors |

### Knowledge-Driven Decisions

Decision logic is not hardcoded in TypeScript. Instead, each infrastructure component has a Markdown knowledge file under `packages/cli/src/knowledge/architecture/` containing:

* **Purpose**: What the component does.
* **When to Use / When NOT to Use**: Engineering guidance.
* **Strong Indicators**: Package names and patterns that signal need.
* **Trade-offs**: Pros, cons, and alternatives.
* **Confidence Rules**: Structured IF/THEN rules that the interpreter parses to produce decisions.

Adding support for new technologies primarily involves adding or updating knowledge documents, not modifying decision logic.

### Optimization Pass

After all decisions are produced, the verification engine runs a cost optimization sweep:
* Removes Redis if no queue, WebSocket, or session indicators exist.
* Removes PgBouncer if the hosting tier is EC2 (single-instance connection pool is sufficient).
* Removes WAF if no database routes exist to protect.
* Selects the smallest viable EC2 instance tier based on framework footprint.
