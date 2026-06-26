# Frequently Asked Questions (FAQ)

## 1. What is MySystem?
MySystem is an **open-source Production Engineering Standard for AI coding agents deploying to AWS**. It bridges the gap between application development and cloud operations. It acts as a standard guide and verification system that audits your code, automatically applies safe boilerplate fixes (like container port mappings or health endpoints), and verifies deployments directly in your own AWS account using standard tools (Terraform, Docker, and GitHub Actions).

---

## 2. Why is MySystem described as a "Production Engineering Standard"?
Traditional CI/CD tools are passive pipelines: they run whatever scripts you write, and if a deployment fails, they leave it to you to debug. 

MySystem is active. It establishes a set of guidelines and verification checks that AI coding agents follow. It inspects your project, performs a comprehensive engineering review, corrects configuration deficiencies (such as updating hardcoded ports, generating health checks, or setting up Dockerfiles), and validates the deployment. It acts as your codebase's built-in DevOps auditor.

---

## 3. How does pricing work?
Unlike traditional PaaS providers (e.g., Heroku, Render) or modern developer platforms (e.g., Vercel) that charge marked-up premium fees for compute and bandwidth, MySystem deploys **directly to your own AWS account**.

* **Wholesale AWS Billing**: You pay AWS directly for the resources you consume (EC2 instances, Load Balancers, ECS, S3, etc.). There are no middleman markups.
* **Hobbyist Tier Friendly**: MySystem supports cost-optimized hosting tiers, including the **AWS Free Tier** (e.g., running on a `t3.micro` EC2 instance with Docker Compose) or cost-effective ARM instances like `t4g.nano` (~$3.20/month).
* **No Subscription for Basic Deploys**: Since the infrastructure runs in your own account, once deployed, it continues running even if you never use MySystem again.

---

## 4. How are Custom Domains and HTTPS certificates managed?
MySystem handles domain routing and SSL/TLS certificates automatically:
* **Route 53**: If your domain is managed via AWS Route 53, MySystem can automatically provision DNS records.
* **AWS Certificate Manager (ACM)**: MySystem requests and validates free SSL/TLS certificates from ACM, attaching them to the Load Balancer or CloudFront distribution.
* **Automatic Renewal**: ACM automatically renews certificates, so your site will never experience downtime due to expired SSL certs.

---

## 5. Is there vendor lock-in?
**No.** This is a core philosophy of MySystem: **Zero SaaS Lock-in**.
* All infrastructure is provisioned using standard **Terraform** files.
* All deployments run via standard **GitHub Actions** workflows.
* Your code is containerized using standard **Dockerfiles**.

If you decide to stop using MySystem, your application remains fully functional, and you can manage the infrastructure yourself using the generated Terraform configurations in your repository.

---

## 6. What stack and frameworks does MySystem support?
MySystem supports any containerized application. Its AI review engine is especially optimized for:
* **Node.js / TypeScript / JavaScript** (Express, NestJS, Next.js, Fastify)
* **Python** (FastAPI, Flask, Django)
* **Go** (Gin, Fiber)
* **Static Sites** (Vite, React, Vue, Svelte)

---

## 7. How does MySystem handle database migrations?
MySystem separates database migrations from application startup to support safe container scaling:
* During deployment, MySystem executes database migrations as a single-run step or container run.
* This prevents multiple container instances from running migrations concurrently, which can cause database locks or data corruption.
* We recommend designing database changes to be backward-compatible (e.g., two-stage migrations for column deprecations) so that zero-downtime rolling updates can occur.
