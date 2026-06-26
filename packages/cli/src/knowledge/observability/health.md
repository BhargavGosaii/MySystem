# Observability: Health Checks

## Purpose
Expose a public, unauthenticated health check endpoint (`/health` or `/healthz`) returning a 200 OK status to let load balancers (AWS ALB) and container tasks verify application process vitality.

## Detection Patterns
- Absence of `/health` or `/healthz` route handler registrations in server frameworks.

## Mitigation
- Expose a simple `GET /health` route returning `{"status": "healthy"}` without any authentication middleware.

## Risk Level
High
