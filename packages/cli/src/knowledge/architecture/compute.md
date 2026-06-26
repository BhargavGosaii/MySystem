# Compute Hosting (EC2 vs ECS Fargate)

## Purpose
Select the appropriate compute hosting layer on AWS. We weigh operational complexity, budget constraints, availability targets, and scaling requirements to choose between a single, self-managed Virtual Machine running Docker (EC2) and a serverless, managed container orchestration cluster (ECS Fargate).

## When to Use EC2 (Single Instance)
- Simple monolithic apps (Next.js, FastAPI, Node).
- Estimated active users < 10,000.
- Monthly budget constraint is low (< $10/month).
- Lower operational overhead is preferred (no ECS task definitions or target groups).

## When to Use ECS Fargate
- Microservice architectures or distributed APIs.
- High-availability targets (multi-availability-zone failover is required).
- Unpredictable or high-volume traffic requiring auto-scaling.
- Compliance/security standards require network isolation (containers in private subnets, no direct SSH access).

## When NOT to Use EC2
- High-security applications holding sensitive transactional database connections.
- Mission-critical services where a single instance crash causes unacceptable downtime.

## When NOT to Use ECS Fargate
- Extremely cost-sensitive projects ($0 to $5 monthly budget).
- Very simple mockups or portfolio client demonstrations.

## Heuristics & Indicators
- **Vite React SPA / Static Frontend**: Highly recommends EC2 (`t4g.nano` or static bucket) because static pages have minimal server-side execution needs.
- **FastAPI / Django / Express / NextJS Monolith**: Defaults to EC2 for starting tiers, migrating to ECS Fargate if traffic scaling is required.

## Trade-offs
### EC2
- **Pros**:
  - Lowest monthly cost ($0 on Free Tier, ~$3.20/month baseline).
  - Simple local-like Docker Compose troubleshooting.
  - Minimal moving parts.
- **Cons**:
  - Single point of failure (no automatic load-balancing recovery).
  - Manual vertical scaling (requires resizing instance types, leading to brief downtime).
  - Hard disk space management (Docker logs and build caches can fill up disk).

### ECS Fargate
- **Pros**:
  - Zero server management (no OS updates, server patching, or disk cleanups).
  - Auto-scaling out-of-the-box (scales tasks horizontally based on CPU/RAM usage).
  - High availability (deploys tasks dynamically across multiple availability zones).
- **Cons**:
  - High baseline cost (~$15/month for Load Balancer + Fargate baseline execution).
  - High operational complexity (requires container registry, load balancer, target groups, IAM task execution roles).

## Operational Complexity
- **EC2**: Low (resembles standard Docker VPS).
- **ECS Fargate**: High (requires complex IAM, networking, security groups, and ALB configuration).

## Approximate Monthly Cost
- **EC2**: ~$3.20/month (for `t4g.nano` with 15GB SSD) or $0.00 (AWS Free Tier).
- **ECS Fargate**: ~$15.00 - $25.00/month baseline (primarily driven by ALB and minimal CPU task allocation).
