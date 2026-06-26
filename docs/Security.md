# Security Architecture

MySystem is designed as an **AI Production Engineer** that reviews, fixes, and deploys applications directly to your own AWS account. Security is the foundation of this design. By deploying directly into your AWS account, MySystem eliminates SaaS vendor lock-in and ensures that you retain 100% ownership of your infrastructure, logs, and data.

This document outlines the core security practices, authentication mechanisms, IAM scoping rules, and secrets containment strategies utilized by MySystem.

---

## 1. Zero-Credential AWS Access (GitHub OIDC)

MySystem strictly avoids the use of long-lived AWS IAM Access Keys and Secret Keys. Storing permanent credentials in GitHub repository secrets is a significant security risk.

Instead, MySystem leverages **OpenID Connect (OIDC)** to establish a secure trust relationship between GitHub Actions and your AWS account.

### How OIDC Works in MySystem:
1. **Trust Relationship**: During the initial bootstrap (`npx -y mysystem-cli init`), MySystem configures an OIDC Identity Provider (IdP) in your AWS account specifically for GitHub Actions.
2. **Short-Lived Credentials**: When a deployment workflow runs in GitHub Actions, it requests a temporary, JSON Web Token (JWT) from GitHub's OIDC provider.
3. **STS Assume Role**: GitHub Actions presents this JWT to the AWS Security Token Service (STS) via the `aws-actions/configure-aws-credentials` action. AWS validates the token signature and returns short-lived IAM credentials (valid for a default of 1 hour).
4. **Least-Privilege Scoping**: The IAM Role assumed by GitHub Actions is scoped strictly to the specific repository and branch executing the deployment.

---

## 2. Least-Privilege IAM Scoping

MySystem provisions infrastructure using Terraform. The IAM roles created for the application runtime conform to the principle of least privilege:

### Execution Role (ECS / EC2)
* **Purpose**: Used by the container agent to pull images and write logs.
* **Permissions**:
  * Read-only access to the specific Amazon Elastic Container Registry (ECR) repository.
  * Permission to create CloudWatch Log Groups, Log Streams, and write log events (`logs:CreateLogStream`, `logs:PutLogEvents`).

### Task Role / Instance Profile
* **Purpose**: Used by the running application code to interact with AWS services.
* **Permissions**:
  * Scoped to specific resources (e.g., read/write access to the application's S3 bucket, if configured).
  * Absolutely no admin or broad permissions are granted by default.
  * If the application does not require AWS service access, the task role is assigned empty permissions.

---

## 3. Secrets Containment & Environment Variables

Hardcoded secrets (API keys, database passwords, tokens) are one of the most common causes of production breaches. MySystem enforces strict secrets containment:

### Core Rules for Secrets:
1. **No Hardcoding**: Secrets must never be committed to source control.
2. **Environment Injection**: Application configurations and credentials must be read from environment variables at runtime.
3. **AWS Systems Manager (SSM) Parameter Store**:
   * Sensitive variables (e.g., database passwords, external API keys) are stored as `SecureString` parameters in AWS SSM.
   * During container startup, these secrets are injected directly into the container environment. They are never written to the disk or Docker images.
4. **Stateless Ephemeral Containers**: The local container filesystem is treated as read-only and ephemeral. Temp files must only write to `/tmp` and are discarded when the container terminates.

---

## 4. Error Tracking & Observability Security

When `SENTRY_DSN` is configured, MySystem integrates Sentry to capture runtime errors:
* **PII Scrubbing**: Ensure your Sentry SDK initialization is configured to scrub Personally Identifiable Information (PII) such as passwords, credit card numbers, and authorization headers before transmitting logs.
* **Structured Logging**: MySystem mandates JSON-formatted structured logging (using libraries like `pino` in Node.js) to avoid printing multi-line stack traces containing sensitive variables to standard output, which gets forwarded to CloudWatch.

---

## 5. Security Reviews during AI Engineering Review

As an **AI Production Engineer**, MySystem performs an Engineering Review step before every deployment:
* **Code Scanning**: It looks for hardcoded keys, passwords, and open ports.
* **Port Binding**: It ensures the web server only binds to the dynamic `PORT` environment variable.
* **Health Check Scoping**: It verifies that the `/health` or `/healthz` endpoint is open and doesn't leak internal system diagnostics or require authentication.
