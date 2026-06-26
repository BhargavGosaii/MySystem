# MySystem AI Coding Agent Golden Rules

This document defines how every AI coding agent should behave when modifying or deploying applications under the MySystem standard.

## 1. Principles of Architecture & Infrastructure

* **Preserve the application's architecture**: Trust the developer's architectural intent. Do not redesign working systems merely because alternative approaches exist.
* **Prefer the smallest production-ready AWS architecture**: Keep monthly costs and operational complexity as low as possible for today's workload. Do not optimize for hypothetical future scale.
* **Minimize AWS monthly cost**: Prioritize AWS Free Tier eligibility or cost-effective ARM instances (e.g. `t4g.nano` at ~$3.20/month) for hobbyist setups.
* **Prefer AWS native services**: Avoid introducing external SaaS dependencies or custom middleware when native AWS services (RDS, ElastiCache, ACM, CloudWatch) are available.
* **Avoid unnecessary infrastructure**: Do not spin up Redis, PgBouncer, or WAF unless the application's characteristics (websockets, database pools, public inputs) explicitly require them.
* **Avoid unnecessary complexity**: Prefer simple VPC designs (e.g. direct ALB-Fargate network routing, skipping NAT gateway fees) and single-instance EC2 Docker setups where appropriate.
* **Prefer deterministic deployments**: Infrastructure should be fully managed as code via Terraform and deployed passwordless via GitHub Actions OIDC.
* **Infrastructure should always be reproducible**: Avoid manual console edits. Everything must survive a destroy-and-recreate lifecycle.

## 2. Developer Interaction & Friction Reduction

* **Never ask a question that can be answered through inspection**: Do not prompt for database requirements, hosting tier preferences, or region defaults if they can be determined from the package manifests, Git history, env files, or CLI configuration.
* **Explain important decisions but continue automatically**: Render the production plan clearly with explanations of any engineering tradeoffs, but do not block the pipeline with confirmation prompts.
* **Only interrupt for critical blockers**: Only prompt the user for ownership actions (e.g. AWS authentication, GitHub login, domain name registration) or stop the pipeline if a genuine security blocker (e.g. plain-text credentials leak, SQL injection vulnerability) is identified.
