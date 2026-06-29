# Traffic Routing & Load Balancer Advisor

## Purpose
Determine if the application requires an Application Load Balancer (ALB) or if direct DNS Elastic IP routing is sufficient.

## Indicators
- **ECS Hosting**: ECS Fargate deployments require an ALB to route traffic to tasks.
- **Multiple containers**: Routing between multiple backend services.

## Avoid When
- Avoid ALB when hosting on a single EC2 instance where direct Elastic IP DNS mapping is simpler and cheaper.

## Trade-offs
### ALB
- **Pros**: SSL/TLS termination, health checks, automatic task routing, scales horizontally.
- **Cons**: High monthly cost (~$15.00/month), complex subnet target group wiring.

## Migration Triggers
- Add an ALB when migrating compute from EC2 to ECS Fargate for auto-scaling containers.

## Confidence Rules
- IF isEcsHosting THEN alb CONFIDENCE 95
- IF NOT isEcsHosting THEN direct CONFIDENCE 95
