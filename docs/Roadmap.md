# MySystem Roadmap

This document outlines the v1 scope boundaries and future growth plans for MySystem.

---

## 1. Scope Boundaries (v1 Freeze)

MySystem enforces a strict scope freeze to optimize for reliability, performance, and simplicity:
* **Cloud Provider**: AWS only. Azure, Google Cloud Platform, Hetzner, and other cloud providers are out of scope.
* **Compute Services**: EC2 Monolith (Hobbyist) and ECS Fargate (Production). Kubernetes, bare-metal server configurations, and EKS are out of scope.
* **Database**: PostgreSQL (Dockerized for Hobbyist, AWS RDS for Production). Other database engines (MySQL, MSSQL, MongoDB) are out of scope for v1.
* **Distribution Channel**: Node-based CLI distributed via npm (`mysystem-cli`). Native binary installations, desktop UI wrappers, or SaaS management dashboards are out of scope.

---

## 2. Upcoming Refinements (v2 Planning)

The following capabilities are candidate items for future releases:

### Infrastructure Enhancements
* **Database Scaling**: Dynamic scaling from single-zone RDS to Multi-AZ RDS for automated failover.
* **Static Asset Delivery**: Adding AWS CloudFront CDN distribution rules for static React/Vite frontends to improve edge performance and lower latency.
* **Auto-Scaling Rules**: Exposing Terraform auto-scaling configurations based on CPU/Memory usage triggers.

### Telemetry & Auditing
* **Extended Telemetry**: Structured CloudWatch alert configurations for HTTP 5xx spikes or memory usage threshold warnings.
* **Code Complexity Checks**: Scanning for cyclomatic complexity and large file imports to recommend refactor plans.
* **Load Testing**: Integrating automated load-testing tasks (`k6` or `artillery`) during verification.
