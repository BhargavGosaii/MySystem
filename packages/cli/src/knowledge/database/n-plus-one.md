# Database: N+1 Query Patterns

## Purpose
Identify and eliminate N+1 query patterns where an application makes multiple individual round-trips to the database to fetch related entities in a loop, rather than fetching them in a single batch query (using SQL joins or batch fetches).

## Detection Patterns
- Executing database queries (`db.query`, `prisma.find`, ORM fetches) inside loop statements (`for`, `while`, `map`, `forEach`).

## Code Smells
- `users.map(async (u) => { const profile = await db.profiles.find({ userId: u.id }); ... })`
- `for (let item of items) { await db.query("SELECT * FROM ... WHERE id = $1", [item.id]); }`

## Strong Indicators
- High latency on list endpoints.
- Database logs showing repeated duplicate query structures with varying ID parameters.

## Mitigation
- Eager load relations using ORM join directives (e.g. `include` in Prisma, `relations` in TypeORM).
- Batch requests using dataloaders or batch query techniques.

## Verification Checklist
- [ ] No database operations are invoked inside loop bodies or iterator callbacks.

## Risk Level
Medium
