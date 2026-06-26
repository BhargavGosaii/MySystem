# MySystem Product Specification (PRODUCT.md)

This document defines the core product vision, target audience, promises, and non-goals for MySystem. It aligns contributors and AI agents on implementation boundaries.

---

## 👥 Target Audience
* **Vibe Coders & Developers**: Individuals who can build applications (monoliths, APIs, Single Page Apps) but do not want to learn AWS configuration, Terraform syntax, Docker performance tuning, network subnets, IAM policies, or SSL routing.
* **Outcome-Obsessed**: Users who view hosting and deployment as "plumbing" and want their applications to be secure, cost-optimized, and deployed into their own AWS accounts with zero manual effort.

---

## 🤝 The Product Promise

* **Strict Engineering Verification**: The Advisor evaluates the application characteristics and proposed changes, verifies the AI agent's decisions against the AWS Production Standard, and highlights any security, cost, or reliability risks.
* **Zero-Decision Deployment**: The entire lifecycle executes inside a single conversation: **Inspect → Review → AutoFix → Advisor Judgment → Production Plan → Provision → Deploy → Verify**. The only manual inputs required are AWS authentication, GitHub authentication, and custom domain DNS configuration.
* **Clean & Transparent**: No hidden markups or proprietary hosting lock-in. Everything is deployed directly to the user's personal AWS account using wholesale-pricing architecture defaults. All decisions are explained with reasoning.
* **AI-First Integration**: Designed from the ground up to be discovered, run, and followed by IDE-based AI coding agents.

---

## 🧠 The Advisor

The Advisor is MySystem's engineering verification layer. It is the single authoritative component responsible for auditing and validating production decisions.

**Decision Types:**
* **SAFE**: Infrastructure changes that always proceed automatically (Docker, CloudWatch, Budget Alerts, Region).
* **RECOMMENDATION**: Engineering recommendations where multiple reasonable solutions exist (EC2 vs ECS, Redis, PgBouncer). Applied automatically with reasoning. Overridable later.
* **BLOCKER**: Conditions that stop deployment (SQL injection, authentication failures, missing AWS credentials).

**Golden Rule:** Never ask the developer a question if the answer can be determined from source code, configuration files, existing infrastructure, or production engineering best practices.

---

## 🚫 Non-Goals (Scope Freeze)
* **No Multi-Cloud Support**: Support is strictly restricted to AWS. Do not introduce configurations for GCP, Azure, DigitalOcean, Hetzner, or generic providers.
* **No Kubernetes**: Maintain lightweight, cost-effective EC2 monolith and ECS Fargate deployments. Do not introduce EKS or complex container orchestrators.
* **No Complex Customization**: Do not implement extensive, customizable pipelines. Choose sensible, flat-fee AWS defaults (such as direct ALB routing without NAT Gateways for ECS) to keep costs minimal.
* **No Interactive Configuration**: Do not prompt the developer with infrastructure questions. Inspect, decide, explain.
