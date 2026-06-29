# In-Memory Caching Advisor

## Purpose
Determine if the application requires a dedicated, distributed in-memory cache and message broker (Redis).

## Indicators
- **Queue libraries**: Recommends Redis for managing background workers (e.g. BullMQ, Celery).
- **Socket io scale**: Recommends Redis for event synchronization across multiple WebSocket nodes.

## Avoid When
- Avoid Redis if application caching fits in process memory or only has a single compute instance without background queues.

## Trade-offs
### Redis
- **Pros**: Sub-millisecond read latency, high-throughput pub/sub channels, built-in queue synchronization.
- **Cons**: Adds extra infrastructure dependencies and requires memory eviction configurations.

## Migration Triggers
- Add ElastiCache Redis if background worker queues, heavy session management, or multi-node WebSocket sync are introduced.

## Confidence Rules
- IF hasBullMQ OR hasRedisClient OR hasCelery THEN redis CONFIDENCE 95
- IF NOT hasBullMQ AND NOT hasRedisClient AND NOT hasCelery THEN none CONFIDENCE 95
