# Edge WAF Security & CDN (AWS WAF & CloudFront)

## Purpose
Determine if the application requires edge protection (AWS WAF) and caching CDN (CloudFront) to shield servers, mitigate DDoS/bot traffic, and filter malicious request payloads before reaching the compute cluster.

## When to Use
- Applications storing user transactional data, credentials, or PII.
- High public visibility APIs that are target for crawlers, scrapers, or DDoS attacks.
- High compliance environments (SOC2, PCI-DSS) requiring firewalls and access control logging.
- Global user bases where latency can be reduced by serving static assets from CloudFront edge locations.

## When NOT to Use
- Internal test tools, CLI helpers, or microservices inside a private VPC.
- Budget-constrained startup projects (AWS WAF has baseline costs around ~$8.00/month).
- Pure backend APIs where static asset delivery isn't needed and direct routing via ALB handles traffic.

## Heuristics & Indicators
- Database packages and public auth routes (requires SQLi / scripting bots filter shields).
- Environment flags requesting high security levels (`waf-shielded`).

## Trade-offs
- **Pros**:
  - Automatically filters SQL injections and cross-site scripting (XSS).
  - Shields the backend (EC2/ECS) from direct DDoS attacks.
  - Offloads SSL handshake overhead from the application server.
- **Cons**:
  - WAF has a flat monthly fee regardless of traffic volume.
  - Configuring DNS, edge rules, and SSL validation adds deployment time.
  - Potential false positives (e.g., blocking valid API requests that look like exploits).

## Operational Complexity
Medium to High (requires Route 53 DNS zone access, custom certificate validation, and request log audits).

## Approximate Monthly Cost
~$1.00 - $8.00/month (WAF rules baseline charge + CloudFront usage data costs).

## Confidence Rules
- IF hasDatabase THEN true CONFIDENCE 85
- IF NOT hasDatabase THEN false CONFIDENCE 75
