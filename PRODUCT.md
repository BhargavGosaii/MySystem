# MySystem Vision & Product Specification (PRODUCT.md)

This specification defines the core direction and non-goals of MySystem. Every agent, assistant, or developer working on this repository must align their contributions with these principles.

---

## 👥 Who the User Is
- **Target Audience**: Developers who can build applications (monoliths, SPAs, APIs) but do not know DevOps.
- **The "Vibe Coder" Profile**: They want a production-ready setup but do not want to learn AWS networking, Terraform resource declarations, Docker optimization, IAM profiles, or SSL certificate mapping. The AI handles these responsibilities.

## 🤝 The Promise
- **Autonomous Workflow**: The AI manages the entire lifecycle in one contiguous conversation: **Review → Fix (safe production issues) → Deploy (into user's own AWS account) → Monitor (with future scaling suggestions)**.
- **Zero Local DevOps Tooling**: The user's local machine does not need Docker, AWS CLI, or Terraform installed. Local configuration is generated, but compile and deployment execution occurs passwordless on GitHub Actions via secure AWS OIDC stack integrations.
- **Explainable Autofixes**: If a blocker or risk is found, safe options are applied automatically and explained, rather than throwing errors.

## 🚫 Non-Goals
- **Not a Multi-Cloud Platform**: Support is strictly opinionated and restricted to **AWS only**. Do not implement GCP, Azure, Hetzner, DigitalOcean, or Kubernetes.
- **Not a Generic DevOps Framework**: Do not write complex, customizable pipelines. Choose sensible, cost-optimized AWS defaults.
- **Not an Infrastructure Toolkit**: The CLI is a debugging/fallback interface. The core product is the autonomous reasoning engine.
