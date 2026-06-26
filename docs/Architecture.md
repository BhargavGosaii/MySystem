# MySystem Architecture

MySystem is designed as a zero-dependency, local-first **AI Production Engineer** that coordinates software auditing, infrastructure generation, and secure deployments.

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

## 2. The 11-Step Workflow Engine

The `WorkflowEngine` is the sole coordinator of deployment lifecycle operations. No service invokes another service directly; all state and control flow are managed by the engine:

1. **Inspect Project**: Analyzes the directory to detect code frameworks, entry points, container ports, and dependencies.
2. **Engineering Review**: Executes deep security, database configuration, and telemetry scans.
3. **Automatically Apply Safe Infrastructure Fixes**: Generates missing Dockerfiles, health routes, and GitHub Actions pipelines automatically.
4. **Re-run Engineering Review**: Re-scans the repository to verify that auto-fixes resolved the target findings.
5. **Present Production Review Summary**: Compiles a review dashboard containing estimated AWS monthly costs, target strategies, and action items.
6. **Ask for Remaining Approvals**: Prompts the developer to approve high-risk code changes (such as database query rewrites or SQL injection safety).
7. **Prepare AWS Environment**: Ensures AWS CLI and GitHub CLI tools are installed and logged in, then deploys the OIDC credentials stack.
8. **Configure GitHub Actions**: Scaffolds standard Terraform configuration files (`/terraform`) and workflow templates.
9. **Deploy**: Builds, tags, and pushes Docker images to ECR, and deploys infrastructure passwordless via OIDC.
10. **Verify Deployment**: Tests live endpoints and files to verify successful provisioning.
11. **Generate Production Summary**: Produces a human-readable summary of live application metadata and lists future optimization upgrade suggestions.

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
