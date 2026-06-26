# Redis Caching & Messaging (ElastiCache Redis)

## Purpose
Determine whether the application needs a distributed, in-memory key-value cache (AWS ElastiCache Redis) for managing session state, application cache caching, pub/sub message brokers, or distributed background job queues.

## When to Use
- Caching slow database queries to reduce RDS load.
- Managing session state across multiple auto-scaled container instances.
- Building background task queues (e.g. BullMQ in Node, Celery in Python).
- WebSockets/real-time streaming needing a pub/sub system to sync messages across multiple server nodes.

## When NOT to Use
- Applications with low read/write volumes where direct database queries are fast enough.
- Single-instance architectures (Hobbyist Tier) where in-memory server cache (e.g., local Node memory) is sufficient.
- Projects on a strict budget (Redis instances start at ~$12/month).

## Strong Indicators
- **WebSocket Packages**: `socket.io`, `ws`, `peerjs` (indicates real-time scaling requirement).
- **Queue Packages**: `bull`, `bullmq`, `celery`, `bee-queue` (requires a backing broker).
- **Session Packages**: `connect-redis`, `express-session` with redis store.

## Trade-offs
- **Pros**:
  - Sub-millisecond response latency.
  - Offloads heavy read traffic from the primary database.
  - Safe distributed concurrency locks and queues.
- **Cons**:
  - Adds cost and network routing complexity (must sit in private VPC subnets).
  - cache-invalidation issues (stale data).
  - Memory-bound limitations (OOM crashes if cache policies aren't managed).

## Operational Complexity
Medium (requires security groups, cluster replication, and VPC subnet placement).

## Approximate Monthly Cost
~$12.00 - $18.00/month baseline (for a single node `cache.t4g.micro` node).
