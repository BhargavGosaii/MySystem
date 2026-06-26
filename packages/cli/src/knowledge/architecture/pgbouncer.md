# PgBouncer Connection Pooling (AWS RDS Proxy)

## Purpose
Determine if the application requires a database connection pooler/proxy (such as AWS RDS Proxy or PgBouncer) to prevent database connection exhaustion under load. This is especially relevant in serverless or highly distributed compute clusters where the number of active connection points scales dynamically.

## When to Use
- Applications deployed on serverless or auto-scaled environments (e.g. Next.js serverless functions, ECS Fargate with high task scaling) that connect directly to PostgreSQL.
- Heavy concurrent traffic patterns resulting in parallel database client connections exceeding 80.
- High connection churn (applications connecting and disconnecting frequently rather than reusing long-lived connections).

## When NOT to Use
- Single-instance monolithic backends (Hobbyist Tier EC2) which run a single process. Long-lived application processes utilize internal connection pools (like Prisma's pool or pg-pool) which manage connection counts safely inside memory.
- Non-PostgreSQL databases (e.g., MySQL, DynamoDB, MongoDB) which have different scaling dynamics or managed drivers.
- Cost-sensitive deployments (AWS RDS Proxy baseline is ~$15/month).

## Strong Indicators
- **Serverless Frameworks**: Next.js API route connections, AWS Lambda functions connecting directly to PostgreSQL.
- **ORM libraries connection count warnings**: logs showing `TimeoutError: Queue timeout` or database errors like `FATAL: sorry, too many clients already`.

## Trade-offs
- **Pros**:
  - Prevents "Too Many Clients" database crashes.
  - Allows the application to scale tasks horizontally without worrying about connection caps.
- **Cons**:
  - Session-level features (like temporary tables, prepared statements, or transaction-level locks) can behave unexpectedly in transaction/statement pooling mode.
  - Adds network latency (introduces an intermediate proxy hop).
  - Extra billing footprint.

## Operational Complexity
Medium (requires configuring database credentials in AWS Secrets Manager, IAM access permissions, and VPC routing).

## Approximate Monthly Cost
~$15.00/month baseline (varies based on the underlying RDS database instance vCPU sizing).
