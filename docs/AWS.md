# AWS Hosting Tiers & Cost Models

All infrastructure is provisioned directly inside your own AWS account using Terraform. There are no proprietary platform markups or hidden fees.

---

## 1. Hobbyist Tier (EC2 + Docker Compose)

This tier is designed to run simple monoliths, APIs, and Single Page Apps at the lowest possible cost, fitting cleanly within the AWS Free Tier.

* **Architecture**: A single EC2 instance with an Elastic IP, running Docker and Docker Compose. The application container and PostgreSQL database container run side-by-side on the same VM.
* **Network**: Deploys into a single public subnet VPC. All inbound web traffic (HTTP/HTTPS) flows directly to the EC2 instance.
* **OOM Safety**: Configures a **2GB swapfile** on boot to prevent database or app crashes during memory spikes.
* **Disk Safety**: Restricts Docker logs to **3 rotated files of 10MB each** to prevent EBS volume exhaustion.
* **Estimated Cost**:
  * **AWS Free Tier (First 12 Months)**: **$0.00 / month** (fits within the standard `t3.micro` EC2 free allocation).
  * **Standard wholesale cost**: **~$3.20 to $8.00 / month** (flat compute and EBS storage fees).

---

## 2. Production Tier (ECS Fargate + RDS + WAF)

This tier is designed for high availability, auto-scaling, and enterprise-grade security.

* **Compute**: AWS ECS Fargate serverless containers running in private subnets behind an Application Load Balancer (ALB).
* **Database**: Managed AWS RDS PostgreSQL instance in private subnets, with daily automatic snapshots and RDS Proxy (PgBouncer) connection pooling.
* **Cache & Queues**: AWS ElastiCache Redis cluster for sub-millisecond caching and background worker tasks.
* **Security & Firewall**: AWS WAF (Web Application Firewall) protecting the ALB from OWASP Top 10 vulnerabilities, bad bot scrapers, and SQL injection payloads.
* **Cost Optimizations**: To avoid the high cost of NAT Gateways (~$32.00/month/gateway), MySystem routes container egress securely using AWS VPC Endpoints where possible, keeping the architecture flat and cost-effective.
* **Estimated Cost**:
  * **AWS Free Tier (First 12 Months)**: **~$17.00 / month** (ALB and RDS allocations are free; Fargate tasks and WAF are billed).
  * **Standard wholesale cost**: **~$45.00 to $65.00 / month** (baseline managed AWS service fees).

---

## 3. Cost Control (AWS Budgets)

Both tiers automatically configure **AWS Budgets alerts** in your account:
* You specify a maximum monthly spend threshold (e.g., $15.00 for Hobbyist or $50.00 for Production).
* If your projected monthly AWS spend exceeds this limit, AWS sends an automatic email alert to the billing email address.
* You can dismantle all resources at any time by telling your AI: *"Use MySystem to destroy the application."*
