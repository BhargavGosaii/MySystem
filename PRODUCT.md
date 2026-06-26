# MySystem Product Specification (PRODUCT.md)

This document defines the core product vision, target audience, promises, and non-goals for MySystem. It aligns contributors and AI agents on implementation boundaries.

---

## 👥 Target Audience
* **Vibe Coders & Developers**: Individuals who can build applications (monoliths, APIs, Single Page Apps) but do not want to learn AWS configuration, Terraform syntax, Docker performance tuning, network subnets, IAM policies, or SSL routing.
* **Outcome-Obsessed**: Users who view hosting and deployment as "plumbing" and want their applications to be secure, cost-optimized, and deployed into their own AWS accounts with zero manual effort.

---

## 🤝 The Product Promise
* **Autonomous Operations**: The engine executes the complete lifecycle inside a single conversation: **Review → AutoFix safe issues → Ask for minimal approvals → Provision AWS infrastructure → Verify deployment → Stream log telemetry**.
* **Clean & Transparent**: No hidden markups or proprietary hosting lock-in. Everything is deployed directly to the user's personal AWS account using wholesale-pricing architecture defaults.
* **AI-First Integration**: Designed from the ground up to be discovered, run, and maintained by IDE-based AI coding agents.

---

## 🚫 Non-Goals (Scope Freeze)
* **No Multi-Cloud Support**: Support is strictly restricted to AWS. Do not introduce configurations for GCP, Azure, DigitalOcean, Hetzner, or generic providers.
* **No Kubernetes**: Maintain lightweight, cost-effective EC2 monolith and ECS Fargate deployments. Do not introduce EKS or complex container orchestrators.
* **No Complex Customization**: Do not implement extensive, customizable pipelines. Choose sensible, flat-fee AWS defaults (such as direct ALB routing without NAT Gateways for ECS) to keep costs minimal.
