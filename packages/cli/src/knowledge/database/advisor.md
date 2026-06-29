# SQL Database Hosting Advisor

## Purpose
Determine whether a database is required, and choose between containerized PostgreSQL (on EC2), managed AWS RDS PostgreSQL, or external providers (Supabase, Neon).

## Indicators
- **Database library detected**: SQL database library detected (e.g. prisma, sequelize, drizzle, typeorm).
- **Serverless spikes**: Next.js / Serverless routes trigger connection pool spikes, recommending pgBouncer / RDS Proxy.

## Avoid When
- Avoid managed RDS on low-budget hobbyist servers. Use Docker Postgres container instead.
- Avoid PgBouncer when database connection count remains low (< 50 concurrent connections).

## Trade-offs
### PostgreSQL
- **Pros**: Relational ACID storage, widely supported by ORMs.
- **Cons**: Requires active volume persistence, backups, and migration scripts.
### PgBouncer
- **Pros**: Manages database connection limits, protects RDS pools.
- **Cons**: Adds extra routing infrastructure and setup complexity.

## Migration Triggers
- Upgrade to managed RDS if database size exceeds 20GB or high-availability failover is required.
- Add AWS RDS Proxy (PgBouncer) if concurrent connections exceed 80.

## Confidence Rules
- IF hasDirectDbConnections OR hasFrameworkDb THEN postgresql CONFIDENCE 95
- IF NOT hasDirectDbConnections AND NOT hasFrameworkDb THEN none CONFIDENCE 95
- IF isServerlessSpiky AND postgresql THEN pgbouncer CONFIDENCE 90
