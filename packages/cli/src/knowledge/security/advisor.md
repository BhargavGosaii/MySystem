# Firewall & Security Shield Advisor

## Purpose
Determine if the application requires an active Web Application Firewall (AWS WAF) and Shield to protect public endpoints.

## Indicators
- **Auth packages**: Recommends WAF to protect auth endpoints (e.g. NextAuth, passport) when database is present.
- **Sensitive inputs**: Public forms with write access to SQL databases.

## Avoid When
- Avoid WAF when hosting simple static websites, portfolios, or APIs without writeable user auth databases.

## Trade-offs
### WAF
- **Pros**: Protects against SQL injection, cross-site scripting (XSS), rate limits bots and DDoS attempts.
- **Cons**: Adds latency, high baseline cost (~$12.00/month per ACL), complex false-positive rule management.

## Migration Triggers
- Enable AWS WAF when public user auth, payment processors, or public APIs are added.

## Confidence Rules
- IF hasAuthAndDb THEN waf CONFIDENCE 90
- IF NOT hasAuthAndDb THEN none CONFIDENCE 95
