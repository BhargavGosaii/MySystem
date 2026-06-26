# Database Connection Pooling

## Purpose
Ensure that database connection resources are pooled and recycled rather than creating new TCP connections for every request, which leads to socket exhaustion and high database CPU usage.

## Detection Patterns
- Creating database clients inside route handler callbacks.
- Opening connection pools on every invocation.

## Code Smells
- `app.get("/users", async (req, res) => { const client = new Client(); await client.connect(); ... })`

## Mitigation
- Instantiate a single, shared connection pool globally on application startup.
- Reuse connections across requests.
- Limit max pool connections.

## Risk Level
High
