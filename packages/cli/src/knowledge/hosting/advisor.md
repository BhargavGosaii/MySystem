# Compute Hosting Platform Advisor

## Purpose
Choose the appropriate AWS compute hosting layer. We weigh operational complexity, budget limits, availability targets, and scaling requirements to pick between a single Virtual Machine running Docker Compose (EC2) and a serverless task orchestrator (ECS Fargate).

## Indicators
- **WebSocket references**: Recommends ECS Fargate to support persistent WebSocket scaling.
- **Queue workers**: Recommends ECS Fargate to decouple long-running backends.

## Avoid When
- Avoid ECS Fargate when on a low monthly budget ($0 to $10/month) or for simple monolithic mockups.
- Avoid EC2 for high-security applications holding sensitive transactional database connections.

## Trade-offs
### EC2
- **Pros**: Lowest monthly cost (~$3.20/month), simple local-like compose troubleshooting, minimal moving parts.
- **Cons**: Single point of failure, manual vertical scaling, hard disk space management.
### ECS Fargate
- **Pros**: Zero server management, horizontal auto-scaling, high availability across multiple zones.
- **Cons**: High baseline cost (~$15.00/month for ALB and CPU task), high configuration complexity.

## Migration Triggers
- Upgrade to ECS Fargate if average CPU exceeds 70% for sustained periods or multiple microservices are introduced.

## Confidence Rules
- IF hasWebsockets OR queueLib THEN ecs-fargate CONFIDENCE 95
- IF NOT hasWebsockets AND NOT queueLib THEN ec2 CONFIDENCE 95
